import * as THREE from 'three';
import { SpritePackType } from '../types';
import { getSpriteAtlasTexture, clearSpriteAtlasCache } from '../utils/sprites';
import { createOakTreeModel, createPineTreeModel, createBushModel, createMushroomModel, TreeModelAssets, USE_3D_SPRITE_TREES } from '../utils/treeModels';

/**
 * TilePoolManager
 * Responsible for GPU object pooling, texture/material caching, and explicit resource lifecycle management.
 */
export class TilePoolManager {
  private static instance: TilePoolManager | null = null;

  // Shared geometry cache
  private geometryCache = new Map<string, THREE.BufferGeometry>();

  // Shared material cache
  private materialCache = new Map<string, THREE.Material>();

  // Shared shader clock. Water animation is performed in the existing terrain
  // batch, so it adds no meshes or draw calls.
  private waterTimeUniform = { value: 0 };

  // Shared InstancedMesh pool
  private instancedMeshPool: THREE.InstancedMesh[] = [];

  // Tree model assets cache per sprite pack
  private treeModelCache = new Map<string, TreeModelAssets>();

  public static getInstance(): TilePoolManager {
    if (!TilePoolManager.instance) {
      TilePoolManager.instance = new TilePoolManager();
    }
    return TilePoolManager.instance;
  }

  /**
   * Unit block used by the GPU-driven terrain batch.
   *
   * BoxGeometry normally has six material groups, which means six draw calls even
   * when five faces share one material. Reordering the index buffer lets all five
   * side/bottom faces render in one call and the atlas-mapped top render in a second.
   * Per-instance matrices provide height and per-instance attributes select sprites.
   */
  public getBatchedBlockGeometry(): THREE.BoxGeometry {
    const key = 'batched_block_unit_v1';
    if (this.geometryCache.has(key)) {
      return this.geometryCache.get(key) as THREE.BoxGeometry;
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const sourceIndex = geo.index;
    if (!sourceIndex) {
      throw new Error('Batched block geometry requires indexed BoxGeometry');
    }

    const original = Array.from(sourceIndex.array);
    const sideIndices: number[] = [];
    const topIndices: number[] = [];

    for (const group of geo.groups) {
      const target = group.materialIndex === 2 ? topIndices : sideIndices;
      for (let i = group.start; i < group.start + group.count; i++) {
        target.push(original[i]);
      }
    }

    geo.setIndex([...sideIndices, ...topIndices]);
    geo.clearGroups();
    geo.addGroup(0, sideIndices.length, 0);
    geo.addGroup(sideIndices.length, topIndices.length, 1);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    this.geometryCache.set(key, geo);
    return geo;
  }

  /**
   * Get dark stone/dirt side material (shared across all blocks)
   */
  public getOpaqueSideMaterial(): THREE.MeshStandardMaterial {
    const key = 'opaque_side_mat';
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key) as THREE.MeshStandardMaterial;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      roughness: 0.9,
      metalness: 0.1,
    });
    this.materialCache.set(key, mat);
    return mat;
  }

  /**
   * Get atlas top material for a given sprite pack
   */
  public getTopAtlasMaterial(packId: SpritePackType): THREE.MeshStandardMaterial {
    const key = `top_atlas_mat_${packId}`;
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key) as THREE.MeshStandardMaterial;
    }

    const atlasTexture = getSpriteAtlasTexture(packId);
    const mat = new THREE.MeshStandardMaterial({
      map: atlasTexture,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0.1,
    });

    // Select the 16x16 atlas cell in the shader from an InstancedBufferAttribute.
    // This is the key that allows every terrain sprite and height to share one mesh.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.waterTime = this.waterTimeUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float instanceSpriteIndex;\nvarying float vInstanceSpriteIndex;'
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvInstanceSpriteIndex = instanceSpriteIndex;'
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vInstanceSpriteIndex;\nuniform float waterTime;'
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            float atlasIndex = floor(vInstanceSpriteIndex + 0.5);
            float atlasColumn = mod(atlasIndex, 16.0);
            float atlasRow = floor(atlasIndex / 16.0);
            vec2 localUv = clamp(vMapUv, 0.0016, 0.9984);
            float isWater = step(7.5, atlasIndex) * (1.0 - step(9.5, atlasIndex));

            // Animate in whole texels and whole frames. The staggered rows make
            // little wavelets while preserving the deliberately chunky 8x8 look.
            float waterFrame = floor(waterTime * 4.0);
            vec2 waterPixel = floor(localUv * 8.0);
            float rowStagger = floor(waterPixel.y * 0.5);
            waterPixel.x = mod(waterPixel.x + waterFrame + rowStagger, 8.0);
            waterPixel.y = mod(waterPixel.y + floor(waterFrame * 0.25), 8.0);
            vec2 animatedUv = (waterPixel + 0.5) / 8.0;
            localUv = mix(localUv, animatedUv, isWater);

            vec2 atlasUv = vec2(
              (atlasColumn + localUv.x) / 16.0,
              (15.0 - atlasRow + localUv.y) / 16.0
            );
            vec4 sampledDiffuseColor = texture2D(map, atlasUv);

            // Sparse, frame-stepped glints give the water a little extra pop.
            float glintPattern = mod(waterPixel.x + waterPixel.y * 3.0 + floor(waterFrame * 0.5), 11.0);
            float glint = isWater * (1.0 - step(0.5, glintPattern));
            sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, min(vec3(1.0), sampledDiffuseColor.rgb * 1.3 + vec3(0.02, 0.08, 0.12)), glint * 0.75);
            diffuseColor *= sampledDiffuseColor;
          #endif`
        );
    };
    mat.customProgramCacheKey = () => 'instanced-atlas-water-v2';

    this.materialCache.set(key, mat);
    return mat;
  }

  public updateWaterAnimation(time: number): void {
    this.waterTimeUniform.value = time;
  }

  /**
   * Clear tree model cache to allow instant hot-swapping between model modes
   */
  public clearTreeModelCache(): void {
    this.treeModelCache.forEach((model) => {
      model.geometry.dispose();
      model.materials.forEach((m) => m.dispose());
    });
    this.treeModelCache.clear();
  }

  /**
   * Get or create tree model assets
   */
  public getTreeModel(type: 'oak' | 'pine' | 'bush' | 'mushroom', packId: SpritePackType): TreeModelAssets {
    const modeKey = USE_3D_SPRITE_TREES ? 'sprite' : 'mesh';
    const key = `${type}_${packId}_${modeKey}`;
    if (this.treeModelCache.has(key)) {
      return this.treeModelCache.get(key)!;
    }

    let model: TreeModelAssets;
    if (type === 'oak') model = createOakTreeModel(packId);
    else if (type === 'pine') model = createPineTreeModel(packId);
    else if (type === 'bush') model = createBushModel(packId);
    else model = createMushroomModel(packId);

    this.treeModelCache.set(key, model);
    return model;
  }

  /**
   * Acquire or create an InstancedMesh container
   */
  public acquireInstancedMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    count: number
  ): THREE.InstancedMesh {
    const targetMat = Array.isArray(material) && material.length === 1 ? material[0] : material;
    const mesh = new THREE.InstancedMesh(geometry, targetMat, count);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    return mesh;
  }

  /**
   * Release an InstancedMesh to pool or dispose if unneeded
   */
  public releaseInstancedMesh(mesh: THREE.InstancedMesh): void {
    mesh.removeFromParent();
    mesh.count = 0;
  }

  /**
   * Full disposal of GPU resources to prevent memory leaks
   */
  public disposeAll(): void {
    this.geometryCache.forEach((geo) => geo.dispose());
    this.geometryCache.clear();

    this.materialCache.forEach((mat) => mat.dispose());
    this.materialCache.clear();

    this.treeModelCache.forEach((model) => {
      model.geometry.dispose();
      model.materials.forEach((m) => m.dispose());
    });
    this.treeModelCache.clear();

    this.instancedMeshPool.forEach((mesh) => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.instancedMeshPool = [];

    clearSpriteAtlasCache();
  }
}
