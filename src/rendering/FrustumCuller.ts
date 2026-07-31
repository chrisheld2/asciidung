import * as THREE from 'three';

// Module-scoped scratchpad objects for zero-allocation frustum culling
const _tempFrustum = new THREE.Frustum();
const _tempProjScreenMatrix = new THREE.Matrix4();

export interface SpatialChunk {
  chunkX: number;
  chunkZ: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  group: THREE.Group;
  bounds: THREE.Box3;
}

/**
 * FrustumCuller
 * Spatial indexing and viewport chunk culling engine with zero per-frame garbage collection.
 */
export class FrustumCuller {
  public chunkSize: number;
  public chunks: SpatialChunk[];

  constructor(chunkSize = 16) {
    this.chunkSize = chunkSize;
    this.chunks = [];
  }

  /**
   * Initialize or update spatial chunks for a given world dimension
   */
  public createChunks(
    cols: number,
    rows: number,
    centerX: number,
    centerZ: number,
    maxHeight = 40
  ): SpatialChunk[] {
    this.chunks = [];

    const numChunksX = Math.ceil(cols / this.chunkSize);
    const numChunksZ = Math.ceil(rows / this.chunkSize);

    // Covers the widest scaled tree sprite without making adjacent chunks overlap excessively.
    const paddingMargin = 2.0;

    for (let cz = 0; cz < numChunksZ; cz++) {
      for (let cx = 0; cx < numChunksX; cx++) {
        const startC = cx * this.chunkSize;
        const endC = Math.min(cols, (cx + 1) * this.chunkSize);
        const startR = cz * this.chunkSize;
        const endR = Math.min(rows, (cz + 1) * this.chunkSize);

        const minX = startC - centerX - 0.5 - paddingMargin;
        const maxX = endC - centerX - 0.5 + paddingMargin;
        const minZ = startR - centerZ - 0.5 - paddingMargin;
        const maxZ = endR - centerZ - 0.5 + paddingMargin;
        const minY = -100.0;
        const maxY = 250.0;

        const bounds = new THREE.Box3(
          new THREE.Vector3(minX, minY, minZ),
          new THREE.Vector3(maxX, maxY, maxZ)
        );

        const group = new THREE.Group();
        group.name = `Chunk_${cx}_${cz}`;

        this.chunks.push({
          chunkX: cx,
          chunkZ: cz,
          minX: startC - centerX - 0.5,
          maxX: endC - centerX - 0.5,
          minZ: startR - centerZ - 0.5,
          maxZ: endR - centerZ - 0.5,
          minY,
          maxY,
          group,
          bounds,
        });
      }
    }

    return this.chunks;
  }

  /**
   * Update chunk visibility based on active camera frustum.
   * ABSOLUTELY ZERO GC ALLOCATIONS IN THIS FUNCTION.
   */
  public updateVisibility(camera: THREE.Camera): void {
    if (this.chunks.length === 0) return;

    _tempProjScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _tempFrustum.setFromProjectionMatrix(_tempProjScreenMatrix);

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      chunk.group.visible = _tempFrustum.intersectsBox(chunk.bounds);
    }
  }
}
