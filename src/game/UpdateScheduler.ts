import { EntityStore, FLAG_ACTIVE } from './EntityStore';

/**
 * Distance-banded update scheduling.
 *
 * Nothing far from the camera needs to think every frame. Each entity is placed
 * in a band by squared distance, and each band has its own update interval; an
 * entity is only handed to the callback when its band is due.
 *
 * Bands are recomputed on a rolling slice of the entity list rather than all at
 * once, so the classification cost itself stays flat as entity counts grow.
 */
export interface UpdateBand {
  name: string;
  /** Band applies out to this distance from the focus point. */
  maxDistance: number;
  /** Seconds between updates. 0 means every frame; Infinity means never. */
  interval: number;
}

export const DEFAULT_BANDS: UpdateBand[] = [
  { name: 'near', maxDistance: 24, interval: 0 },
  { name: 'mid', maxDistance: 64, interval: 1 / 15 },
  { name: 'far', maxDistance: 160, interval: 0.5 },
  { name: 'dormant', maxDistance: Infinity, interval: Infinity },
];

/** Entities reclassified per frame. Keeps banding cost independent of count. */
const RECLASSIFY_PER_FRAME = 256;

export class UpdateScheduler {
  private bands: UpdateBand[];
  private band: Uint8Array;
  private nextDue: Float32Array;
  private cursor = 0;
  private elapsed = 0;

  /** Entities handed to the callback on the most recent tick, for diagnostics. */
  public lastUpdatedCount = 0;

  constructor(capacity: number, bands: UpdateBand[] = DEFAULT_BANDS) {
    this.bands = bands;
    this.band = new Uint8Array(capacity);
    this.nextDue = new Float32Array(capacity);
  }

  private ensureCapacity(capacity: number): void {
    if (this.band.length >= capacity) return;
    const band = new Uint8Array(capacity);
    band.set(this.band);
    this.band = band;
    const due = new Float32Array(capacity);
    due.set(this.nextDue);
    this.nextDue = due;
  }

  private bandFor(distSq: number): number {
    for (let i = 0; i < this.bands.length; i++) {
      const max = this.bands[i].maxDistance;
      if (distSq <= max * max) return i;
    }
    return this.bands.length - 1;
  }

  /**
   * Advance time and invoke `update` for every entity whose band is due.
   * The callback receives the entity's slot index, not a handle, so systems can
   * read the store's columns directly.
   */
  public tick(
    store: EntityStore,
    delta: number,
    focusX: number,
    focusZ: number,
    update: (index: number, dt: number) => void
  ): void {
    this.ensureCapacity(store.capacity);
    this.elapsed += delta;
    this.lastUpdatedCount = 0;

    const high = store.highWater;
    if (high === 0) return;

    // Reclassify a slice: distance bands change slowly relative to frame rate.
    const slice = Math.min(RECLASSIFY_PER_FRAME, high);
    for (let n = 0; n < slice; n++) {
      const i = (this.cursor + n) % high;
      if (!store.isSlotAlive(i)) continue;
      const dx = store.x[i] - focusX;
      const dz = store.z[i] - focusZ;
      this.band[i] = this.bandFor(dx * dx + dz * dz);
    }
    this.cursor = (this.cursor + slice) % high;

    for (let i = 0; i < high; i++) {
      if (!store.isSlotAlive(i)) continue;
      if ((store.flags[i] & FLAG_ACTIVE) === 0) continue;

      const interval = this.bands[this.band[i]].interval;
      if (interval === Infinity) continue;

      if (interval > 0) {
        if (this.elapsed < this.nextDue[i]) continue;
        this.nextDue[i] = this.elapsed + interval;
        update(i, interval);
      } else {
        update(i, delta);
      }
      this.lastUpdatedCount++;
    }
  }

  /** Band name for an entity slot, for debugging and tests. */
  public bandNameAt(index: number): string {
    return this.bands[this.band[index]].name;
  }
}
