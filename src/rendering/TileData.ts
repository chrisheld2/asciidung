import { WorldCell, MazeStats, LightEmitter } from '../types';
import { packWorldGrid, WorldPayload, BLOCK_ID_EMPTY } from '../utils/worldPayload';

// Block identity tables and the pure packing step live in utils/worldPayload so
// the world-generation worker can import them without pulling in Three.js.
// Re-exported here because this is where renderer code expects to find them.
export * from '../utils/worldPayload';

/**
 * TileData Engine
 * Pure TypeScript tile state engine backed by contiguous typed arrays.
 * Zero Three.js dependency.
 *
 * This is the render-time source of truth. `WorldCell[][]` exists only as a
 * generation intermediate and is discarded once packed.
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

  /** Block id at a cell, or BLOCK_ID_EMPTY outside the grid. */
  public blockAt(r: number, c: number): number {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return BLOCK_ID_EMPTY;
    return this.blockTypeIds[r * this.cols + c];
  }

  public heightAt(r: number, c: number): number {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return 0;
    return this.heights[r * this.cols + c];
  }

  /**
   * Install an already-packed world. The arrays are taken by reference, which is
   * what lets the generation worker transfer them in with no copy.
   */
  public adopt(payload: WorldPayload): void {
    this.rows = payload.rows;
    this.cols = payload.cols;
    this.totalCells = payload.rows * payload.cols;
    this.blockTypeIds = payload.blockTypeIds;
    this.spriteIndices = payload.spriteIndices;
    this.heights = payload.heights;
    this.emitters = payload.emitters;
    this.stats = payload.stats;
  }

  /** Pack and install a generated grid on the calling thread. */
  public loadWorldGrid(worldGrid: WorldCell[][]): void {
    this.adopt(packWorldGrid(worldGrid));
  }
}
