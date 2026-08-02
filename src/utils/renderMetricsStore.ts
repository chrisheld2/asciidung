import { RenderMetrics } from '../types';

/**
 * Render metrics live outside React.
 *
 * They update twice a second forever. Holding them in App state meant every
 * update re-rendered the entire component tree - including the HUD and the
 * 1,800-line pause screen - purely to repaint a frame counter. Components that
 * genuinely display metrics subscribe here instead, so the cost is scoped to
 * them.
 */
const INITIAL: RenderMetrics = {
  fps: 60,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
};

let current: RenderMetrics = INITIAL;
const listeners = new Set<() => void>();

export const renderMetricsStore = {
  /** Stable reference between updates, so useSyncExternalStore does not loop. */
  get(): RenderMetrics {
    return current;
  },

  set(next: RenderMetrics): void {
    current = next;
    listeners.forEach((listener) => listener());
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
