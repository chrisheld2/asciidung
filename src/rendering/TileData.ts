import { WorldCell, BlockTypeID, MazeStats, LightEmitter } from '../types';
import { SPRITE_DEFS } from '../utils/sprites';

/**
 * BLOCK_TYPE_INDEX_MAP
 * Maps string BlockTypeIDs to 8-bit integer IDs for zero-overhead typed array access.
 */
export const BLOCK_TYPES_LIST: BlockTypeID[] = [
  'grass',
  'tree_oak',
  'tree_pine',
  'flower',
  'mushroom',
  'bush',
  'dirt',
  'sand',
  'water_deep',
  'water_shallow',
  'rock',
  'mountain_low',
  'mountain_high',
  'lava',
  'crystal',
  'cobblestone',
  'wall_stone',
  'wall_mossy',
  'wall_cracked',
  'door_wood',
  'gate_iron',
  'pillar',
  'chest',
  'spikes',
  'bones',
  'rune',
  'torch',
];

export const BLOCK_TYPE_TO_INDEX: Record<BlockTypeID, number> = BLOCK_TYPES_LIST.reduce(
  (acc, type, idx) => {
    acc[type] = idx;
    return acc;
  },
  {} as Record<BlockTypeID, number>
);

/**
 * TileData Engine
 * Pure TypeScript tile state engine backed by contiguous typed arrays.
 * Zero Three.js dependency.
 */
export class TileDataEngine {
  public rows: number;
  public cols: number;
  public totalCells: number;

  // Contiguous typed array buffers
  public blockTypeIds: Uint8Array;
  public spriteIndices: Uint8Array;
  public heights: Float32Array;

  public emitters: LightEmitter[];
  public stats: MazeStats;

  constructor(rows = 64, cols = 64) {
    this.rows = rows;
    this.cols = cols;
    this.totalCells = rows * cols;

    this.blockTypeIds = new Uint8Array(this.totalCells);
    this.spriteIndices = new Uint8Array(this.totalCells);
    this.heights = new Float32Array(this.totalCells);

    this.emitters = [];
    this.stats = {
      rows,
      cols,
      totalBlocks: 0,
      translucentWalls: 0,
      opaqueWalls: 0,
      treeCount: 0,
      dirtCount: 0,
      waterCount: 0,
      ruinCount: 0,
      mountainCount: 0,
      chestCount: 0,
      specialCount: 0,
      tallBlockCount: 0,
    };
  }

  public getIndex(r: number, c: number): number {
    return r * this.cols + c;
  }

  /**
   * Load state from WorldCell[][] into flat typed array buffers
   */
  public loadWorldGrid(worldGrid: WorldCell[][]): void {
    const rows = worldGrid.length;
    const cols = worldGrid[0]?.length || 0;

    if (rows !== this.rows || cols !== this.cols) {
      this.rows = rows;
      this.cols = cols;
      this.totalCells = rows * cols;
      this.blockTypeIds = new Uint8Array(this.totalCells);
      this.spriteIndices = new Uint8Array(this.totalCells);
      this.heights = new Float32Array(this.totalCells);
    }

    this.emitters = [];

    let totalBlocks = 0;
    let treeCount = 0;
    let dirtCount = 0;
    let waterCount = 0;
    let ruinCount = 0;
    let mountainCount = 0;
    let chestCount = 0;
    let specialCount = 0;
    let tallBlockCount = 0;

    const centerX = cols / 2 - 0.5;
    const centerZ = rows / 2 - 0.5;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = worldGrid[r][c];
        const idx = r * cols + c;

        if (!cell) {
          this.blockTypeIds[idx] = 255; // empty
          continue;
        }

        totalBlocks++;

        const blockTypeIdx = BLOCK_TYPE_TO_INDEX[cell.type] ?? 0;
        this.blockTypeIds[idx] = blockTypeIdx;
        this.spriteIndices[idx] = cell.spriteIndex ?? (SPRITE_DEFS[cell.type]?.spriteIndex || 0);
        this.heights[idx] = cell.height ?? 0.1;

        const posX = c - centerX;
        const posZ = r - centerZ;

        // Scan for dynamic light sources
        if (cell.type === 'torch') {
          this.emitters.push({ x: posX, y: cell.height + 0.4, z: posZ, color: '#f97316', intensity: 3.5, distance: 18, type: 'torch' });
        } else if (cell.type === 'mushroom') {
          this.emitters.push({ x: posX, y: 0.3, z: posZ, color: '#a855f7', intensity: 2.2, distance: 12, type: 'mushroom' });
        } else if (cell.type === 'crystal' || cell.type === 'rune') {
          this.emitters.push({ x: posX, y: cell.height + 0.3, z: posZ, color: '#38bdf8', intensity: 2.8, distance: 15, type: 'crystal' });
        } else if (cell.type === 'lava') {
          this.emitters.push({ x: posX, y: 0.2, z: posZ, color: '#ef4444', intensity: 3.5, distance: 18, type: 'lava' });
        } else if (cell.type === 'chest') {
          this.emitters.push({ x: posX, y: 0.4, z: posZ, color: '#eab308', intensity: 2.0, distance: 10, type: 'chest' });
        } else if (cell.isRuin && (cell.type.startsWith('wall') || cell.type.startsWith('door')) && ((r * 13 + c * 7) % 17 === 0)) {
          this.emitters.push({ x: posX, y: cell.height + 0.5, z: posZ, color: '#f59e0b', intensity: 3.0, distance: 16, type: 'brazier' });
        }

        // Stats classification
        if (cell.type === 'tree_oak' || cell.type === 'tree_pine' || cell.type === 'bush') {
          treeCount++;
        } else if (cell.type.startsWith('mountain') || cell.type === 'rock') {
          mountainCount++;
        } else if (cell.type === 'dirt' || cell.type === 'sand') {
          dirtCount++;
        } else if (cell.type.startsWith('water')) {
          waterCount++;
        } else if (cell.isRuin || cell.type.startsWith('wall') || cell.type.startsWith('door') || cell.type.startsWith('gate')) {
          ruinCount++;
        } else if (cell.type === 'chest') {
          chestCount++;
        } else {
          specialCount++;
        }

        if (cell.height >= 2.0) {
          tallBlockCount++;
        }
      }
    }

    this.stats = {
      rows,
      cols,
      totalBlocks,
      // Wall translucency is not implemented in the renderer, so no wall is
      // currently translucent. This used to be a per-rebuild Math.random() roll
      // whose result nothing ever read - it broke seed reproducibility and
      // reported a count that did not correspond to anything on screen.
      translucentWalls: 0,
      opaqueWalls: totalBlocks,
      treeCount,
      dirtCount,
      waterCount,
      ruinCount,
      mountainCount,
      chestCount,
      specialCount,
      tallBlockCount,
    };
  }
}
