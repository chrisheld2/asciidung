import * as THREE from 'three';
import { SpritePackType } from '../types';
import { SPRITE_PACKS } from './spriteDefs';
import { multiOctaveNoise2D } from './worldGen';
import { TileDataEngine, BLOCK_ID_MOUNTAIN_HIGH, isMountainBlock } from '../rendering/TileData';

export interface MountainCluster {
  cells: Set<number>; // r * cols + c
  cellList: Array<{ r: number; c: number; blockId: number; height: number }>;
}

/**
 * Group contiguous mountain cells into connected clusters using 4-directional BFS.
 *
 * Keys are integers rather than `r,c` strings, and the frontier is a typed ring
 * buffer rather than an array with shift(). The previous version allocated two
 * strings per cell visit and paid O(n) per dequeue, which made this quadratic in
 * the number of mountain tiles.
 */
export function findMountainClusters(tileEngine: TileDataEngine): MountainCluster[] {
  const rows = tileEngine.rows;
  const cols = tileEngine.cols;
  const total = rows * cols;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const clusters: MountainCluster[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = r * cols + c;
      if (visited[start] || !isMountainBlock(tileEngine.blockTypeIds[start])) {
        continue;
      }

      const clusterCells = new Set<number>();
      const cellList: MountainCluster['cellList'] = [];
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      while (head < tail) {
        const current = queue[head++];
        const currR = (current / cols) | 0;
        const currC = current - currR * cols;
        clusterCells.add(current);
        cellList.push({
          r: currR,
          c: currC,
          blockId: tileEngine.blockTypeIds[current],
          height: tileEngine.heights[current],
        });

        for (let n = 0; n < 4; n++) {
          const nr = currR + (n === 0 ? -1 : n === 1 ? 1 : 0);
          const nc = currC + (n === 2 ? -1 : n === 3 ? 1 : 0);
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

          const nKey = nr * cols + nc;
          if (!visited[nKey] && isMountainBlock(tileEngine.blockTypeIds[nKey])) {
            visited[nKey] = 1;
            queue[tail++] = nKey;
          }
        }
      }

      clusters.push({ cells: clusterCells, cellList });
    }
  }

  return clusters;
}

// Convert hex color string into RGB tuple [r, g, b] (0..1)
function hexToRGB(hex: string): [number, number, number] {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  return [(num >> 16 & 255) / 255, (num >> 8 & 255) / 255, (num & 255) / 255];
}

// Generate height map value for any continuous grid coordinate (x, z)
function getMountainHeightAt(
  x: number,
  z: number,
  tileEngine: TileDataEngine,
  centerX: number,
  centerZ: number,
  seed = 42
): number {
  // Convert centered world position back to grid indices
  const gridC = Math.floor(x + centerX);
  const gridR = Math.floor(z + centerZ);

  let baseH = 0.2;
  if (isMountainBlock(tileEngine.blockAt(gridR, gridC))) {
    baseH = tileEngine.heightAt(gridR, gridC);
  }

  // Multi-octave mountain peak & ridge noise displacement
  const n1 = multiOctaveNoise2D(x * 0.18, z * 0.18, 4, 0.55, seed);
  const n2 = Math.abs(multiOctaveNoise2D(x * 0.35 + 10, z * 0.35 + 10, 3, 0.5, seed + 99));

  // Sharp mountain ridge function: 1 - |2*n - 1|
  const ridge = 1.0 - Math.abs(2.0 * n1 - 1.0);

  // Peak elevation displacement
  const noiseDisplacement = (ridge * 1.8 + n2 * 1.2) * (baseH * 0.45);
  return Math.max(0.1, baseH + noiseDisplacement);
}

interface MountainPalette {
  rgbBase: [number, number, number];
  rgbRock: [number, number, number];
  rgbHighlight: [number, number, number];
  rgbPeakSnow: [number, number, number];
}

// Resolve the pack palette once per build. This used to run a SPRITE_PACKS
// lookup and four hex parses for every vertex of every triangle.
function getMountainPalette(packId: SpritePackType): MountainPalette {
  const pack = SPRITE_PACKS.find((p) => p.id === packId) || SPRITE_PACKS[0];
  const colors = pack.colors;
  return {
    rgbBase: hexToRGB(colors.r2 || '#334155'), // Dark slate / base
    rgbRock: hexToRGB(colors.r1 || '#64748b'), // Mid rock grey
    rgbHighlight: hexToRGB(colors.r3 || '#cbd5e1'), // Snowcap / light peak
    rgbPeakSnow: [1, 1, 1], // Pure white snowcaps
  };
}

// Calculate color based on vertex height, slope, and active sprite pack palette.
// Writes into `out` so the per-vertex hot path allocates nothing.
function getLowPolyMountainColor(
  height: number,
  maxHeight: number,
  normalY: number,
  palette: MountainPalette,
  out: [number, number, number]
): [number, number, number] {
  const { rgbBase, rgbRock, rgbHighlight, rgbPeakSnow } = palette;

  // Height ratio between 0 and 1
  const hRatio = Math.min(1, Math.max(0, height / (maxHeight || 4.5)));

  // Steep cliff faces (low normalY) get darker rock color
  const isSteep = normalY < 0.65;

  let r: number, g: number, b: number;

  if (hRatio > 0.72 && !isSteep) {
    // Snowcap region
    const t = (hRatio - 0.72) / 0.28;
    r = rgbHighlight[0] * (1 - t) + rgbPeakSnow[0] * t;
    g = rgbHighlight[1] * (1 - t) + rgbPeakSnow[1] * t;
    b = rgbHighlight[2] * (1 - t) + rgbPeakSnow[2] * t;
  } else if (hRatio > 0.38) {
    // Rocky upper slopes
    const t = (hRatio - 0.38) / 0.34;
    const fromCol = isSteep ? rgbBase : rgbRock;
    r = fromCol[0] * (1 - t) + rgbHighlight[0] * t;
    g = fromCol[1] * (1 - t) + rgbHighlight[1] * t;
    b = fromCol[2] * (1 - t) + rgbHighlight[2] * t;
  } else {
    // Mountain base & foothills
    const t = hRatio / 0.38;
    r = rgbBase[0] * (1 - t) + rgbRock[0] * t;
    g = rgbBase[1] * (1 - t) + rgbRock[1] * t;
    b = rgbBase[2] * (1 - t) + rgbRock[2] * t;
  }

  // Add subtle color jitter per facet for enhanced low-poly depth
  const jitter = (Math.sin(height * 12.3 + normalY * 17.1) * 0.04);
  out[0] = Math.min(1, Math.max(0, r + jitter));
  out[1] = Math.min(1, Math.max(0, g + jitter));
  out[2] = Math.min(1, Math.max(0, b + jitter));

  return out;
}

/**
 * Build the low-poly mountain mesh for one rectangular region of the grid.
 *
 * Clusters are found once for the whole world and passed in, because skirt
 * generation needs to know whether a neighbour belongs to the same cluster even
 * when that neighbour sits in another chunk. Only tiles inside [minR, maxR) x
 * [minC, maxC) contribute geometry, so each chunk can build and cull its own
 * mountains, and a large world can build them a chunk at a time.
 *
 * Returns null when the region contains no mountain tiles.
 */
export function buildMountainMeshForRegion(
  tileEngine: TileDataEngine,
  clusters: MountainCluster[],
  packId: SpritePackType,
  minR: number,
  maxR: number,
  minC: number,
  maxC: number,
  seed = 42
): THREE.Mesh | null {
  const rows = tileEngine.rows;
  const cols = tileEngine.cols;
  const centerX = cols / 2 - 0.5;
  const centerZ = rows / 2 - 0.5;

  if (clusters.length === 0) return null;

  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];

  const palette = getMountainPalette(packId);
  // Scratch colour tuples, reused for every triangle.
  const col1: [number, number, number] = [0, 0, 0];
  const col2: [number, number, number] = [0, 0, 0];
  const col3: [number, number, number] = [0, 0, 0];

  // Emit one flat-shaded triangle. Explicit pushes rather than spreads: the
  // spread form allocated an iterator per vertex, three times per triangle.
  const pushTriangle = (
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    maxH: number
  ) => {
    const ax = p2[0] - p1[0], ay = p2[1] - p1[1], az = p2[2] - p1[2];
    const bx = p3[0] - p1[0], by = p3[1] - p1[1], bz = p3[2] - p1[2];

    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    getLowPolyMountainColor(p1[1], maxH, ny, palette, col1);
    getLowPolyMountainColor(p2[1], maxH, ny, palette, col2);
    getLowPolyMountainColor(p3[1], maxH, ny, palette, col3);

    positions.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    colors.push(col1[0], col1[1], col1[2], col2[0], col2[1], col2[2], col3[0], col3[1], col3[2]);
  };

  // Vertex position cache helper to ensure continuous vertex coordinates on grid junctions
  function getVertexPos(x: number, z: number): [number, number, number] {
    // Deterministic vertex jitter for organic low-poly facet shapes (except grid boundary edges)
    const isBoundaryX = x <= -centerX || x >= cols - centerX;
    const isBoundaryZ = z <= -centerZ || z >= rows - centerZ;

    let jitterX = 0;
    let jitterZ = 0;
    if (!isBoundaryX && !isBoundaryZ) {
      const hash = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
      jitterX = ((hash - Math.floor(hash)) - 0.5) * 0.18;
      jitterZ = ((Math.cos(x * 34.1 + z * 51.3) + 1) / 2 - 0.5) * 0.18;
    }

    const vx = x + jitterX;
    const vz = z + jitterZ;
    const vy = getMountainHeightAt(vx, vz, tileEngine, centerX, centerZ, seed);
    return [vx, vy, vz];
  }

  // Iterate over each mountain cluster
  clusters.forEach((cluster) => {
    // Process each tile in the cluster
    cluster.cellList.forEach(({ r, c, blockId }) => {
      if (r < minR || r >= maxR || c < minC || c >= maxC) return;
      const worldX = c - centerX;
      const worldZ = r - centerZ;

      // Tile corners
      const x0 = worldX - 0.5;
      const x1 = worldX + 0.5;
      const z0 = worldZ - 0.5;
      const z1 = worldZ + 0.5;

      // 4 corner vertices
      const v00 = getVertexPos(x0, z0); // top-left
      const v10 = getVertexPos(x1, z0); // top-right
      const v11 = getVertexPos(x1, z1); // bottom-right
      const v01 = getVertexPos(x0, z1); // bottom-left

      // Center apex vertex for sharp low-poly peak fan
      const avgY = (v00[1] + v10[1] + v11[1] + v01[1]) / 4;
      const apexBoost = blockId === BLOCK_ID_MOUNTAIN_HIGH ? 0.6 : 0.35;
      const vCenter: [number, number, number] = [worldX, avgY + apexBoost, worldZ];

      // Top surface 4 triangles meeting at central apex (CCW winding facing sky/UP)
      const topTriangles: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [
        [v00, vCenter, v10],
        [v10, vCenter, v11],
        [v11, vCenter, v01],
        [v01, vCenter, v00],
      ];

      const maxH = blockId === BLOCK_ID_MOUNTAIN_HIGH ? 5.2 : 3.5;
      topTriangles.forEach(([p1, p2, p3]) => pushTriangle(p1, p2, p3, maxH));

      // Outer boundary side skirts (ONLY generated if adjacent cell is NOT a mountain tile)
      const neighbors = [
        { dr: -1, dc: 0, pA: v00, pB: v10 }, // North
        { dr: 0, dc: 1, pA: v10, pB: v11 },  // East
        { dr: 1, dc: 0, pA: v11, pB: v01 },  // South
        { dr: 0, dc: -1, pA: v01, pB: v00 }, // West
      ];

      neighbors.forEach(({ dr, dc, pA, pB }) => {
        const nr = r + dr;
        const nc = c + dc;
        const inCluster =
          nr >= 0 && nr < rows && nc >= 0 && nc < cols && cluster.cells.has(nr * cols + nc);

        // Generate outer boundary side skirt if neighbor is NOT in mountain cluster
        if (!inCluster) {
          const groundY = -0.5;

          const pA_base: [number, number, number] = [pA[0], groundY, pA[2]];
          const pB_base: [number, number, number] = [pB[0], groundY, pB[2]];

          // CCW triangles facing outward away from mountain center
          pushTriangle(pA, pB, pB_base, 4.5);
          pushTriangle(pA, pB_base, pA_base, 4.5);
        }
      });
    });
  });

  if (positions.length === 0) return null;

  // Create unified BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // Low-poly material with flat shading and double-sided rendering
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.8,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });

  const mountainMesh = new THREE.Mesh(geometry, material);
  mountainMesh.name = 'ChunkMountainMesh';
  mountainMesh.castShadow = true;
  mountainMesh.receiveShadow = true;

  return mountainMesh;
}
