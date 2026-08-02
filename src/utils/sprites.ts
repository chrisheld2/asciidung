import * as THREE from 'three';
import { SpritePackType } from '../types';
import { SPRITE_PACKS, SPRITE_DEFS, EXTRA_SPRITE_DEFS } from './spriteDefs';

// Palette/sprite data and world generation live in ./spriteDefs and ./worldGen.
// They are re-exported here so existing imports keep working; this module is the
// Three.js/DOM-dependent half (atlas textures, canvas rendering, audio).
export * from './spriteDefs';
export * from './worldGen';

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
