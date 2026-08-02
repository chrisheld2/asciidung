// Seeded world generation. Pure: no Three.js, no DOM. Safe to run in a worker.
import { WorldCell, BlockTypeID } from '../types';
import { SPRITE_DEFS, GRASS_SPRITE_INDICES } from './spriteDefs';

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
