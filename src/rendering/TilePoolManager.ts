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
   * Get or create a cached BoxGeometry with top face UVs mapped to spriteIndex in 16x16 atlas
   */
  public getBlockGeometry(width: number, height: number, depth: number, spriteIndex: number): THREE.BoxGeometry {
    const key = `box_${width.toFixed(2)}_${height.toFixed(2)}_${depth.toFixed(2)}_${spriteIndex}`;
    if (this.geometryCache.has(key)) {
      return this.geometryCache.get(key) as THREE.BoxGeometry;
    }

    const geo = new THREE.BoxGeometry(width, height, depth);
    const uvs = geo.attributes.uv.array as Float32Array;

    const col = spriteIndex % 16;
    const row = Math.floor(spriteIndex / 16);

    const eps = 0.0001; // Avoid subpixel boundary bleeding in NearestFilter
    const u0 = col / 16 + eps;
    const u1 = (col + 1) / 16 - eps;
    const v0 = 1 - (row + 1) / 16 + eps;
    const v1 = 1 - row / 16 - eps;

    // Face 2 (+Y top face) UVs: indices 16..23
    uvs[16] = u0; uvs[17] = v1;
    uvs[18] = u1; uvs[19] = v1;
    uvs[20] = u0; uvs[21] = v0;
    uvs[22] = u1; uvs[23] = v0;

    geo.attributes.uv.needsUpdate = true;
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

    this.materialCache.set(key, mat);
    return mat;
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
