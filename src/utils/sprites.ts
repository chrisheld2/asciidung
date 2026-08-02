import * as THREE from 'three';
import { ColorTheme, SpritePack, SpritePackType, SpriteDef, WorldCell, BlockTypeID, MazeStats } from '../types';

export const SPRITE_PACKS: SpritePack[] = [
  {
    id: 'retro',
    name: '16-Bit Classic',
    colors: {
      bg: '#000000',
      p1: '#22c55e', // Grass green
      p2: '#15803d', // Dark green
      p3: '#4ade80', // Light green
      p4: '#166534', // Deep foliage
      s1: '#854d0e', // Soil / Bark brown
      s2: '#a16207', // Light soil / Sand
      s3: '#713f12', // Dark wood
      w1: '#0284c7', // Deep water blue
      w2: '#38bdf8', // Shallow water sky
      r1: '#64748b', // Stone gray
      r2: '#334155', // Dark stone slate
      r3: '#94a3b8', // Light stone silver
      a1: '#eab308', // Gold / Fire yellow
      a2: '#ef4444', // Red / Lava
      a3: '#a855f7', // Crystal purple / Magic
    },
  },
  {
    id: 'emerald',
    name: 'Emerald Moss',
    colors: {
      bg: '#000000',
      p1: '#10b981',
      p2: '#047857',
      p3: '#6ee7b7',
      p4: '#064e3b',
      s1: '#78350f',
      s2: '#b45309',
      s3: '#451a03',
      w1: '#0d9488',
      w2: '#2dd4bf',
      r1: '#475569',
      r2: '#1e293b',
      r3: '#cbd5e1',
      a1: '#f59e0b',
      a2: '#f43f5e',
      a3: '#818cf8',
    },
  },
  {
    id: 'dungeon',
    name: 'Deep Dungeon',
    colors: {
      bg: '#000000',
      p1: '#16a34a',
      p2: '#14532d',
      p3: '#86efac',
      p4: '#052e16',
      s1: '#571c0d',
      s2: '#854d0e',
      s3: '#311007',
      w1: '#1d4ed8',
      w2: '#60a5fa',
      r1: '#52525b',
      r2: '#27272a',
      r3: '#a1a1aa',
      a1: '#d97706',
      a2: '#dc2626',
      a3: '#c084fc',
    },
  },
  {
    id: 'cyber',
    name: 'Cyber Neon',
    colors: {
      bg: '#000000',
      p1: '#00ffcc',
      p2: '#009999',
      p3: '#80ffee',
      p4: '#004d4d',
      s1: '#ff00aa',
      s2: '#ff66cc',
      s3: '#990066',
      w1: '#0066ff',
      w2: '#66b2ff',
      r1: '#4b5563',
      r2: '#1f2937',
      r3: '#9ca3af',
      a1: '#ffcc00',
      a2: '#ff3300',
      a3: '#cc00ff',
    },
  },
  {
    id: 'blood',
    name: 'Blood Keep',
    colors: {
      bg: '#000000',
      p1: '#ef4444',
      p2: '#991b1b',
      p3: '#fca5a5',
      p4: '#450a0a',
      s1: '#78350f',
      s2: '#d97706',
      s3: '#451a03',
      w1: '#7f1d1d',
      w2: '#f87171',
      r1: '#44403c',
      r2: '#1c1917',
      r3: '#a8a29e',
      a1: '#fbbf24',
      a2: '#dc2626',
      a3: '#e879f9',
    },
  },
  {
    id: 'gold',
    name: 'Ancient Sands',
    colors: {
      bg: '#000000',
      p1: '#ca8a04',
      p2: '#854d0e',
      p3: '#fde047',
      p4: '#533107',
      s1: '#b45309',
      s2: '#f59e0b',
      s3: '#78350f',
      w1: '#0284c7',
      w2: '#7dd3fc',
      r1: '#78716c',
      r2: '#292524',
      r3: '#d6d3d1',
      a1: '#eab308',
      a2: '#f97316',
      a3: '#38bdf8',
    },
  },
];

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'natural',
    name: 'Natural Biomes',
    fg: '#22c55e',
    bg: '#000000',
    light: '#ffffff',
    ambient: '#111827',
    accent: '#38bdf8',
  },
  {
    id: 'matrix',
    name: 'Matrix Emerald',
    fg: '#00ff66',
    bg: '#000000',
    light: '#00ff88',
    ambient: '#062015',
    accent: '#33ff99',
  },
  {
    id: 'cyan',
    name: 'Cyberpunk Cyan',
    fg: '#00e5ff',
    bg: '#000000',
    light: '#00d5ff',
    ambient: '#091e30',
    accent: '#80f0ff',
  },
  {
    id: 'amber',
    name: 'Amber Terminal',
    fg: '#ffb300',
    bg: '#000000',
    light: '#ffaa00',
    ambient: '#241703',
    accent: '#ffd54f',
  },
  {
    id: 'crimson',
    name: 'Blood Crimson',
    fg: '#ff2a55',
    bg: '#000000',
    light: '#ff3366',
    ambient: '#240810',
    accent: '#ff6688',
  },
];

// Helper to convert key char matrix into numeric matrix (0=bg, 1=p1, 2=p2, 3=p3, 4=p4, 5=s1, 6=r1, 7=a1, etc.)
// 0: bg, 1: p1 (green/primary), 2: p2 (dark green), 3: p3 (light green), 4: p4 (deep),
// 5: s1 (wood/soil), 6: s2 (sand), 7: r1 (stone), 8: r2 (dark stone), 9: r3 (light stone),
// 10: w1 (water deep), 11: w2 (water shallow), 12: a1 (gold), 13: a2 (red/lava), 14: a3 (magic)

export const SPRITE_DEFS: Record<BlockTypeID, SpriteDef> = {
  grass: {
    id: 'grass',
    name: 'Meadow Grass',
    category: 'nature',
    spriteIndex: 0,
    x: 0,
    y: 0,
    defaultHeight: 0.1,
    pixels: [
      [1, 1, 2, 1, 1, 3, 1, 1],
      [1, 1, 1, 3, 1, 1, 2, 1],
      [1, 2, 1, 1, 2, 1, 1, 1],
      [1, 1, 3, 1, 1, 3, 1, 1],
      [1, 1, 1, 2, 1, 1, 2, 1],
      [1, 3, 1, 1, 3, 1, 1, 1],
      [1, 1, 2, 1, 1, 2, 1, 1],
      [1, 1, 2, 1, 1, 3, 1, 1],
    ],
  },
  tree_oak: {
    id: 'tree_oak',
    name: 'Oak Tree',
    category: 'nature',
    spriteIndex: 1,
    x: 1,
    y: 0,
    defaultHeight: 1.2,
    pixels: [
      [0, 0, 3, 3, 3, 0, 0, 0],
      [0, 3, 1, 1, 1, 3, 0, 0],
      [3, 1, 1, 1, 1, 1, 3, 0],
      [3, 1, 2, 1, 1, 1, 3, 0],
      [0, 3, 1, 1, 1, 3, 0, 0],
      [0, 0, 0, 5, 5, 0, 0, 0],
      [0, 0, 0, 5, 5, 0, 0, 0],
      [0, 0, 5, 5, 5, 5, 0, 0],
    ],
  },
  tree_pine: {
    id: 'tree_pine',
    name: 'Pine Tree',
    category: 'nature',
    spriteIndex: 2,
    x: 2,
    y: 0,
    defaultHeight: 1.4,
    pixels: [
      [0, 0, 0, 3, 0, 0, 0, 0],
      [0, 0, 3, 1, 3, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 0],
      [0, 3, 1, 2, 1, 3, 0, 0],
      [0, 1, 1, 1, 1, 1, 0, 0],
      [3, 1, 1, 2, 1, 1, 3, 0],
      [0, 0, 0, 5, 5, 0, 0, 0],
      [0, 0, 5, 5, 5, 5, 0, 0],
    ],
  },
  flower: {
    id: 'flower',
    name: 'Wildflowers',
    category: 'nature',
    spriteIndex: 3,
    x: 3,
    y: 0,
    defaultHeight: 0.15,
    pixels: [
      [1, 1, 12, 12, 1, 1, 1, 1],
      [1, 12, 13, 12, 1, 14, 14, 1],
      [1, 1, 12, 12, 1, 14, 12, 14],
      [1, 1, 1, 1, 1, 1, 14, 14],
      [1, 14, 14, 1, 1, 1, 1, 1],
      [14, 12, 14, 1, 1, 12, 12, 1],
      [1, 14, 14, 1, 12, 13, 12, 1],
      [1, 1, 1, 1, 1, 12, 12, 1],
    ],
  },
  mushroom: {
    id: 'mushroom',
    name: 'Red Mushroom',
    category: 'nature',
    spriteIndex: 4,
    x: 4,
    y: 0,
    defaultHeight: 0.2,
    pixels: [
      [0, 0, 13, 13, 13, 13, 0, 0],
      [0, 13, 13, 9, 13, 13, 13, 0],
      [13, 9, 13, 13, 13, 9, 13, 0],
      [13, 13, 13, 13, 13, 13, 13, 0],
      [0, 9, 9, 9, 9, 9, 0, 0],
      [0, 0, 0, 9, 9, 0, 0, 0],
      [0, 0, 0, 9, 9, 0, 0, 0],
      [0, 0, 9, 9, 9, 9, 0, 0],
    ],
  },
  bush: {
    id: 'bush',
    name: 'Dense Shrub',
    category: 'nature',
    spriteIndex: 5,
    x: 5,
    y: 0,
    defaultHeight: 0.4,
    pixels: [
      [0, 3, 3, 3, 3, 3, 0, 0],
      [3, 1, 1, 1, 1, 1, 3, 0],
      [3, 1, 2, 1, 1, 1, 3, 0],
      [3, 1, 1, 1, 2, 1, 3, 0],
      [3, 2, 1, 1, 1, 1, 3, 0],
      [0, 3, 1, 2, 1, 3, 0, 0],
      [0, 0, 3, 3, 3, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  dirt: {
    id: 'dirt',
    name: 'Soil / Earth',
    category: 'terrain',
    spriteIndex: 6,
    x: 6,
    y: 0,
    defaultHeight: 0.12,
    pixels: [
      [5, 5, 6, 5, 5, 5, 5, 6],
      [5, 6, 5, 5, 5, 6, 5, 5],
      [5, 5, 5, 6, 5, 5, 5, 5],
      [6, 5, 5, 5, 5, 5, 6, 5],
      [5, 5, 6, 5, 5, 5, 5, 5],
      [5, 5, 5, 5, 6, 5, 5, 6],
      [5, 6, 5, 5, 5, 5, 5, 5],
      [5, 5, 5, 6, 5, 6, 5, 5],
    ],
  },
  sand: {
    id: 'sand',
    name: 'Beach Sand',
    category: 'terrain',
    spriteIndex: 7,
    x: 7,
    y: 0,
    defaultHeight: 0.08,
    pixels: [
      [6, 6, 12, 6, 6, 6, 6, 6],
      [6, 6, 6, 6, 6, 12, 6, 6],
      [12, 6, 6, 6, 6, 6, 6, 6],
      [6, 6, 6, 12, 6, 6, 6, 12],
      [6, 6, 6, 6, 6, 6, 6, 6],
      [6, 12, 6, 6, 6, 12, 6, 6],
      [6, 6, 6, 6, 6, 6, 6, 6],
      [6, 6, 12, 6, 6, 6, 6, 12],
    ],
  },
  water_deep: {
    id: 'water_deep',
    name: 'Ocean Water',
    category: 'terrain',
    spriteIndex: 8,
    x: 8,
    y: 0,
    defaultHeight: 0.04,
    pixels: [
      [10, 10, 10, 10, 11, 11, 10, 10],
      [10, 11, 11, 10, 10, 10, 10, 10],
      [10, 10, 10, 10, 10, 10, 11, 10],
      [10, 10, 11, 11, 10, 10, 10, 10],
      [11, 10, 10, 10, 10, 11, 11, 10],
      [10, 10, 10, 10, 10, 10, 10, 10],
      [10, 10, 11, 10, 10, 10, 10, 10],
      [10, 10, 10, 10, 11, 11, 10, 10],
    ],
  },
  water_shallow: {
    id: 'water_shallow',
    name: 'Shore Foam Water',
    category: 'terrain',
    spriteIndex: 9,
    x: 9,
    y: 0,
    defaultHeight: 0.06,
    pixels: [
      [11, 11, 9, 9, 11, 11, 11, 9],
      [11, 9, 9, 11, 11, 11, 9, 9],
      [11, 11, 11, 11, 9, 9, 11, 11],
      [9, 9, 11, 11, 11, 11, 11, 11],
      [11, 11, 11, 9, 9, 11, 11, 9],
      [11, 11, 11, 11, 11, 11, 9, 9],
      [9, 9, 11, 11, 11, 11, 11, 11],
      [11, 11, 9, 9, 11, 11, 9, 9],
    ],
  },
  rock: {
    id: 'rock',
    name: 'Mossy Boulder',
    category: 'nature',
    spriteIndex: 10,
    x: 10,
    y: 0,
    defaultHeight: 0.6,
    pixels: [
      [0, 0, 7, 7, 7, 7, 0, 0],
      [0, 7, 9, 7, 7, 1, 7, 0],
      [7, 9, 9, 7, 1, 1, 7, 7],
      [7, 7, 7, 7, 7, 8, 8, 7],
      [7, 7, 8, 8, 8, 8, 8, 7],
      [0, 7, 8, 8, 8, 8, 7, 0],
      [0, 0, 7, 7, 7, 7, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  mountain_low: {
    id: 'mountain_low',
    name: 'Slate Ridge',
    category: 'terrain',
    spriteIndex: 11,
    x: 11,
    y: 0,
    defaultHeight: 2.5,
    pixels: [
      [7, 7, 9, 9, 7, 7, 7, 7],
      [7, 9, 9, 9, 7, 8, 8, 7],
      [9, 9, 7, 7, 8, 8, 8, 7],
      [7, 7, 7, 8, 8, 8, 8, 8],
      [7, 8, 8, 8, 8, 8, 7, 7],
      [8, 8, 8, 8, 7, 7, 7, 7],
      [7, 7, 7, 7, 7, 7, 8, 8],
      [8, 8, 7, 7, 8, 8, 8, 8],
    ],
  },
  mountain_high: {
    id: 'mountain_high',
    name: 'Snow Peak',
    category: 'terrain',
    spriteIndex: 12,
    x: 12,
    y: 0,
    defaultHeight: 4.0,
    pixels: [
      [0, 0, 0, 9, 9, 0, 0, 0],
      [0, 0, 9, 9, 9, 9, 0, 0],
      [0, 9, 9, 9, 9, 9, 9, 0],
      [0, 9, 9, 7, 7, 9, 9, 0],
      [7, 7, 7, 7, 8, 8, 7, 7],
      [7, 7, 8, 8, 8, 8, 8, 7],
      [7, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
    ],
  },
  lava: {
    id: 'lava',
    name: 'Volcanic Lava',
    category: 'special',
    spriteIndex: 13,
    x: 13,
    y: 0,
    defaultHeight: 0.05,
    pixels: [
      [13, 13, 12, 13, 13, 13, 12, 13],
      [13, 12, 12, 13, 13, 12, 12, 13],
      [13, 13, 13, 13, 12, 12, 13, 13],
      [12, 12, 13, 13, 13, 13, 13, 12],
      [13, 13, 13, 12, 12, 13, 12, 12],
      [13, 12, 12, 13, 13, 13, 13, 13],
      [13, 13, 13, 13, 12, 12, 13, 13],
      [12, 12, 13, 13, 13, 13, 12, 12],
    ],
  },
  crystal: {
    id: 'crystal',
    name: 'Mana Crystal',
    category: 'special',
    spriteIndex: 14,
    x: 14,
    y: 0,
    defaultHeight: 0.8,
    pixels: [
      [0, 0, 0, 14, 0, 0, 0, 0],
      [0, 0, 14, 14, 14, 0, 0, 0],
      [0, 14, 11, 14, 14, 14, 0, 0],
      [0, 14, 11, 11, 14, 14, 0, 0],
      [0, 0, 14, 11, 14, 0, 0, 0],
      [0, 0, 14, 14, 14, 0, 0, 0],
      [0, 0, 0, 14, 0, 0, 0, 0],
      [7, 7, 7, 7, 7, 7, 7, 7],
    ],
  },
  cobblestone: {
    id: 'cobblestone',
    name: 'Dungeon Cobble',
    category: 'dungeon',
    spriteIndex: 15,
    x: 15,
    y: 0,
    defaultHeight: 0.12,
    pixels: [
      [7, 7, 8, 7, 7, 8, 7, 7],
      [7, 9, 8, 7, 9, 8, 7, 9],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [7, 8, 7, 7, 8, 7, 7, 8],
      [7, 8, 7, 9, 8, 7, 9, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [7, 7, 8, 7, 7, 8, 7, 7],
      [7, 9, 8, 7, 9, 8, 7, 9],
    ],
  },
  wall_stone: {
    id: 'wall_stone',
    name: 'Stone Brick Wall',
    category: 'dungeon',
    spriteIndex: 16,
    x: 0,
    y: 1,
    defaultHeight: 1.8,
    pixels: [
      [7, 7, 7, 8, 7, 7, 7, 8],
      [7, 9, 7, 8, 7, 9, 7, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [7, 8, 7, 7, 7, 8, 7, 7],
      [7, 8, 7, 9, 7, 8, 7, 9],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [7, 7, 7, 8, 7, 7, 7, 8],
      [7, 9, 7, 8, 7, 9, 7, 8],
    ],
  },
  wall_mossy: {
    id: 'wall_mossy',
    name: 'Mossy Ruin Wall',
    category: 'dungeon',
    spriteIndex: 17,
    x: 1,
    y: 1,
    defaultHeight: 1.8,
    pixels: [
      [7, 1, 7, 8, 7, 7, 7, 8],
      [1, 1, 7, 8, 7, 9, 7, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [7, 8, 7, 1, 7, 8, 7, 7],
      [7, 8, 1, 1, 7, 8, 7, 9],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [7, 7, 7, 8, 7, 1, 7, 8],
      [7, 9, 7, 8, 1, 1, 7, 8],
    ],
  },
  wall_cracked: {
    id: 'wall_cracked',
    name: 'Cracked Ancient Wall',
    category: 'dungeon',
    spriteIndex: 18,
    x: 2,
    y: 1,
    defaultHeight: 1.8,
    pixels: [
      [7, 7, 7, 8, 7, 7, 7, 8],
      [7, 8, 7, 8, 7, 9, 7, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [7, 8, 8, 7, 7, 8, 7, 7],
      [7, 8, 7, 8, 7, 8, 7, 9],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [7, 7, 7, 8, 8, 7, 7, 8],
      [7, 9, 7, 8, 7, 8, 7, 8],
    ],
  },
  door_wood: {
    id: 'door_wood',
    name: 'Oak Dungeon Door',
    category: 'dungeon',
    spriteIndex: 19,
    x: 3,
    y: 1,
    defaultHeight: 1.8,
    pixels: [
      [7, 7, 7, 7, 7, 7, 7, 7],
      [7, 5, 5, 5, 5, 5, 5, 7],
      [7, 5, 3, 5, 5, 3, 5, 7],
      [7, 5, 5, 5, 12, 5, 5, 7],
      [7, 5, 5, 5, 5, 5, 5, 7],
      [7, 5, 3, 5, 5, 3, 5, 7],
      [7, 5, 5, 5, 5, 5, 5, 7],
      [7, 7, 7, 7, 7, 7, 7, 7],
    ],
  },
  gate_iron: {
    id: 'gate_iron',
    name: 'Portcullis Iron Gate',
    category: 'dungeon',
    spriteIndex: 20,
    x: 4,
    y: 1,
    defaultHeight: 1.8,
    pixels: [
      [7, 7, 7, 7, 7, 7, 7, 7],
      [7, 9, 7, 9, 7, 9, 7, 7],
      [7, 9, 7, 9, 7, 9, 7, 7],
      [7, 7, 7, 7, 7, 7, 7, 7],
      [7, 9, 7, 9, 7, 9, 7, 7],
      [7, 9, 7, 9, 7, 9, 7, 7],
      [7, 7, 7, 7, 7, 7, 7, 7],
      [7, 8, 7, 8, 7, 8, 7, 7],
    ],
  },
  pillar: {
    id: 'pillar',
    name: 'Crypt Marble Pillar',
    category: 'dungeon',
    spriteIndex: 21,
    x: 5,
    y: 1,
    defaultHeight: 2.2,
    pixels: [
      [0, 9, 9, 9, 9, 9, 9, 0],
      [0, 0, 9, 7, 7, 9, 0, 0],
      [0, 0, 9, 7, 7, 9, 0, 0],
      [0, 0, 9, 7, 7, 9, 0, 0],
      [0, 0, 9, 7, 7, 9, 0, 0],
      [0, 0, 9, 7, 7, 9, 0, 0],
      [0, 0, 9, 7, 7, 9, 0, 0],
      [0, 9, 9, 9, 9, 9, 9, 0],
    ],
  },
  chest: {
    id: 'chest',
    name: 'Treasure Chest',
    category: 'dungeon',
    spriteIndex: 22,
    x: 6,
    y: 1,
    defaultHeight: 0.5,
    pixels: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 12, 12, 12, 12, 12, 12, 0],
      [0, 12, 5, 5, 5, 5, 12, 0],
      [0, 12, 12, 12, 12, 12, 12, 0],
      [0, 12, 5, 12, 12, 5, 12, 0],
      [0, 12, 5, 5, 5, 5, 12, 0],
      [0, 12, 12, 12, 12, 12, 12, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  spikes: {
    id: 'spikes',
    name: 'Iron Floor Spikes',
    category: 'dungeon',
    spriteIndex: 23,
    x: 7,
    y: 1,
    defaultHeight: 0.15,
    pixels: [
      [0, 9, 0, 0, 0, 9, 0, 0],
      [9, 7, 9, 0, 9, 7, 9, 0],
      [7, 8, 7, 0, 7, 8, 7, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 9, 0, 0, 0, 9, 0],
      [0, 9, 7, 9, 0, 9, 7, 9],
      [0, 7, 8, 7, 0, 7, 8, 7],
      [7, 7, 7, 7, 7, 7, 7, 7],
    ],
  },
  bones: {
    id: 'bones',
    name: 'Skeleton Remains',
    category: 'dungeon',
    spriteIndex: 24,
    x: 8,
    y: 1,
    defaultHeight: 0.12,
    pixels: [
      [0, 0, 9, 9, 9, 0, 0, 0],
      [0, 9, 8, 9, 8, 9, 0, 0],
      [0, 9, 9, 9, 9, 9, 0, 0],
      [0, 0, 9, 8, 9, 0, 0, 0],
      [0, 9, 0, 0, 0, 9, 0, 0],
      [9, 9, 9, 0, 9, 9, 9, 0],
      [0, 9, 0, 9, 0, 9, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  rune: {
    id: 'rune',
    name: 'Magic Circle',
    category: 'special',
    spriteIndex: 25,
    x: 9,
    y: 1,
    defaultHeight: 0.08,
    pixels: [
      [0, 0, 14, 14, 14, 14, 0, 0],
      [0, 14, 0, 14, 14, 0, 14, 0],
      [14, 0, 14, 0, 0, 14, 0, 14],
      [14, 14, 0, 14, 14, 0, 14, 14],
      [14, 14, 0, 14, 14, 0, 14, 14],
      [14, 0, 14, 0, 0, 14, 0, 14],
      [0, 14, 0, 14, 14, 0, 14, 0],
      [0, 0, 14, 14, 14, 14, 0, 0],
    ],
  },
  torch: {
    id: 'torch',
    name: 'Brazier / Wall Torch',
    category: 'dungeon',
    spriteIndex: 26,
    x: 10,
    y: 1,
    defaultHeight: 0.7,
    pixels: [
      [0, 0, 12, 13, 12, 0, 0, 0],
      [0, 12, 13, 13, 13, 12, 0, 0],
      [0, 0, 12, 12, 12, 0, 0, 0],
      [0, 0, 0, 5, 0, 0, 0, 0],
      [0, 0, 0, 5, 0, 0, 0, 0],
      [0, 0, 0, 5, 0, 0, 0, 0],
      [0, 0, 7, 7, 7, 0, 0, 0],
      [0, 7, 8, 8, 8, 7, 0, 0],
    ],
  },
};

export interface ExtraSpriteDef {
  spriteIndex: number;
  x: number;
  y: number;
  pixels: number[][];
}

export const EXTRA_SPRITE_DEFS: ExtraSpriteDef[] = [
  // Grass Variant 1 (index 27, x: 11, y: 1)
  {
    spriteIndex: 27,
    x: 11,
    y: 1,
    pixels: [
      [1, 1, 2, 1, 1, 3, 1, 1],
      [1, 3, 1, 1, 1, 3, 1, 1],
      [1, 3, 2, 1, 3, 1, 2, 1],
      [1, 1, 1, 3, 1, 1, 3, 1],
      [1, 1, 3, 1, 1, 3, 1, 1],
      [1, 3, 1, 2, 3, 1, 1, 1],
      [1, 1, 2, 1, 1, 2, 3, 1],
      [1, 1, 2, 1, 1, 3, 1, 1],
    ],
  },
  // Grass Variant 2 (index 28, x: 12, y: 1)
  {
    spriteIndex: 28,
    x: 12,
    y: 1,
    pixels: [
      [1, 1, 2, 1, 1, 3, 1, 1],
      [1, 2, 4, 1, 2, 1, 1, 1],
      [1, 4, 2, 1, 1, 4, 2, 1],
      [1, 1, 1, 4, 2, 1, 1, 1],
      [1, 2, 4, 1, 2, 1, 4, 1],
      [1, 1, 2, 4, 1, 2, 1, 1],
      [1, 3, 1, 2, 1, 1, 2, 1],
      [1, 1, 2, 1, 1, 3, 1, 1],
    ],
  },
  // Grass Variant 3 (index 29, x: 13, y: 1)
  {
    spriteIndex: 29,
    x: 13,
    y: 1,
    pixels: [
      [1, 1, 2, 1, 1, 3, 1, 1],
      [1, 1, 12, 1, 1, 1, 3, 1],
      [1, 3, 1, 1, 3, 12, 1, 1],
      [1, 1, 1, 2, 1, 1, 1, 1],
      [1, 12, 1, 1, 12, 1, 3, 1],
      [1, 1, 3, 1, 1, 1, 1, 1],
      [1, 1, 2, 12, 1, 2, 1, 1],
      [1, 1, 2, 1, 1, 3, 1, 1],
    ],
  },
  // Grass Variant 4 (index 30, x: 14, y: 1)
  {
    spriteIndex: 30,
    x: 14,
    y: 1,
    pixels: [
      [1, 1, 2, 1, 1, 3, 1, 1],
      [1, 3, 3, 1, 1, 2, 1, 1],
      [1, 3, 1, 3, 1, 3, 3, 1],
      [1, 1, 3, 1, 1, 3, 1, 1],
      [1, 2, 1, 1, 3, 3, 1, 1],
      [1, 1, 3, 3, 1, 3, 2, 1],
      [1, 2, 1, 3, 1, 1, 1, 1],
      [1, 1, 2, 1, 1, 3, 1, 1],
    ],
  },
  // Grass Variant 5 (index 31, x: 15, y: 1)
  {
    spriteIndex: 31,
    x: 15,
    y: 1,
    pixels: [
      [1, 1, 2, 1, 1, 3, 1, 1],
      [1, 1, 3, 1, 2, 1, 1, 1],
      [1, 3, 1, 2, 1, 3, 1, 1],
      [1, 1, 2, 1, 3, 1, 2, 1],
      [1, 2, 1, 3, 1, 2, 1, 1],
      [1, 3, 1, 1, 2, 1, 3, 1],
      [1, 1, 2, 3, 1, 1, 1, 1],
      [1, 1, 2, 1, 1, 3, 1, 1],
    ],
  },
  // Grass Variant 6 (index 32, x: 0, y: 2)
  {
    spriteIndex: 32,
    x: 0,
    y: 2,
    pixels: [
      [1, 1, 2, 1, 1, 3, 1, 1],
      [1, 3, 1, 3, 1, 1, 2, 1],
      [1, 1, 3, 1, 1, 3, 1, 1],
      [1, 3, 1, 1, 3, 1, 3, 1],
      [1, 1, 3, 1, 1, 3, 1, 1],
      [1, 2, 1, 3, 1, 1, 3, 1],
      [1, 1, 3, 1, 3, 2, 1, 1],
      [1, 1, 2, 1, 1, 3, 1, 1],
    ],
  },
  // Grass Variant 7 (index 33, x: 1, y: 2)
  {
    spriteIndex: 33,
    x: 1,
    y: 2,
    pixels: [
      [1, 1, 2, 1, 1, 3, 1, 1],
      [1, 2, 1, 5, 1, 2, 1, 1],
      [1, 1, 5, 1, 2, 1, 3, 1],
      [1, 1, 1, 2, 1, 5, 1, 1],
      [1, 3, 2, 1, 5, 1, 2, 1],
      [1, 1, 5, 1, 1, 2, 1, 1],
      [1, 2, 1, 3, 1, 1, 2, 1],
      [1, 1, 2, 1, 1, 3, 1, 1],
    ],
  },
];

export const GRASS_SPRITE_INDICES = [0, 27, 28, 29, 30, 31, 32, 33];

// Tile Atlas Cache
const atlasCache = new Map<string, THREE.CanvasTexture>();

export function clearSpriteAtlasCache(): void {
  atlasCache.forEach((tex) => tex.dispose());
  atlasCache.clear();
}

export function renderSpriteToCanvas(
  pixels: number[][],
  packId: SpritePackType = 'retro',
  targetCanvas?: HTMLCanvasElement,
  scale: number = 4
): HTMLCanvasElement {
  const pack = SPRITE_PACKS.find((p) => p.id === packId) || SPRITE_PACKS[0];
  const colors = pack.colors;

  const colorMap: Record<number, string> = {
    0: '#000000',
    1: colors.p1,
    2: colors.p2,
    3: colors.p3,
    4: colors.p4,
    5: colors.s1,
    6: colors.s2,
    7: colors.r1,
    8: colors.r2,
    9: colors.r3,
    10: colors.w1,
    11: colors.w2,
    12: colors.a1,
    13: colors.a2,
    14: colors.a3,
  };

  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = 8 * scale;
  canvas.height = 8 * scale;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const colorIdx = pixels[r]?.[c] ?? 0;
        ctx.fillStyle = colorMap[colorIdx] || colors.p1;
        ctx.fillRect(c * scale, r * scale, scale, scale);
      }
    }
  }

  return canvas;
}

export function generateSpriteAtlasCanvas(packId: SpritePackType = 'retro'): HTMLCanvasElement {
  const pack = SPRITE_PACKS.find((p) => p.id === packId) || SPRITE_PACKS[0];
  const colors = pack.colors;

  const colorMap: Record<number, string> = {
    0: '#000000',
    1: colors.p1,
    2: colors.p2,
    3: colors.p3,
    4: colors.p4,
    5: colors.s1,
    6: colors.s2,
    7: colors.r1,
    8: colors.r2,
    9: colors.r3,
    10: colors.w1,
    11: colors.w2,
    12: colors.a1,
    13: colors.a2,
    14: colors.a3,
  };

  const canvas = document.createElement('canvas');
  canvas.width = 128; // 16 sprites wide (16 * 8 = 128)
  canvas.height = 128; // 16 sprites high (16 * 8 = 128)
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 128, 128);

    const allSprites = [
      ...Object.values(SPRITE_DEFS),
      ...EXTRA_SPRITE_DEFS,
    ];

    allSprites.forEach((sprite) => {
      const startX = sprite.x * 8;
      const startY = sprite.y * 8;

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const colorIdx = sprite.pixels[r][c];
          if (colorIdx > 0) {
            ctx.fillStyle = colorMap[colorIdx] || colors.p1;
            ctx.fillRect(startX + c, startY + r, 1, 1);
          } else {
            ctx.fillStyle = '#000000';
            ctx.fillRect(startX + c, startY + r, 1, 1);
          }
        }
      }
    });
  }

  return canvas;
}

export function getSpriteAtlasTexture(packId: SpritePackType = 'retro'): THREE.CanvasTexture {
  if (atlasCache.has(packId)) {
    const cached = atlasCache.get(packId)!;
    if (cached && cached.image) {
      return cached;
    }
  }

  const canvas = generateSpriteAtlasCanvas(packId);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  atlasCache.set(packId, texture);
  return texture;
}

// Organic 2D Multi-Octave Noise for World Generation
function pseudoRandom2D(x: number, y: number, seed: number = 42): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise2D(x: number, y: number, seed: number = 42): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;

  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = pseudoRandom2D(i, j, seed);
  const n10 = pseudoRandom2D(i + 1, j, seed);
  const n01 = pseudoRandom2D(i, j + 1, seed);
  const n11 = pseudoRandom2D(i + 1, j + 1, seed);

  const nx0 = n00 + sx * (n10 - n00);
  const nx1 = n01 + sx * (n11 - n01);

  return nx0 + sy * (nx1 - nx0);
}

export function multiOctaveNoise2D(x: number, y: number, octaves = 3, persistence = 0.5, seed = 42): number {
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += smoothNoise2D(x * frequency, y * frequency, seed + i * 100) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxValue;
}

export function getGrassSpriteIndex(r: number, c: number, seed = 42): number {
  const n = multiOctaveNoise2D(r * 0.12, c * 0.12, 2, 0.5, seed + 888);
  const idx = Math.floor(n * GRASS_SPRITE_INDICES.length) % GRASS_SPRITE_INDICES.length;
  return GRASS_SPRITE_INDICES[idx];
}

// 64x64 Rich Nature & Dungeon World Generator with 25+ 8x8 Sprites
export function generateNaturalWorld(rows = 64, cols = 64, seed?: number): WorldCell[][] {
  const s = seed ?? Math.floor(Math.random() * 1000000);
  const grid: WorldCell[][] = Array.from({ length: rows }, () => new Array(cols));

  // 1. Generate Biomes via 2D Multi-Octave Noise
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const elev = multiOctaveNoise2D(r * 0.055, c * 0.055, 4, 0.52, s);
      const veg = multiOctaveNoise2D(r * 0.16, c * 0.16, 3, 0.5, s + 1234);
      const waterN = multiOctaveNoise2D(r * 0.038, c * 0.038, 2, 0.5, s + 5678);
      const specialN = multiOctaveNoise2D(r * 0.22, c * 0.22, 2, 0.5, s + 9999);

      if (waterN < 0.22 || elev < 0.24) {
        // Ocean Deep Water
        grid[r][c] = {
          type: 'water_deep',
          spriteIndex: SPRITE_DEFS.water_deep.spriteIndex,
          height: SPRITE_DEFS.water_deep.defaultHeight,
          name: SPRITE_DEFS.water_deep.name,
        };
      } else if (elev < 0.28) {
        // Shoreline Foam / Shallow Water
        grid[r][c] = {
          type: 'water_shallow',
          spriteIndex: SPRITE_DEFS.water_shallow.spriteIndex,
          height: SPRITE_DEFS.water_shallow.defaultHeight,
          name: SPRITE_DEFS.water_shallow.name,
        };
      } else if (elev < 0.34) {
        // Golden Beach Sand
        grid[r][c] = {
          type: 'sand',
          spriteIndex: SPRITE_DEFS.sand.spriteIndex,
          height: SPRITE_DEFS.sand.defaultHeight,
          name: SPRITE_DEFS.sand.name,
        };
      } else if (elev < 0.68) {
        // Meadow & Forest Region
        const grassSpriteIdx = getGrassSpriteIndex(r, c, s);

        if (veg > 0.65) {
          // Oak Trees
          grid[r][c] = {
            type: 'tree_oak',
            spriteIndex: grassSpriteIdx,
            height: SPRITE_DEFS.tree_oak.defaultHeight,
            name: SPRITE_DEFS.tree_oak.name,
          };
        } else if (veg > 0.48) {
          // Pine Trees
          grid[r][c] = {
            type: 'tree_pine',
            spriteIndex: grassSpriteIdx,
            height: SPRITE_DEFS.tree_pine.defaultHeight,
            name: SPRITE_DEFS.tree_pine.name,
          };
        } else if (veg > 0.38) {
          // Dense Shrub
          grid[r][c] = {
            type: 'bush',
            spriteIndex: grassSpriteIdx,
            height: SPRITE_DEFS.bush.defaultHeight,
            name: SPRITE_DEFS.bush.name,
          };
        } else if (specialN > 0.72) {
          // Wildflowers
          grid[r][c] = {
            type: 'flower',
            spriteIndex: grassSpriteIdx,
            height: SPRITE_DEFS.flower.defaultHeight,
            name: SPRITE_DEFS.flower.name,
          };
        } else if (specialN < 0.22) {
          // Red Mushroom
          grid[r][c] = {
            type: 'mushroom',
            spriteIndex: grassSpriteIdx,
            height: SPRITE_DEFS.mushroom.defaultHeight,
            name: SPRITE_DEFS.mushroom.name,
          };
        } else {
          // Meadow Grass
          grid[r][c] = {
            type: 'grass',
            spriteIndex: grassSpriteIdx,
            height: SPRITE_DEFS.grass.defaultHeight,
            name: SPRITE_DEFS.grass.name,
          };
        }
      } else if (elev < 0.78) {
        // Slate Mountain Ridge or Mossy Boulders
        if (veg > 0.5) {
          grid[r][c] = {
            type: 'rock',
            spriteIndex: SPRITE_DEFS.rock.spriteIndex,
            height: SPRITE_DEFS.rock.defaultHeight,
            name: SPRITE_DEFS.rock.name,
          };
        } else {
          grid[r][c] = {
            type: 'mountain_low',
            spriteIndex: SPRITE_DEFS.mountain_low.spriteIndex,
            height: SPRITE_DEFS.mountain_low.defaultHeight,
            name: SPRITE_DEFS.mountain_low.name,
          };
        }
      } else {
        // Snowcapped Peak or Volcanic / Mana Crystals
        if (specialN > 0.8) {
          grid[r][c] = {
            type: 'crystal',
            spriteIndex: SPRITE_DEFS.crystal.spriteIndex,
            height: SPRITE_DEFS.crystal.defaultHeight,
            name: SPRITE_DEFS.crystal.name,
          };
        } else if (specialN < 0.15) {
          grid[r][c] = {
            type: 'lava',
            spriteIndex: SPRITE_DEFS.lava.spriteIndex,
            height: SPRITE_DEFS.lava.defaultHeight,
            name: SPRITE_DEFS.lava.name,
          };
        } else {
          grid[r][c] = {
            type: 'mountain_high',
            spriteIndex: SPRITE_DEFS.mountain_high.spriteIndex,
            height: SPRITE_DEFS.mountain_high.defaultHeight,
            name: SPRITE_DEFS.mountain_high.name,
          };
        }
      }
    }
  }

  // 2. Scatter Ancient Dungeon Complexes & Crypt Ruins with 8x8 Dungeon Sprites
  let rng = s;
  function nextRng() {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  }

  const numRuins = 7;
  for (let i = 0; i < numRuins; i++) {
    const rw = Math.floor(nextRng() * 5) + 6; // 6 to 10 wide
    const rh = Math.floor(nextRng() * 5) + 6; // 6 to 10 high
    const rx = Math.floor(nextRng() * (cols - rw - 10)) + 5;
    const ry = Math.floor(nextRng() * (rows - rh - 10)) + 5;

    for (let r = ry; r < ry + rh; r++) {
      for (let c = rx; c < rx + rw; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          const isTopBottom = r === ry || r === ry + rh - 1;
          const isLeftRight = c === rx || c === rx + rw - 1;

          // Doorways / Gateway openings
          const isHorizontalDoor = isTopBottom && Math.abs(c - (rx + Math.floor(rw / 2))) <= 1;
          const isVerticalDoor = isLeftRight && Math.abs(r - (ry + Math.floor(rh / 2))) <= 1;

          if (isHorizontalDoor) {
            grid[r][c] = {
              type: 'door_wood',
              spriteIndex: SPRITE_DEFS.door_wood.spriteIndex,
              height: SPRITE_DEFS.door_wood.defaultHeight,
              name: SPRITE_DEFS.door_wood.name,
              isRuin: true,
            };
          } else if (isVerticalDoor) {
            grid[r][c] = {
              type: 'gate_iron',
              spriteIndex: SPRITE_DEFS.gate_iron.spriteIndex,
              height: SPRITE_DEFS.gate_iron.defaultHeight,
              name: SPRITE_DEFS.gate_iron.name,
              isRuin: true,
            };
          } else if (isTopBottom || isLeftRight) {
            // Alternate between Stone, Mossy, and Cracked Wall tiles
            const wallRoll = nextRng();
            let wallType: BlockTypeID = 'wall_stone';
            if (wallRoll < 0.4) wallType = 'wall_mossy';
            else if (wallRoll < 0.7) wallType = 'wall_cracked';

            grid[r][c] = {
              type: wallType,
              spriteIndex: SPRITE_DEFS[wallType].spriteIndex,
              height: SPRITE_DEFS[wallType].defaultHeight,
              name: SPRITE_DEFS[wallType].name,
              isRuin: true,
            };
          } else {
            // Interior Cobblestone Floor
            grid[r][c] = {
              type: 'cobblestone',
              spriteIndex: SPRITE_DEFS.cobblestone.spriteIndex,
              height: SPRITE_DEFS.cobblestone.defaultHeight,
              name: SPRITE_DEFS.cobblestone.name,
              isRuin: true,
            };
          }
        }
      }
    }

    // Add Crypt Pillars, Torches, Treasure Chests, Spikes, Bones, Magic Runes inside ruins
    const centerR = ry + Math.floor(rh / 2);
    const centerC = rx + Math.floor(rw / 2);

    // Pillars at interior corners
    const corners = [
      { r: ry + 2, c: rx + 2 },
      { r: ry + 2, c: rx + rw - 3 },
      { r: ry + rh - 3, c: rx + 2 },
      { r: ry + rh - 3, c: rx + rw - 3 },
    ];
    corners.forEach((pt) => {
      if (pt.r >= 0 && pt.r < rows && pt.c >= 0 && pt.c < cols) {
        grid[pt.r][pt.c] = {
          type: 'pillar',
          spriteIndex: SPRITE_DEFS.pillar.spriteIndex,
          height: SPRITE_DEFS.pillar.defaultHeight,
          name: SPRITE_DEFS.pillar.name,
          isRuin: true,
        };
      }
    });

    // Center Treasure Chest or Magic Rune
    if (nextRng() > 0.3) {
      grid[centerR][centerC] = {
        type: 'chest',
        spriteIndex: SPRITE_DEFS.chest.spriteIndex,
        height: SPRITE_DEFS.chest.defaultHeight,
        name: SPRITE_DEFS.chest.name,
        isRuin: true,
      };
    } else {
      grid[centerR][centerC] = {
        type: 'rune',
        spriteIndex: SPRITE_DEFS.rune.spriteIndex,
        height: SPRITE_DEFS.rune.defaultHeight,
        name: SPRITE_DEFS.rune.name,
        isRuin: true,
      };
    }

    // Torches next to entrance
    grid[ry + 1][rx + 1] = {
      type: 'torch',
      spriteIndex: SPRITE_DEFS.torch.spriteIndex,
      height: SPRITE_DEFS.torch.defaultHeight,
      name: SPRITE_DEFS.torch.name,
      isRuin: true,
    };

    // Bones / Skeleton
    grid[centerR + 1][centerC - 1] = {
      type: 'bones',
      spriteIndex: SPRITE_DEFS.bones.spriteIndex,
      height: SPRITE_DEFS.bones.defaultHeight,
      name: SPRITE_DEFS.bones.name,
      isRuin: true,
    };
  }

  return grid;
}

// Retro Web Audio Beep
let audioCtx: AudioContext | null = null;

export function playTerminalBeep(freq = 800, duration = 0.04) {
  try {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // Audio context policy
  }
}
