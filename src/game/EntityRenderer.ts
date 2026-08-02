import * as THREE from 'three';
import { EntityStore, EntityType } from './EntityStore';

// Scratch objects: the sync path runs every frame and must not allocate.
const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

/**
 * Renders every entity of one visual type as a single instanced draw.
 *
 * Three.js Sprites are one object and one draw call each, which does not survive
 * contact with thousands of entities. These are instanced quads turned toward
 * the camera in the vertex shader, so the whole population costs one draw call
 * regardless of size.
 */
export class EntityRenderer {
  public mesh: THREE.InstancedMesh;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.MeshBasicMaterial;
  private renderedType: EntityType;

  constructor(texture: THREE.Texture, renderedType: EntityType, capacity = 1024) {
    this.renderedType = renderedType;
    this.geometry = new THREE.PlaneGeometry(1, 1);

    // Alpha cutout, not alpha blending: the same reason foliage keeps
    // transparent:false. A blended billboard would need sorting and would lose
    // early-Z for no visual gain on hard-edged pixel art.
    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: false,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    // Billboard in the vertex shader. The instance matrix carries position and
    // scale; the quad's own vertices are swung onto the camera's right/up axes.
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        vec3 instanceOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float sx = instanceMatrix[0][0];
        float sy = instanceMatrix[1][1];
        vec3 transformed = instanceOrigin + camRight * (position.x * sx) + camUp * (position.y * sy);
        `
      );
      // `transformed` is already in world space, so skip the usual
      // instanceMatrix/modelMatrix multiply. mvPosition still has to be declared:
      // later chunks read it (the fog chunk does `-mvPosition.z`), and omitting
      // it fails to compile rather than degrading.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        vec4 mvPosition = viewMatrix * vec4( transformed, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        `
      );
    };
    this.material.customProgramCacheKey = () => 'entity-billboard-v1';

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.name = `EntityBillboards_${renderedType}`;
    this.mesh.frustumCulled = false; // bounds change every frame; culled per chunk instead
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
  }

  /**
   * Copy live entity transforms into the instance buffer.
   * Walks the store's columns directly; allocates nothing.
   */
  public sync(store: EntityStore): void {
    // Count first so the instance buffer can be grown to fit. Silently drawing
    // only the first N entities would be a rendering bug that looks like a
    // gameplay one.
    let needed = 0;
    for (let i = 0; i < store.highWater; i++) {
      if (store.isSlotAlive(i) && store.type[i] === this.renderedType) needed++;
    }
    if (needed > this.mesh.instanceMatrix.count) {
      this.resize(Math.max(needed, this.mesh.instanceMatrix.count * 2));
    }

    const capacity = this.mesh.instanceMatrix.count;
    let written = 0;

    _quat.identity();

    for (let i = 0; i < store.highWater && written < capacity; i++) {
      if (!store.isSlotAlive(i)) continue;
      if (store.type[i] !== this.renderedType) continue;

      const scale = store.scale[i];
      _pos.set(store.x[i], store.y[i], store.z[i]);
      _scale.set(scale * 0.95, scale * 1.35, 1);
      _mat.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(written, _mat);
      written++;
    }

    this.mesh.count = written;
    if (written > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Rebuild the instance buffer at a larger capacity, preserving scene position. */
  private resize(capacity: number): void {
    const parent = this.mesh.parent;
    parent?.remove(this.mesh);
    this.mesh.dispose();

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.name = `EntityBillboards_${this.renderedType}`;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    parent?.add(this.mesh);
  }

  public dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
