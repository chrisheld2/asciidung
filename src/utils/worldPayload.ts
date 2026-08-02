// Block identity tables and the pure grid -> typed-array packing step.
//
// Deliberately free of Three.js and DOM references: the world-generation worker
// imports this, and pulling in anything renderer-side would drop a second copy
// of Three.js into the worker bundle.
import { WorldCell, BlockTypeID, MazeStats, LightEmitter } from '../types';
import { SPRITE_DEFS } from './spriteDefs';

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

export const BLOCK_ID_EMPTY = 255;
export const BLOCK_ID_TREE_OAK = BLOCK_TYPE_TO_INDEX.tree_oak;
export const BLOCK_ID_TREE_PINE = BLOCK_TYPE_TO_INDEX.tree_pine;
export const BLOCK_ID_BUSH = BLOCK_TYPE_TO_INDEX.bush;
export const BLOCK_ID_MUSHROOM = BLOCK_TYPE_TO_INDEX.mushroom;
export const BLOCK_ID_MOUNTAIN_LOW = BLOCK_TYPE_TO_INDEX.mountain_low;
export const BLOCK_ID_MOUNTAIN_HIGH = BLOCK_TYPE_TO_INDEX.mountain_high;
export const BLOCK_ID_ROCK = BLOCK_TYPE_TO_INDEX.rock;

export function isFoliageBlock(id: number): boolean {
  return (
    id === BLOCK_ID_TREE_OAK ||
    id === BLOCK_ID_TREE_PINE ||
    id === BLOCK_ID_BUSH ||
    id === BLOCK_ID_MUSHROOM
  );
}

export function isMountainBlock(id: number): boolean {
  return id === BLOCK_ID_MOUNTAIN_LOW || id === BLOCK_ID_MOUNTAIN_HIGH || id === BLOCK_ID_ROCK;
}


/**
 * The complete render-relevant description of a world, in transferable form.
 * This is what crosses the worker boundary.
 */
export interface WorldPayload {
  rows: number;
  cols: number;
  blockTypeIds: Uint8Array;
  spriteIndices: Uint8Array;
  heights: Float32Array;
  emitters: LightEmitter[];
  stats: MazeStats;
}

/**
 * Flatten a generated WorldCell grid into typed arrays, collecting light
 * emitters and statistics on the way.
 *
 * This is the only place WorldCell objects are read. Afterwards the grid is
 * garbage and everything downstream works from the arrays.
 */
export function packWorldGrid(worldGrid: WorldCell[][]): WorldPayload {
  const rows = worldGrid.length;
  const cols = worldGrid[0]?.length || 0;
  const totalCells = rows * cols;

  const blockTypeIds = new Uint8Array(totalCells);
  const spriteIndices = new Uint8Array(totalCells);
  const heights = new Float32Array(totalCells);
  const emitters: LightEmitter[] = [];

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
        blockTypeIds[idx] = BLOCK_ID_EMPTY;
        continue;
      }

      totalBlocks++;

      blockTypeIds[idx] = BLOCK_TYPE_TO_INDEX[cell.type] ?? 0;
      spriteIndices[idx] = cell.spriteIndex ?? (SPRITE_DEFS[cell.type]?.spriteIndex || 0);
      heights[idx] = cell.height ?? 0.1;

      const posX = c - centerX;
      const posZ = r - centerZ;

      // Scan for dynamic light sources
      if (cell.type === 'torch') {
        emitters.push({ x: posX, y: cell.height + 0.4, z: posZ, color: '#f97316', intensity: 3.5, distance: 18, type: 'torch' });
      } else if (cell.type === 'mushroom') {
        emitters.push({ x: posX, y: 0.3, z: posZ, color: '#a855f7', intensity: 2.2, distance: 12, type: 'mushroom' });
      } else if (cell.type === 'crystal' || cell.type === 'rune') {
        emitters.push({ x: posX, y: cell.height + 0.3, z: posZ, color: '#38bdf8', intensity: 2.8, distance: 15, type: 'crystal' });
      } else if (cell.type === 'lava') {
        emitters.push({ x: posX, y: 0.2, z: posZ, color: '#ef4444', intensity: 3.5, distance: 18, type: 'lava' });
      } else if (cell.type === 'chest') {
        emitters.push({ x: posX, y: 0.4, z: posZ, color: '#eab308', intensity: 2.0, distance: 10, type: 'chest' });
      } else if (cell.isRuin && (cell.type.startsWith('wall') || cell.type.startsWith('door')) && ((r * 13 + c * 7) % 17 === 0)) {
        emitters.push({ x: posX, y: cell.height + 0.5, z: posZ, color: '#f59e0b', intensity: 3.0, distance: 16, type: 'brazier' });
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

  return {
    rows,
    cols,
    blockTypeIds,
    spriteIndices,
    heights,
    emitters,
    stats: {
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
    },
  };
}
