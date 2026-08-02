import { WorldPayload, packWorldGrid } from './worldPayload';
import { generateNaturalWorld } from './worldGen';
import type { WorldGenRequest } from './worldGen.worker';

/**
 * Generates worlds on a worker so the main thread never blocks on it.
 *
 * At 256x256 generation alone is over 200 ms - a multi-second stall by the time
 * you reach the "significantly larger levels" this is meant to scale to. The
 * result comes back as transferred typed arrays, so there is no copy on receipt.
 *
 * Falls back to generating inline if workers are unavailable (or fail to start),
 * which keeps the app working in restricted environments and in tests.
 */
let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;

const pending = new Map<number, (payload: WorldPayload) => void>();

function ensureWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL('./worldGen.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ requestId: number; payload: WorldPayload }>) => {
      const resolve = pending.get(event.data.requestId);
      if (resolve) {
        pending.delete(event.data.requestId);
        resolve(event.data.payload);
      }
    };
    worker.onerror = () => {
      // Fail over to inline generation for every request from here on.
      workerUnavailable = true;
      worker = null;
      pending.forEach((resolve, id) => {
        pending.delete(id);
        resolve(packWorldGrid(generateNaturalWorld(64, 64)));
      });
    };
  } catch {
    workerUnavailable = true;
    worker = null;
  }

  return worker;
}

export function generateWorld(seed: number, rows: number, cols: number): Promise<WorldPayload> {
  const active = ensureWorker();

  if (!active) {
    return Promise.resolve(packWorldGrid(generateNaturalWorld(rows, cols, seed)));
  }

  const requestId = nextRequestId++;
  return new Promise<WorldPayload>((resolve) => {
    pending.set(requestId, resolve);
    const request: WorldGenRequest = { requestId, seed, rows, cols };
    active.postMessage(request);
  });
}

export function disposeWorldGenWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
