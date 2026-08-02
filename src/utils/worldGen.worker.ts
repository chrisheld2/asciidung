/// <reference lib="webworker" />
import { generateNaturalWorld } from './worldGen';
import { packWorldGrid, WorldPayload } from './worldPayload';

/**
 * Generates a world off the main thread.
 *
 * Only ./worldGen and ./worldPayload are imported here, and both are free of
 * Three.js and DOM references, so the worker bundle stays small - importing the
 * renderer-side modules would pull a second copy of Three.js into it.
 *
 * The reply carries typed arrays, transferred rather than copied.
 */
export interface WorldGenRequest {
  requestId: number;
  seed: number;
  rows: number;
  cols: number;
}

self.onmessage = (event: MessageEvent<WorldGenRequest>) => {
  const { requestId, seed, rows, cols } = event.data;
  const grid = generateNaturalWorld(rows, cols, seed);
  const payload: WorldPayload = packWorldGrid(grid);

  const message = { requestId, payload };
  self.postMessage(message, [
    payload.blockTypeIds.buffer,
    payload.spriteIndices.buffer,
    payload.heights.buffer,
  ] as unknown as Transferable[]);
};
