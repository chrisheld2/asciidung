import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BlockTypeID, SpritePackType } from '../types';
import { SPRITE_DEFS, SPRITE_PACKS } from './sprites';
import { TilePoolManager } from '../rendering/TilePoolManager';

// Cache for transparent leaf sprite textures
const leafTextureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Generates a crisp transparent CanvasTexture for a specific nature element.
 * Background pixels (0) are rendered fully transparent (rgba 0,0,0,0).
 */
export function getTransparentLeafTexture(
  blockType: BlockTypeID,
  packId: SpritePackType = 'retro'
): THREE.CanvasTexture {
  const cacheKey = `${blockType}_${packId}`;
  if (leafTextureCache.has(cacheKey)) {
    return leafTextureCache.get(cacheKey)!;
  }

  const def = SPRITE_DEFS[blockType] || SPRITE_DEFS.tree_oak;
  const pack = SPRITE_PACKS.find((p) => p.id === packId) || SPRITE_PACKS[0];
  const colors = pack.colors;

  const colorMap: Record<number, string> = {
    0: 'transparent',
    1: colors.p1, // Primary foliage / light green
    2: colors.p2, // Dark green
    3: colors.p3, // Light green / highlight
    4: colors.p4, // Deep green shadow
    5: colors.s1, // Soil / Bark brown
    6: colors.s2, // Light bark
    7: colors.r1, // Stone gray
    8: colors.r2, // Dark stone
    9: colors.r3, // Light silver
    10: colors.w1, // Water blue
    11: colors.w2, // Light blue
    12: colors.a1, // Gold / Fire yellow
    13: colors.a2, // Red / Accent
    14: colors.a3, // Purple magic
  };

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);

    // Render 16x16 or 8x8 pixel grid cleanly onto 128x128 canvas
    const rows = def.pixels.length;
    const cols = def.pixels[0].length;
    const cellW = 128 / cols;
    const cellH = 128 / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const colorIdx = def.pixels[r][c];
        if (colorIdx > 0 && colorMap[colorIdx] && colorMap[colorIdx] !== 'transparent') {
          ctx.fillStyle = colorMap[colorIdx];
          ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
        }
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  leafTextureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Safely merges BufferGeometries by normalizing them to non-indexed geometries
 * with matching position, normal, and uv attributes.
 */
function safeMerge(geometries: THREE.BufferGeometry[], useGroups = false): THREE.BufferGeometry {
  const normalized = geometries.map((geo) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) {
      g.computeVertexNormals();
    }
    if (!g.attributes.uv) {
      const posCount = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(posCount * 2), 2));
    }
    return g;
  });

  const merged = mergeGeometries(normalized, useGroups);
  if (!merged) {
    console.error('mergeGeometries returned null, using fallback geometry');
    return new THREE.BoxGeometry(1, 1, 1);
  }
  return useGroups ? merged : mergeVertices(merged);
}

export interface TreeModelAssets {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
}

// Global flag controlling tree model rendering (defaults to 3D Sprite mode with max 4 sprites)
export let USE_3D_SPRITE_TREES = true;

export function setUse3DSpriteTrees(enable: boolean) {
  USE_3D_SPRITE_TREES = enable;
  try {
    TilePoolManager.getInstance().clearTreeModelCache();
  } catch {
    // TilePoolManager may not be initialized yet
  }
}

// ============================================================================
// LIGHTWEIGHT 3-D SPRITE TREE MODELS (MAXIMUM 4 SPRITES PER MODEL)
// ============================================================================
//
// Foliage is alpha-CUTOUT, not alpha-blended: alphaTest gives the hard pixel
// edge the art style wants. Keep `transparent: false` on every material here.
// Setting it to true costs an extra full pass per mesh, because Three.js draws
// double-sided transparent materials back faces first, and it also forfeits
// early-Z and forces a back-to-front sort. Measured on the 64x64 default world,
// that one flag accounted for 55 of 115 draw calls.

/**
 * Creates 3D Sprite Oak Tree (Maximum 4 Sprites).
 * Uses 4 intersecting vertical billboard quads in a star pattern (0°, 45°, 90°, 135°).
 */
export function createOakTreeSpriteModel(packId: SpritePackType): TreeModelAssets {
  const quads: THREE.BufferGeometry[] = [];
  const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]; // Exactly 4 sprites

  const width = 1.6;
  const height = 2.0;

  angles.forEach((angle) => {
    const q = new THREE.PlaneGeometry(width, height);
    q.translate(0, height / 2, 0); // Origin at base of trunk
    q.rotateY(angle);
    quads.push(q);
  });

  const finalGeometry = safeMerge(quads);
  const texture = getTransparentLeafTexture('tree_oak', packId);

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.15,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.0,
  });

  return {
    geometry: finalGeometry,
    materials: [mat],
  };
}

/**
 * Creates 3D Sprite Pine Tree (Maximum 4 Sprites).
 * Uses 4 intersecting vertical billboard quads in a star pattern (0°, 45°, 90°, 135°).
 */
export function createPineTreeSpriteModel(packId: SpritePackType): TreeModelAssets {
  const quads: THREE.BufferGeometry[] = [];
  const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]; // Exactly 4 sprites

  const width = 1.5;
  const height = 2.4;

  angles.forEach((angle) => {
    const q = new THREE.PlaneGeometry(width, height);
    q.translate(0, height / 2, 0); // Origin at base of trunk
    q.rotateY(angle);
    quads.push(q);
  });

  const finalGeometry = safeMerge(quads);
  const texture = getTransparentLeafTexture('tree_pine', packId);

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.15,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.0,
  });

  return {
    geometry: finalGeometry,
    materials: [mat],
  };
}

/**
 * Creates 3D Sprite Bush (Maximum 4 Sprites).
 * Uses 3 vertical billboard quads (0°, 60°, 120°) + 1 top horizontal canopy cap quad (4 sprites total).
 */
export function createBushSpriteModel(packId: SpritePackType): TreeModelAssets {
  const quads: THREE.BufferGeometry[] = [];

  const width = 1.3;
  const height = 1.0;
  [0, Math.PI / 3, (2 * Math.PI) / 3].forEach((angle) => {
    const q = new THREE.PlaneGeometry(width, height);
    q.translate(0, height / 2, 0);
    q.rotateY(angle);
    quads.push(q);
  });

  const topQuad = new THREE.PlaneGeometry(1.1, 1.1);
  topQuad.rotateX(-Math.PI / 2);
  topQuad.translate(0, height * 0.85, 0);
  quads.push(topQuad);

  const finalGeometry = safeMerge(quads);
  const texture = getTransparentLeafTexture('bush', packId);

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.15,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });

  return {
    geometry: finalGeometry,
    materials: [mat],
  };
}

/**
 * Creates 3D Sprite Mushroom (Maximum 4 Sprites).
 * Uses 3 vertical billboard quads (0°, 60°, 120°) + 1 top horizontal cap quad (4 sprites total).
 */
export function createMushroomSpriteModel(packId: SpritePackType): TreeModelAssets {
  const quads: THREE.BufferGeometry[] = [];

  const width = 0.8;
  const height = 0.75;
  [0, Math.PI / 3, (2 * Math.PI) / 3].forEach((angle) => {
    const q = new THREE.PlaneGeometry(width, height);
    q.translate(0, height / 2, 0);
    q.rotateY(angle);
    quads.push(q);
  });

  const topQuad = new THREE.PlaneGeometry(0.7, 0.7);
  topQuad.rotateX(-Math.PI / 2);
  topQuad.translate(0, height * 0.85, 0);
  quads.push(topQuad);

  const finalGeometry = safeMerge(quads);
  const texture = getTransparentLeafTexture('mushroom', packId);

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.15,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    roughness: 0.5,
  });

  return {
    geometry: finalGeometry,
    materials: [mat],
  };
}

// ============================================================================
// SAVED LEGACY HEAVY 3D GEOMETRY TREE MESH MODELS (DISABLED BY DEFAULT)
// ============================================================================

/**
 * [SAVED LEGACY MESH] Creates Low-Poly Oak Tree Geometry & Material Set.
 * Features: Tapered 6-sided bark trunk, angled branch stubs, low-poly foliage core,
 * and multi-angled 3D leaf sprite billboards.
 */
export function createLegacyOakTreeModel(packId: SpritePackType): TreeModelAssets {
  const pack = SPRITE_PACKS.find((p) => p.id === packId) || SPRITE_PACKS[0];

  // 1. Trunk & Branches
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.24, 1.2, 6);
  trunkGeo.translate(0, 0.6, 0);

  const branch1 = new THREE.CylinderGeometry(0.04, 0.08, 0.45, 5);
  branch1.rotateZ(-0.6);
  branch1.rotateY(0.5);
  branch1.translate(0.08, 0.95, 0);

  const branch2 = new THREE.CylinderGeometry(0.04, 0.07, 0.4, 5);
  branch2.rotateZ(0.5);
  branch2.rotateY(2.1);
  branch2.translate(-0.06, 1.05, 0.04);

  const trunkMerged = safeMerge([trunkGeo, branch1, branch2]);

  // 2. Low-Poly Foliage Canopy Core
  const canopyCore1 = new THREE.IcosahedronGeometry(0.65, 0);
  canopyCore1.translate(0, 1.45, 0);

  const canopyCore2 = new THREE.IcosahedronGeometry(0.45, 0);
  canopyCore2.translate(0.3, 1.35, 0.2);

  const canopyCore3 = new THREE.IcosahedronGeometry(0.42, 0);
  canopyCore3.translate(-0.3, 1.4, -0.15);

  const canopyMerged = safeMerge([canopyCore1, canopyCore2, canopyCore3]);

  // 3. 3D Leaf Sprites (Intersecting 3D Billboard Quad Planes)
  const leafQuads: THREE.BufferGeometry[] = [];
  const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];

  // Vertical star billboard quads around canopy center
  angles.forEach((angle) => {
    const q = new THREE.PlaneGeometry(1.4, 1.4);
    q.rotateY(angle);
    q.translate(0, 1.45, 0);
    leafQuads.push(q);
  });

  // Top horizontal cap quad
  const topQuad = new THREE.PlaneGeometry(1.25, 1.25);
  topQuad.rotateX(-Math.PI / 2);
  topQuad.translate(0, 1.85, 0);
  leafQuads.push(topQuad);

  // Bottom angled cap quad
  const bottomQuad = new THREE.PlaneGeometry(1.1, 1.1);
  bottomQuad.rotateX(Math.PI / 3);
  bottomQuad.rotateY(Math.PI / 6);
  bottomQuad.translate(0, 1.15, 0);
  leafQuads.push(bottomQuad);

  const leafSpritesMerged = safeMerge(leafQuads);

  // Combine into single grouped BufferGeometry with groups for multi-materials
  const finalGeometry = safeMerge(
    [trunkMerged, canopyMerged, leafSpritesMerged],
    true
  );

  // Materials
  const barkMat = new THREE.MeshStandardMaterial({
    color: pack.colors.s1,
    roughness: 0.9,
    metalness: 0.1,
  });

  const coreMat = new THREE.MeshStandardMaterial({
    color: pack.colors.p2,
    roughness: 0.8,
    metalness: 0.0,
  });

  const leafTexture = getTransparentLeafTexture('tree_oak', packId);
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTexture,
    transparent: false,
    alphaTest: 0.5,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.0,
  });

  return {
    geometry: finalGeometry,
    materials: [barkMat, coreMat, leafMat],
  };
}

/**
 * [SAVED LEGACY MESH] Creates Low-Poly Pine Tree Geometry & Material Set.
 * Features: Tall slender trunk, tiered low-poly conical foliage, and 3D needle sprite billboards.
 */
export function createLegacyPineTreeModel(packId: SpritePackType): TreeModelAssets {
  const pack = SPRITE_PACKS.find((p) => p.id === packId) || SPRITE_PACKS[0];

  // 1. Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.2, 1.8, 6);
  trunkGeo.translate(0, 0.9, 0);

  // 2. Low-Poly Conical Canopy Tiers
  const tier1 = new THREE.ConeGeometry(0.75, 0.8, 6);
  tier1.translate(0, 1.1, 0);

  const tier2 = new THREE.ConeGeometry(0.6, 0.7, 6);
  tier2.translate(0, 1.5, 0);

  const tier3 = new THREE.ConeGeometry(0.42, 0.6, 6);
  tier3.translate(0, 1.85, 0);

  const canopyMerged = safeMerge([tier1, tier2, tier3]);

  // 3. 3D Pine Needle Sprites
  const needleQuads: THREE.BufferGeometry[] = [];

  // Tier 1 star needle quads
  [0, Math.PI / 3, (2 * Math.PI) / 3].forEach((ang) => {
    const q = new THREE.PlaneGeometry(1.3, 0.85);
    q.rotateY(ang);
    q.translate(0, 1.05, 0);
    needleQuads.push(q);
  });

  // Tier 2 star needle quads
  [Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6].forEach((ang) => {
    const q = new THREE.PlaneGeometry(1.05, 0.75);
    q.rotateY(ang);
    q.translate(0, 1.45, 0);
    needleQuads.push(q);
  });

  // Tier 3 star needle quads
  [0, Math.PI / 3, (2 * Math.PI) / 3].forEach((ang) => {
    const q = new THREE.PlaneGeometry(0.8, 0.6);
    q.rotateY(ang);
    q.translate(0, 1.8, 0);
    needleQuads.push(q);
  });

  const needlesMerged = safeMerge(needleQuads);

  const finalGeometry = safeMerge(
    [trunkGeo, canopyMerged, needlesMerged],
    true
  );

  const barkMat = new THREE.MeshStandardMaterial({
    color: pack.colors.s3 || pack.colors.s1,
    roughness: 0.9,
    metalness: 0.1,
  });

  const coreMat = new THREE.MeshStandardMaterial({
    color: pack.colors.p4 || pack.colors.p2,
    roughness: 0.8,
    metalness: 0.0,
  });

  const leafTexture = getTransparentLeafTexture('tree_pine', packId);
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTexture,
    transparent: false,
    alphaTest: 0.5,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.0,
  });

  return {
    geometry: finalGeometry,
    materials: [barkMat, coreMat, leafMat],
  };
}

/**
 * [SAVED LEGACY MESH] Creates Low-Poly Bush / Shrub Model.
 */
export function createLegacyBushModel(packId: SpritePackType): TreeModelAssets {
  const pack = SPRITE_PACKS.find((p) => p.id === packId) || SPRITE_PACKS[0];

  // 1. Stem
  const stem = new THREE.CylinderGeometry(0.04, 0.08, 0.25, 5);
  stem.translate(0, 0.125, 0);

  // 2. Foliage Core
  const core = new THREE.DodecahedronGeometry(0.38);
  core.scale(1.1, 0.85, 1.1);
  core.translate(0, 0.35, 0);

  // 3. 3D Leaf Sprites
  const leafQuads: THREE.BufferGeometry[] = [];
  [0, Math.PI / 3, (2 * Math.PI) / 3].forEach((ang) => {
    const q = new THREE.PlaneGeometry(0.8, 0.7);
    q.rotateY(ang);
    q.translate(0, 0.35, 0);
    leafQuads.push(q);
  });

  const topQ = new THREE.PlaneGeometry(0.7, 0.7);
  topQ.rotateX(-Math.PI / 2);
  topQ.translate(0, 0.55, 0);
  leafQuads.push(topQ);

  const leafMerged = safeMerge(leafQuads);

  const finalGeometry = safeMerge([stem, core, leafMerged], true);

  const stemMat = new THREE.MeshStandardMaterial({
    color: pack.colors.s1,
    roughness: 0.9,
  });

  const coreMat = new THREE.MeshStandardMaterial({
    color: pack.colors.p1,
    roughness: 0.8,
  });

  const leafTexture = getTransparentLeafTexture('bush', packId);
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTexture,
    transparent: false,
    alphaTest: 0.5,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });

  return {
    geometry: finalGeometry,
    materials: [stemMat, coreMat, leafMat],
  };
}

/**
 * [SAVED LEGACY MESH] Creates Low-Poly Mushroom Model with 3D Cap Sprites.
 */
export function createLegacyMushroomModel(packId: SpritePackType): TreeModelAssets {
  const pack = SPRITE_PACKS.find((p) => p.id === packId) || SPRITE_PACKS[0];

  // 1. Stalk & Under-Cap Gills (Main Mushroom)
  const stalk = new THREE.CylinderGeometry(0.06, 0.1, 0.45, 7);
  stalk.translate(0, 0.225, 0);

  const gills = new THREE.CylinderGeometry(0.2, 0.08, 0.08, 7);
  gills.translate(0, 0.42, 0);

  // Baby mushroom stalk
  const babyStalk = new THREE.CylinderGeometry(0.03, 0.05, 0.25, 6);
  babyStalk.translate(0.22, 0.125, 0.1);

  const stalksMerged = safeMerge([stalk, gills, babyStalk]);

  // 2. Low-Poly Cap Cores
  const mainCapCore = new THREE.ConeGeometry(0.38, 0.28, 8);
  mainCapCore.translate(0, 0.52, 0);

  const babyCapCore = new THREE.ConeGeometry(0.2, 0.15, 6);
  babyCapCore.translate(0.22, 0.28, 0.1);

  const capsMerged = safeMerge([mainCapCore, babyCapCore]);

  // 3. 3D Mushroom Cap & Dot Sprites (Intersecting 3D Billboard Quad Planes)
  const capQuads: THREE.BufferGeometry[] = [];
  [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].forEach((ang) => {
    const q = new THREE.PlaneGeometry(0.85, 0.7);
    q.rotateY(ang);
    q.translate(0, 0.48, 0);
    capQuads.push(q);
  });

  const topQuad = new THREE.PlaneGeometry(0.75, 0.75);
  topQuad.rotateX(-Math.PI / 2);
  topQuad.translate(0, 0.66, 0);
  capQuads.push(topQuad);

  // Baby mushroom quad
  const babyQuad = new THREE.PlaneGeometry(0.45, 0.42);
  babyQuad.rotateY(Math.PI / 4);
  babyQuad.translate(0.22, 0.28, 0.1);
  capQuads.push(babyQuad);

  const capSpritesMerged = safeMerge(capQuads);

  const finalGeometry = safeMerge([stalksMerged, capsMerged, capSpritesMerged], true);

  const stalkMat = new THREE.MeshStandardMaterial({
    color: pack.colors.r3 || '#e2e8f0',
    roughness: 0.8,
  });

  const capCoreMat = new THREE.MeshStandardMaterial({
    color: pack.colors.a2 || pack.colors.p1,
    roughness: 0.6,
  });

  const capTexture = getTransparentLeafTexture('mushroom', packId);
  const capSpriteMat = new THREE.MeshStandardMaterial({
    map: capTexture,
    transparent: false,
    alphaTest: 0.5,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    roughness: 0.5,
  });

  return {
    geometry: finalGeometry,
    materials: [stalkMat, capCoreMat, capSpriteMat],
  };
}

// ============================================================================
// MAIN MODEL DISPATCHERS
// ============================================================================

export function createOakTreeModel(packId: SpritePackType): TreeModelAssets {
  return USE_3D_SPRITE_TREES
    ? createOakTreeSpriteModel(packId)
    : createLegacyOakTreeModel(packId);
}

export function createPineTreeModel(packId: SpritePackType): TreeModelAssets {
  return USE_3D_SPRITE_TREES
    ? createPineTreeSpriteModel(packId)
    : createLegacyPineTreeModel(packId);
}

export function createBushModel(packId: SpritePackType): TreeModelAssets {
  return USE_3D_SPRITE_TREES
    ? createBushSpriteModel(packId)
    : createLegacyBushModel(packId);
}

export function createMushroomModel(packId: SpritePackType): TreeModelAssets {
  return USE_3D_SPRITE_TREES
    ? createMushroomSpriteModel(packId)
    : createLegacyMushroomModel(packId);
}



