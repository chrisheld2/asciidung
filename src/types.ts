export interface ColorTheme {
  id: string;
  name: string;
  fg: string;
  bg: string;
  light: string;
  ambient: string;
  accent: string;
}

export type SpritePackType = 'retro' | 'emerald' | 'dungeon' | 'cyber' | 'blood' | 'gold';

export interface SpritePack {
  id: SpritePackType;
  name: string;
  colors: Record<string, string>;
}

export type BlockTypeID =
  | 'grass'
  | 'tree_oak'
  | 'tree_pine'
  | 'flower'
  | 'mushroom'
  | 'bush'
  | 'dirt'
  | 'sand'
  | 'water_deep'
  | 'water_shallow'
  | 'rock'
  | 'mountain_low'
  | 'mountain_high'
  | 'lava'
  | 'crystal'
  | 'cobblestone'
  | 'wall_stone'
  | 'wall_mossy'
  | 'wall_cracked'
  | 'door_wood'
  | 'gate_iron'
  | 'pillar'
  | 'chest'
  | 'spikes'
  | 'bones'
  | 'rune'
  | 'torch';

export interface SpriteDef {
  id: BlockTypeID;
  name: string;
  category: 'nature' | 'dungeon' | 'terrain' | 'special';
  spriteIndex: number; // Index in 16x16 sprite atlas (0 to 255)
  x: number; // 0 to 15 grid x
  y: number; // 0 to 15 grid y
  defaultHeight: number;
  pixels: number[][]; // 8x8 matrix with color indices (0 = bg/trans, 1..N = color key)
}

export interface WorldCell {
  type: BlockTypeID;
  spriteIndex: number;
  height: number;
  name: string;
  color?: string;
  isRuin?: boolean;
}

export interface MazeStats {
  rows: number;
  cols: number;
  totalBlocks: number;
  translucentWalls: number;
  opaqueWalls: number;
  treeCount: number;
  dirtCount: number;
  waterCount: number;
  ruinCount: number;
  mountainCount: number;
  chestCount: number;
  specialCount: number;
  tallBlockCount: number;
}

export type CameraPreset = 'isometric' | 'topdown' | 'side' | 'firstperson';

export type LightType = 'realtime' | 'fake';

export type PauseTab = 'metrics' | 'daynight' | 'visuals' | 'camera' | 'audio';

export interface DayNightState {
  timeOfDayMinutes: number; // 0 to 1439 (e.g. 720 = 12:00)
  isTimeLocked: boolean;
  manualTimeMinutes: number;
  turnIncrementMinutes: number; // e.g. 15, 30, 60
  turnCount: number;
}

export interface LightEmitter {
  x: number;
  y: number;
  z: number;
  color: string;
  intensity: number;
  distance: number;
  type: string;
  distSq?: number;
}

export interface RenderMetrics {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

