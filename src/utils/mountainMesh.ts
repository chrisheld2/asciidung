import * as THREE from 'three';
import { WorldCell, SpritePackType } from '../types';
import { SPRITE_PACKS, multiOctaveNoise2D } from './sprites';

// Check if a cell represents a mountain or rock terrain block
export function isMountainCell(cell: WorldCell | undefined): boolean {
  if (!cell) return false;
  return cell.type === 'mountain_low' || cell.type === 'mountain_high' || cell.type === 'rock';
}

interface MountainCluster {
  cells: Set<string>; // 'r,c' keys
  cellList: Array<{ r: number; c: number; cell: WorldCell }>;
}

// Group contiguous mountain cells into connected clusters using 4-directional BFS
export function findMountainClusters(grid: WorldCell[][]): MountainCluster[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = new Set<string>();
  const clusters: MountainCluster[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (visited.has(key) || !isMountainCell(grid[r][c])) {
        continue;
      }

      // Start BFS for new mountain cluster
      const clusterCells = new Set<string>();
      const cellList: Array<{ r: number; c: number; cell: WorldCell }> = [];
      const queue: Array<[number, number]> = [[r, c]];
      visited.add(key);

      while (queue.length > 0) {
        const [currR, currC] = queue.shift()!;
        const currKey = `${currR},${currC}`;
        clusterCells.add(currKey);
        cellList.push({ r: currR, c: currC, cell: grid[currR][currC] });

        // Check 4 neighbors
        const neighbors: Array<[number, number]> = [
          [currR - 1, currC],
          [currR + 1, currC],
          [currR, currC - 1],
          [currR, currC + 1],
        ];

        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const nKey = `${nr},${nc}`;
            if (!visited.has(nKey) && isMountainCell(grid[nr][nc])) {
              visited.add(nKey);
              queue.push([nr, nc]);
            }
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
  grid: WorldCell[][],
  centerX: number,
  centerZ: number,
  seed = 42
): number {
  const rows = grid.length;
  const cols = grid[0].length;

  // Convert centered world position back to grid indices
  const gridC = Math.floor(x + centerX);
  const gridR = Math.floor(z + centerZ);

  let baseH = 0.2;
  if (gridR >= 0 && gridR < rows && gridC >= 0 && gridC < cols) {
    const cell = grid[gridR][gridC];
    if (isMountainCell(cell)) {
      if (cell.type === 'mountain_high') baseH = cell.height; // ~4.0
      else if (cell.type === 'mountain_low') baseH = cell.height; // ~2.5
      else baseH = cell.height; // rock ~1.2
    }
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

// Calculate color based on vertex height, slope, and active sprite pack palette
function getLowPolyMountainColor(
  height: number,
  maxHeight: number,
  normalY: number,
  packId: SpritePackType
): [number, number, number] {
  const pack = SPRITE_PACKS.find((p) => p.id === packId) || SPRITE_PACKS[0];
  const colors = pack.colors;

  const rgbBase = hexToRGB(colors.r2 || '#334155'); // Dark slate / base
  const rgbRock = hexToRGB(colors.r1 || '#64748b'); // Mid rock grey
  const rgbHighlight = hexToRGB(colors.r3 || '#cbd5e1'); // Snowcap / light peak
  const rgbPeakSnow = hexToRGB('#ffffff'); // Pure white snowcaps

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
  r = Math.min(1, Math.max(0, r + jitter));
  g = Math.min(1, Math.max(0, g + jitter));
  b = Math.min(1, Math.max(0, b + jitter));

  return [r, g, b];
}

/**
 * Creates a single, unified low-poly mesh for all mountain clusters on the grid.
 * Merges adjacent grid tiles into continuous mountain ridges, removes internal faces,
 * and applies sharp faceted low-poly styling and height/slope color gradients.
 */
export function buildUnifiedMountainMeshGroup(
  grid: WorldCell[][],
  packId: SpritePackType = 'retro',
  seed = 42
): THREE.Group {
  const mountainGroup = new THREE.Group();
  mountainGroup.name = 'UnifiedMountainMeshGroup';

  const rows = grid.length;
  const cols = grid[0].length;
  const centerX = cols / 2 - 0.5;
  const centerZ = rows / 2 - 0.5;

  const clusters = findMountainClusters(grid);
  if (clusters.length === 0) return mountainGroup;

  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];

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
    const vy = getMountainHeightAt(vx, vz, grid, centerX, centerZ, seed);
    return [vx, vy, vz];
  }

  // Iterate over each mountain cluster
  clusters.forEach((cluster) => {
    // Process each tile in the cluster
    cluster.cellList.forEach(({ r, c, cell }) => {
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
      const apexBoost = cell.type === 'mountain_high' ? 0.6 : 0.35;
      const vCenter: [number, number, number] = [worldX, avgY + apexBoost, worldZ];

      // Top surface 4 triangles meeting at central apex (CCW winding facing sky/UP)
      const topTriangles: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [
        [v00, vCenter, v10],
        [v10, vCenter, v11],
        [v11, vCenter, v01],
        [v01, vCenter, v00],
      ];

      topTriangles.forEach(([p1, p2, p3]) => {
        // Calculate flat triangle face normal
        const ax = p2[0] - p1[0], ay = p2[1] - p1[1], az = p2[2] - p1[2];
        const bx = p3[0] - p1[0], by = p3[1] - p1[1], bz = p3[2] - p1[2];

        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;

        const maxH = cell.type === 'mountain_high' ? 5.2 : 3.5;

        // Apply height/slope color gradient for each vertex
        const col1 = getLowPolyMountainColor(p1[1], maxH, ny, packId);
        const col2 = getLowPolyMountainColor(p2[1], maxH, ny, packId);
        const col3 = getLowPolyMountainColor(p3[1], maxH, ny, packId);

        positions.push(...p1, ...p2, ...p3);
        normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        colors.push(...col1, ...col2, ...col3);
      });

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
        const neighborKey = `${nr},${nc}`;

        // Generate outer boundary side skirt if neighbor is NOT in mountain cluster
        if (!cluster.cells.has(neighborKey)) {
          const groundY = -0.5;

          const pA_base: [number, number, number] = [pA[0], groundY, pA[2]];
          const pB_base: [number, number, number] = [pB[0], groundY, pB[2]];

          // CCW triangles facing outward away from mountain center
          const sideTriangles: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [
            [pA, pB, pB_base],
            [pA, pB_base, pA_base],
          ];

          sideTriangles.forEach(([p1, p2, p3]) => {
            const ax = p2[0] - p1[0], ay = p2[1] - p1[1], az = p2[2] - p1[2];
            const bx = p3[0] - p1[0], by = p3[1] - p1[1], bz = p3[2] - p1[2];

            let nx = ay * bz - az * by;
            let ny = az * bx - ax * bz;
            let nz = ax * by - ay * bx;
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len; ny /= len; nz /= len;

            const col1 = getLowPolyMountainColor(p1[1], 4.5, ny, packId);
            const col2 = getLowPolyMountainColor(p2[1], 4.5, ny, packId);
            const col3 = getLowPolyMountainColor(p3[1], 4.5, ny, packId);

            positions.push(...p1, ...p2, ...p3);
            normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
            colors.push(...col1, ...col2, ...col3);
          });
        }
      });
    });
  });

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
  mountainMesh.castShadow = true;
  mountainMesh.receiveShadow = true;
  mountainGroup.add(mountainMesh);

  return mountainGroup;
}
