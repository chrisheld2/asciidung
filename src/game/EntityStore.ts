/**
 * Data-oriented entity storage.
 *
 * Entities are columns of typed arrays (structure of arrays), not objects. A
 * thousand entity objects would be a thousand allocations to trace and a cache
 * miss per field access; here a system that only touches positions walks three
 * contiguous Float32Arrays.
 *
 * Handles pack an index and a generation counter, so a handle to a despawned
 * entity is detectably stale rather than silently addressing whoever reused the
 * slot.
 */

export type EntityHandle = number;

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
export const MAX_ENTITIES = INDEX_MASK;

export const enum EntityType {
  None = 0,
  Adventurer = 1,
  Critter = 2,
  Prop = 3,
}

/** Marks entities the scheduler should skip entirely. */
export const FLAG_ACTIVE = 1 << 0;

export function handleIndex(handle: EntityHandle): number {
  return handle & INDEX_MASK;
}

export function handleGeneration(handle: EntityHandle): number {
  return handle >>> INDEX_BITS;
}

export class EntityStore {
  public capacity: number;
  /** One past the highest slot ever used; systems iterate to here. */
  public highWater = 0;
  public count = 0;

  public x: Float32Array;
  public y: Float32Array;
  public z: Float32Array;
  public type: Uint8Array;
  public flags: Uint8Array;
  /** Per-visual-type sprite atlas index. */
  public spriteIndex: Uint8Array;
  public scale: Float32Array;

  private generation: Uint16Array;
  private alive: Uint8Array;
  private freeList: Int32Array;
  private freeCount = 0;

  constructor(capacity = 1024) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.type = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.spriteIndex = new Uint8Array(capacity);
    this.scale = new Float32Array(capacity);
    this.generation = new Uint16Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.freeList = new Int32Array(capacity);
  }

  private grow(): void {
    const next = Math.min(MAX_ENTITIES, this.capacity * 2);
    if (next === this.capacity) {
      throw new Error(`EntityStore is full at ${this.capacity} entities`);
    }

    const copyF32 = (src: Float32Array) => {
      const dst = new Float32Array(next);
      dst.set(src);
      return dst;
    };
    const copyU8 = (src: Uint8Array) => {
      const dst = new Uint8Array(next);
      dst.set(src);
      return dst;
    };

    this.x = copyF32(this.x);
    this.y = copyF32(this.y);
    this.z = copyF32(this.z);
    this.scale = copyF32(this.scale);
    this.type = copyU8(this.type);
    this.flags = copyU8(this.flags);
    this.spriteIndex = copyU8(this.spriteIndex);

    const nextGen = new Uint16Array(next);
    nextGen.set(this.generation);
    this.generation = nextGen;

    const nextAlive = new Uint8Array(next);
    nextAlive.set(this.alive);
    this.alive = nextAlive;

    const nextFree = new Int32Array(next);
    nextFree.set(this.freeList);
    this.freeList = nextFree;

    this.capacity = next;
  }

  public spawn(
    type: EntityType,
    x: number,
    y: number,
    z: number,
    spriteIndex = 0,
    scale = 1
  ): EntityHandle {
    let index: number;
    if (this.freeCount > 0) {
      index = this.freeList[--this.freeCount];
    } else {
      if (this.highWater >= this.capacity) this.grow();
      index = this.highWater++;
    }

    this.x[index] = x;
    this.y[index] = y;
    this.z[index] = z;
    this.type[index] = type;
    this.spriteIndex[index] = spriteIndex;
    this.scale[index] = scale;
    this.flags[index] = FLAG_ACTIVE;
    this.alive[index] = 1;
    this.count++;

    return index | (this.generation[index] << INDEX_BITS);
  }

  public isAlive(handle: EntityHandle): boolean {
    const index = handleIndex(handle);
    return (
      index < this.highWater &&
      this.alive[index] === 1 &&
      this.generation[index] === handleGeneration(handle)
    );
  }

  public despawn(handle: EntityHandle): boolean {
    if (!this.isAlive(handle)) return false;

    const index = handleIndex(handle);
    this.alive[index] = 0;
    this.flags[index] = 0;
    this.type[index] = EntityType.None;
    // Wrapping is fine: a handle would have to survive 65,536 reuses of the same
    // slot to collide, and stale handles are a bug to be caught, not tracked.
    this.generation[index] = (this.generation[index] + 1) & 0xffff;
    this.freeList[this.freeCount++] = index;
    this.count--;
    return true;
  }

  public isSlotAlive(index: number): boolean {
    return this.alive[index] === 1;
  }

  public clear(): void {
    this.alive.fill(0);
    this.flags.fill(0);
    this.type.fill(0);
    this.highWater = 0;
    this.freeCount = 0;
    this.count = 0;
  }
}
