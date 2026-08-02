import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ColorTheme, CameraPreset, SpritePackType, RenderMetrics, DayNightState, LightEmitter, LightType } from '../types';
import {
  TileDataEngine,
  BLOCK_ID_EMPTY,
  BLOCK_ID_TREE_OAK,
  BLOCK_ID_TREE_PINE,
  BLOCK_ID_BUSH,
  isFoliageBlock,
  isMountainBlock,
} from './TileData';
import { TilePoolManager } from './TilePoolManager';
import { FrustumCuller } from './FrustumCuller';
import { findMountainClusters, buildMountainMeshForRegion, MountainCluster } from '../utils/mountainMesh';
import { SPRITE_DEFS } from '../utils/spriteDefs';
import { EntityStore, EntityType } from '../game/EntityStore';
import { UpdateScheduler } from '../game/UpdateScheduler';
import { EntityRenderer } from '../game/EntityRenderer';

// Ground slab drawn beneath foliage tiles.
const FOLIAGE_GROUND_HEIGHT = 0.1;

// Emitters considered by the fake-lighting mode, nearest first.
const MAX_FAKE_LIGHT_EMITTERS = 24;

// Time budgets for world building, in milliseconds. buildWorld spends at most
// the first budget before handing the remainder to the frame loop, which then
// spends at most the second per frame. Both always complete at least one chunk,
// so a single-chunk world (the 64x64 default) still finishes in one call.
const INITIAL_BUILD_BUDGET_MS = 8;
const PER_FRAME_BUILD_BUDGET_MS = 4;

// Entities have no behaviour yet; the scheduler is wired up and banding so that
// gameplay systems slot in without revisiting the frame loop.
const NOOP_ENTITY_UPDATE = () => {};

// Exponential rate for the day/night sun interpolation, in units of 1/second.
// -ln(1 - 0.08) * 60 reproduces the old per-frame 0.08 lerp at 60 FPS.
const DAY_NIGHT_LERP_RATE = 5.0;

// MODULE-SCOPED SCRATCHPAD OBJECTS FOR ZERO-ALLOCATION RENDER LOOP
const _tempVec3_1 = new THREE.Vector3();
const _tempVec3_2 = new THREE.Vector3();
const _tempVec3_3 = new THREE.Vector3();
const _tempMat4_1 = new THREE.Matrix4();
const _tempQuat_1 = new THREE.Quaternion();
const _tempEuler_1 = new THREE.Euler();
const _tempColor_1 = new THREE.Color();
const _tempColor_2 = new THREE.Color();
const _lightFrustum = new THREE.Frustum();
const _lightProjScreenMatrix = new THREE.Matrix4();
const _lightInfluenceSphere = new THREE.Sphere();
const _mouseNdc = new THREE.Vector2();
const _mouseRaycaster = new THREE.Raycaster();
const _mouseLightHit = new THREE.Vector3();

const _rightVec = new THREE.Vector3();
const _upVec = new THREE.Vector3();
const _forwardVec = new THREE.Vector3();
const _panDeltaVec = new THREE.Vector3();

// Reused across pointer picks so a moving cursor allocates nothing.
const _raycastTargets: THREE.Object3D[] = [];
const _raycastHits: THREE.Intersection[] = [];

// Hoisted so sorting the emitter list does not allocate a closure per call.
const byDistanceSq = (a: LightEmitter, b: LightEmitter) => (a.distSq || 0) - (b.distSq || 0);

interface TreeInstanceData {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

interface TerrainInstanceData {
  x: number;
  y: number;
  z: number;
  height: number;
  spriteIndex: number;
}

/**
 * TileRenderer
 * High-performance, GPU-offloaded tile rendering architecture.
 * Enforces ZERO runtime allocations in render frame updates.
 */
export class TileRenderer {
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public perspCamera: THREE.PerspectiveCamera;
  public orthoCamera: THREE.OrthographicCamera;
  public activeCamera: THREE.Camera;
  public controls: OrbitControls;

  public worldGroup: THREE.Group;
  public floorMesh: THREE.Mesh | null = null;
  private adventurerTexture: THREE.Texture;

  // Lights
  public ambientLight: THREE.AmbientLight;
  public dirLight: THREE.DirectionalLight;
  public fillLight: THREE.DirectionalLight;
  public centerLight: THREE.PointLight;
  public mouseLight: THREE.PointLight;
  public lightPool: THREE.PointLight[] = [];
  private pooledEmitters: Array<LightEmitter | null> = [];
  private mouseLightActive = false;

  // Managers
  public poolManager: TilePoolManager;
  public frustumCuller: FrustumCuller;

  // Current visual time in minutes (smooth interpolation)
  public currentVisualMinutes = 720;
  public time = 0;

  // Pre-allocated light emitters array for sorting without GC
  private lightEmitters: LightEmitter[] = [];

  // Light Setting Mode ('realtime' | 'fake')
  public lightType: LightType = 'realtime';

  // Fake Lighting Resources & LoS Grid State
  public fakeLightGroup: THREE.Group;
  public fakeLightSourcesMesh: THREE.InstancedMesh;
  public lightTintMesh: THREE.InstancedMesh;
  private tintGeometry: THREE.BufferGeometry;
  private tintMaterial: THREE.Material;
  private tileHeights: Float32Array = new Float32Array(0);
  private tintAttenuation: Float32Array = new Float32Array(0);
  private tintDirty = true;
  private lastLightType: LightType = 'realtime';

  // World dimensions, mirrored from the tile engine on every build. Nothing in
  // this class may assume 64x64: the data engine resizes for any world, and
  // hardcoding the old default silently truncated buffers and left instanced
  // draws reading past the end of their attributes.
  private rows = 0;
  private cols = 0;
  private centerX = 0;
  private centerZ = 0;

  // Geometry this renderer owns for the current world and must dispose on
  // rebuild. Shared cache resources are deliberately excluded.
  private ownedGeometries: THREE.BufferGeometry[] = [];
  private ownedMaterials: THREE.Material[] = [];
  private adventurerMaterial: THREE.SpriteMaterial | null = null;

  // In-flight world build. Chunks are built a few per frame so a large world
  // streams in instead of freezing the main thread for hundreds of milliseconds.
  // Retained so the fake-light tint can be baked lazily, after the build.
  private buildTileEngine: TileDataEngine | null = null;

  // Entities. The store is columns of typed arrays, the scheduler updates them
  // at a rate that falls off with distance, and the renderer draws each visual
  // type in a single instanced call.
  public entities = new EntityStore(1024);
  public entityScheduler = new UpdateScheduler(1024);
  private entityRenderer: EntityRenderer | null = null;

  private buildJob: {
    tileEngine: TileDataEngine;
    spritePack: SpritePackType;
    clusters: MountainCluster[];
    pending: number[];
  } | null = null;

  // Latest pointer position, resolved to a world hit once per frame rather than
  // once per pointer event.
  private pendingPointerX = 0;
  private pendingPointerY = 0;
  private hasPendingPointer = false;

  // Light update dirty checking
  private lastTargetX = NaN;
  private lastTargetZ = NaN;
  private lastSunY = NaN;
  private lastShadowSunX = NaN;
  private lastShadowSunY = NaN;
  private lastShadowSunZ = NaN;

  constructor(container: HTMLDivElement, isOrthographic = true, theme: ColorTheme) {
    this.poolManager = TilePoolManager.getInstance();
    this.poolManager.retain();
    this.frustumCuller = new FrustumCuller(64);

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0e14');
    this.scene.fog = new THREE.FogExp2('#0b0e14', 0.0015);

    // 2. Cameras
    const aspect = container.clientWidth / container.clientHeight || 1;

    // Near/far are sized to the world, not left at 0.1/3000. A 30,000:1 depth
    // range spends almost all of its precision in the first few units and
    // invites z-fighting; the whole scene lives within a couple of hundred units
    // of the camera.
    this.perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.5, 600);

    const mapDiagonal = Math.hypot(64, 64);
    const baseFrustumSize = Math.max(68, mapDiagonal * 0.78);
    let orthoWidth = baseFrustumSize;
    let orthoHeight = baseFrustumSize;

    if (aspect >= 1.0) {
      orthoWidth = baseFrustumSize * aspect;
      orthoHeight = baseFrustumSize;
    } else {
      orthoWidth = baseFrustumSize;
      orthoHeight = baseFrustumSize / aspect;
    }

    this.orthoCamera = new THREE.OrthographicCamera(
      -orthoWidth / 2,
      orthoWidth / 2,
      orthoHeight / 2,
      -orthoHeight / 2,
      -1000,
      3000
    );

    this.activeCamera = isOrthographic ? this.orthoCamera : this.perspCamera;

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.updateAdaptivePixelRatio(container.clientWidth || 800, container.clientHeight || 600);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    container.appendChild(this.renderer.domElement);

    // 4. OrbitControls
    this.controls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 350;
    this.controls.minZoom = 0.15;
    this.controls.maxZoom = 12.0;

    // 5. Lights
    this.ambientLight = new THREE.AmbientLight(theme.ambient, 1.8);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    this.dirLight.position.set(60, 90, 60);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 400;
    this.dirLight.shadow.camera.left = -65;
    this.dirLight.shadow.camera.right = 65;
    this.dirLight.shadow.camera.top = 65;
    this.dirLight.shadow.camera.bottom = -65;
    this.dirLight.shadow.bias = -0.0003;
    this.dirLight.shadow.normalBias = 0.02;
    // The world is static, so only refresh the shadow atlas when the sun moves
    // meaningfully instead of redrawing every shadow caster every frame.
    this.dirLight.shadow.autoUpdate = false;
    this.dirLight.shadow.needsUpdate = true;
    this.scene.add(this.dirLight);

    this.fillLight = new THREE.DirectionalLight(theme.light, 0.8);
    this.fillLight.position.set(-60, 40, -60);
    this.scene.add(this.fillLight);

    this.centerLight = new THREE.PointLight(theme.light, 3.5, 80);
    this.scene.add(this.centerLight);


    // A dedicated, non-shadow-casting light follows the cursor's raycast hit.
    // It stays outside the emitter pool so moving the pointer never reshuffles
    // gameplay lights.
    this.mouseLight = new THREE.PointLight(0xfff1c1, 4.5, 18, 2);
    this.mouseLight.castShadow = false;
    this.mouseLight.visible = false;
    this.scene.add(this.mouseLight);

    // Forward rendering pays the point-light cost in every lit fragment. Keep a
    // strict six-light budget, and preserve each assignment until its influence
    // has actually left the camera view.
    const MAX_POOLED_LIGHTS = 6;
    for (let i = 0; i < MAX_POOLED_LIGHTS; i++) {
      const pl = new THREE.PointLight(0xffaa44, 0, 16);
      pl.castShadow = false;
      pl.visible = false;
      this.scene.add(pl);
      this.lightPool.push(pl);
      this.pooledEmitters.push(null);
    }

    // 6. World Root Container
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    // The player is a camera-facing 2D billboard, kept as a texture so it can
    // sit naturally among the 3D dungeon blocks. Nearest magnification keeps the
    // pixels crisp; mipmaps stop it shimmering when the camera zooms out (safe
    // here, unlike the tile atlas, because this texture holds a single sprite
    // with nothing adjacent to bleed into).
    this.adventurerTexture = new THREE.TextureLoader().load('/assets/sprites/adventurer-2d.png');
    this.adventurerTexture.colorSpace = THREE.SRGBColorSpace;
    this.adventurerTexture.magFilter = THREE.NearestFilter;
    this.adventurerTexture.minFilter = THREE.NearestMipmapLinearFilter;
    this.adventurerTexture.generateMipmaps = true;

    // 7. Fake Light Mode Visual Objects (Glowing Light Sources & Distance Light Tint)
    const sourceGeo = new THREE.OctahedronGeometry(0.35, 1);
    // No `vertexColors` here. It makes the shader multiply by a `color` VERTEX
    // attribute, which this geometry does not have - WebGL then supplies
    // (0, 0, 0) and everything renders black. Per-instance colours come from
    // setColorAt/instanceColor, which Three.js wires up independently.
    const sourceMat = new THREE.MeshBasicMaterial({});
    this.fakeLightSourcesMesh = new THREE.InstancedMesh(sourceGeo, sourceMat, 256);
    this.fakeLightSourcesMesh.frustumCulled = false;

    this.tintGeometry = new THREE.PlaneGeometry(1.001, 1.001);
    this.tintGeometry.rotateX(-Math.PI / 2);
    this.tintMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      // Same as above: per-tile colour arrives via instanceColor. Setting
      // vertexColors made this whole layer render black, which is why fake
      // lighting mode showed nothing but silhouettes.
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      // These quads always face up and are only ever viewed from above, so
      // back faces are pure wasted fill on an already blended full-map layer.
      side: THREE.FrontSide,
    });
    // Sized to the real tile count on every build. A fixed 4096 capacity meant
    // that any world larger than 64x64 issued an instanced draw for more
    // instances than the matrix buffer held.
    this.lightTintMesh = new THREE.InstancedMesh(this.tintGeometry, this.tintMaterial, 1);
    this.lightTintMesh.frustumCulled = false;

    this.fakeLightGroup = new THREE.Group();
    this.fakeLightGroup.add(this.fakeLightSourcesMesh);
    this.fakeLightGroup.add(this.lightTintMesh);
    this.fakeLightGroup.visible = false;
    this.scene.add(this.fakeLightGroup);
  }

  /**
   * Record the pointer position. The raycast itself is deferred to the next
   * frame: pointer events arrive at 60-120+ Hz, and picking against every
   * terrain and foliage instance costs about a millisecond each time. Resolving
   * once per rendered frame gives an identical result - the light can only move
   * once per frame anyway - for a fraction of the work.
   */
  public updateMouseLightFromPointer(clientX: number, clientY: number): void {
    this.pendingPointerX = clientX;
    this.pendingPointerY = clientY;
    this.hasPendingPointer = true;
  }

  public hideMouseLight(): void {
    this.hasPendingPointer = false;
    this.mouseLightActive = false;
    this.mouseLight.visible = false;
  }

  /**
   * Cast the most recent pointer position through the active camera and place
   * the cursor light just above the first piece of world geometry it hits.
   */
  private resolvePointerLight(): void {
    if (!this.hasPendingPointer) return;
    this.hasPendingPointer = false;

    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    _mouseNdc.set(
      ((this.pendingPointerX - bounds.left) / bounds.width) * 2 - 1,
      -((this.pendingPointerY - bounds.top) / bounds.height) * 2 + 1
    );

    // Matrices are already current: updateFrame refreshes them before this runs.
    _mouseRaycaster.setFromCamera(_mouseNdc, this.activeCamera);

    _raycastTargets.length = 0;
    _raycastTargets.push(this.worldGroup);
    if (this.floorMesh) _raycastTargets.push(this.floorMesh);

    _raycastHits.length = 0;
    _mouseRaycaster.intersectObjects(_raycastTargets, true, _raycastHits);

    if (_raycastHits.length === 0) {
      this.mouseLightActive = false;
      this.mouseLight.visible = false;
      return;
    }

    _mouseLightHit.copy(_raycastHits[0].point);
    _mouseLightHit.y += 1.25;
    this.mouseLight.position.copy(_mouseLightHit);
    this.mouseLightActive = true;
    this.mouseLight.visible = this.lightType === 'realtime';
    _raycastHits.length = 0;
  }

  /**
   * Build one pending chunk: its terrain batches, its foliage and its mountains.
   *
   * Everything a chunk owns lives under `chunk.group`, so it culls as a unit and
   * a future streaming layer can add and drop chunks without touching the rest
   * of the scene.
   */
  private buildNextChunk(): boolean {
    const job = this.buildJob;
    if (!job || job.pending.length === 0) return false;

    const chunkIndex = job.pending.shift() as number;
    const chunk = this.frustumCuller.chunks[chunkIndex];
    if (!chunk) return job.pending.length > 0;

    const { tileEngine, spritePack, clusters } = job;
    const cols = tileEngine.cols;
    const rows = tileEngine.rows;
    const centerX = this.centerX;
    const centerZ = this.centerZ;
    const chunkSize = this.frustumCuller.chunkSize;

    const minC = chunk.chunkX * chunkSize;
    const maxC = Math.min(cols, minC + chunkSize);
    const minR = chunk.chunkZ * chunkSize;
    const maxR = Math.min(rows, minR + chunkSize);

    // Height of the surface a neighbouring tile presents, used to decide whether
    // this tile's sides can be seen. Reads across the chunk edge on purpose, so
    // chunk seams do not sprout walls.
    const surfaceHeightAt = (r: number, c: number): number => {
      const id = tileEngine.blockAt(r, c);
      if (id === BLOCK_ID_EMPTY) return -Infinity; // map edge or hole: sides exposed
      if (isMountainBlock(id)) return Infinity; // mountain mesh skirts to the floor
      if (isFoliageBlock(id)) return FOLIAGE_GROUND_HEIGHT;
      return tileEngine.heightAt(r, c);
    };

    // Ground tiles whose four neighbours are at least as tall have completely
    // hidden sides and only need their top face: 2 triangles instead of 12.
    const flatInstances: TerrainInstanceData[] = [];
    const solidInstances: TerrainInstanceData[] = [];
    const foliage = {
      oak: [] as TreeInstanceData[],
      pine: [] as TreeInstanceData[],
      bush: [] as TreeInstanceData[],
      mushroom: [] as TreeInstanceData[],
    };

    const pushTerrainInstance = (r: number, c: number, height: number, spriteIndex: number) => {
      const instance: TerrainInstanceData = {
        x: c - centerX,
        y: height / 2 - 0.5,
        z: r - centerZ,
        height,
        spriteIndex,
      };

      const exposed =
        surfaceHeightAt(r - 1, c) < height - 1e-4 ||
        surfaceHeightAt(r + 1, c) < height - 1e-4 ||
        surfaceHeightAt(r, c - 1) < height - 1e-4 ||
        surfaceHeightAt(r, c + 1) < height - 1e-4;

      if (exposed) solidInstances.push(instance);
      else flatInstances.push(instance);
    };

    for (let r = minR; r < maxR; r++) {
      for (let c = minC; c < maxC; c++) {
        const idx = r * cols + c;
        const blockId = tileEngine.blockTypeIds[idx];
        if (blockId === BLOCK_ID_EMPTY) continue;

        if (isFoliageBlock(blockId)) {
          pushTerrainInstance(r, c, FOLIAGE_GROUND_HEIGHT, tileEngine.spriteIndices[idx]);

          const seedVal = r * 31 + c * 17;
          const pseudoRng = Math.abs(Math.sin(seedVal));
          const scaleVar = 0.85 + (pseudoRng % 0.3);
          const instance: TreeInstanceData = {
            x: c - centerX,
            y: -0.45,
            z: r - centerZ,
            rotY: pseudoRng * Math.PI * 2,
            scaleX: scaleVar,
            scaleY: blockId === BLOCK_ID_TREE_PINE ? scaleVar * 1.15 : scaleVar,
            scaleZ: scaleVar,
          };

          if (blockId === BLOCK_ID_TREE_OAK) foliage.oak.push(instance);
          else if (blockId === BLOCK_ID_TREE_PINE) foliage.pine.push(instance);
          else if (blockId === BLOCK_ID_BUSH) foliage.bush.push(instance);
          else foliage.mushroom.push(instance);
          continue;
        }

        if (isMountainBlock(blockId)) continue; // handled by the mountain mesh below

        pushTerrainInstance(r, c, tileEngine.heights[idx], tileEngine.spriteIndices[idx]);
      }
    }

    const sideMaterial = this.poolManager.getOpaqueSideMaterial();
    const topMaterial = this.poolManager.getTopAtlasMaterial(spritePack);

    const buildTerrainBatch = (
      instances: TerrainInstanceData[],
      geometry: THREE.BufferGeometry,
      materials: THREE.Material | THREE.Material[],
      name: string
    ) => {
      if (instances.length === 0) {
        geometry.dispose();
        return;
      }

      // Owned by this world, never the shared cache: attaching a per-world
      // instance attribute to a cached geometry orphans the previous
      // attribute's GPU buffer on every rebuild.
      this.ownedGeometries.push(geometry);

      const mesh = this.poolManager.createInstancedMesh(geometry, materials, instances.length);
      const spriteIndices = new Float32Array(instances.length);
      _tempQuat_1.identity();

      for (let i = 0; i < instances.length; i++) {
        const instance = instances[i];
        _tempVec3_1.set(instance.x, instance.y, instance.z);
        _tempVec3_2.set(1, instance.height, 1);
        _tempMat4_1.compose(_tempVec3_1, _tempQuat_1, _tempVec3_2);
        mesh.setMatrixAt(i, _tempMat4_1);
        spriteIndices[i] = instance.spriteIndex;
      }

      geometry.setAttribute(
        'instanceSpriteIndex',
        new THREE.InstancedBufferAttribute(spriteIndices, 1).setUsage(THREE.StaticDrawUsage)
      );
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      // Bounds must span the instances, not just the unit geometry.
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.name = name;
      chunk.group.add(mesh);
    };

    buildTerrainBatch(
      flatInstances,
      this.poolManager.createTerrainTopQuadGeometry(),
      topMaterial,
      'BatchedTerrainFlat'
    );
    buildTerrainBatch(
      solidInstances,
      this.poolManager.createTerrainBoxGeometry(),
      [sideMaterial, topMaterial],
      'BatchedTerrainSolid'
    );

    const buildFoliage = (type: 'oak' | 'pine' | 'bush' | 'mushroom', instances: TreeInstanceData[]) => {
      if (instances.length === 0) return;

      const model = this.poolManager.getTreeModel(type, spritePack);
      const mesh = this.poolManager.createInstancedMesh(model.geometry, model.materials, instances.length);
      mesh.castShadow = true;
      mesh.receiveShadow = false;

      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        _tempVec3_1.set(inst.x, inst.y, inst.z);
        _tempEuler_1.set(0, inst.rotY, 0);
        _tempVec3_2.set(inst.scaleX, inst.scaleY, inst.scaleZ);
        _tempQuat_1.setFromEuler(_tempEuler_1);
        _tempMat4_1.compose(_tempVec3_1, _tempQuat_1, _tempVec3_2);
        mesh.setMatrixAt(i, _tempMat4_1);
      }

      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      chunk.group.add(mesh);
    };

    buildFoliage('oak', foliage.oak);
    buildFoliage('pine', foliage.pine);
    buildFoliage('bush', foliage.bush);
    buildFoliage('mushroom', foliage.mushroom);

    const mountainMesh = buildMountainMeshForRegion(
      tileEngine,
      clusters,
      spritePack,
      minR,
      maxR,
      minC,
      maxC
    );
    if (mountainMesh) {
      this.ownedGeometries.push(mountainMesh.geometry);
      this.ownedMaterials.push(mountainMesh.material as THREE.Material);
      chunk.group.add(mountainMesh);
    }

    if (job.pending.length === 0) {
      // The sun's shadow atlas is static; refresh it once the world is complete.
      this.dirLight.shadow.needsUpdate = true;
    }

    return job.pending.length > 0;
  }

  /**
   * Build pending chunks until the time budget runs out. Always completes at
   * least one chunk, so progress cannot stall regardless of budget.
   */
  private drainBuildQueue(budgetMs: number): void {
    if (!this.buildJob || this.buildJob.pending.length === 0) return;

    const deadline = performance.now() + budgetMs;
    do {
      if (!this.buildNextChunk()) return;
    } while (performance.now() < deadline);
  }

  /** True while a world build is still streaming chunks in. */
  public get isBuilding(): boolean {
    return this.buildJob !== null && this.buildJob.pending.length > 0;
  }

  /**
   * Rebuild the whole scene as InstancedMesh batches, for a world of any size.
   */
  public buildWorld(
    tileEngine: TileDataEngine,
    spritePack: SpritePackType,
    theme: ColorTheme
  ): void {
    // Geometry created for the previous world. Shared cache resources are not
    // in here and must not be disposed.
    this.buildJob = null;
    for (let i = 0; i < this.ownedGeometries.length; i++) {
      this.ownedGeometries[i].dispose();
    }
    this.ownedGeometries.length = 0;
    for (let i = 0; i < this.ownedMaterials.length; i++) {
      this.ownedMaterials[i].dispose();
    }
    this.ownedMaterials.length = 0;

    if (this.adventurerMaterial) {
      this.adventurerMaterial.dispose();
      this.adventurerMaterial = null;
    }

    // Clear previous world meshes safely and dispose of GPU InstancedMesh buffers
    while (this.worldGroup.children.length > 0) {
      const child = this.worldGroup.children.pop();
      if (child) {
        child.traverse((obj) => {
          if (obj instanceof THREE.InstancedMesh) {
            obj.dispose();
          } else if (obj instanceof THREE.Mesh) {
            if (obj.geometry && child.name === 'UnifiedMountainMeshGroup') {
              obj.geometry.dispose();
            }
            if (obj.material && child.name === 'UnifiedMountainMeshGroup') {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
              } else {
                obj.material.dispose();
              }
            }
          }
        });
        child.clear();
      }
    }

    if (this.floorMesh) {
      this.scene.remove(this.floorMesh);
      this.floorMesh.geometry.dispose();
      // Do not dispose floorMesh.material as it is shared from TilePoolManager
      this.floorMesh = null;
    }

    const rows = tileEngine.rows;
    const cols = tileEngine.cols;
    const centerX = cols / 2 - 0.5;
    const centerZ = rows / 2 - 0.5;

    this.rows = rows;
    this.cols = cols;
    this.centerX = centerX;
    this.centerZ = centerZ;

    // 1. Base Ground Plane
    const floorGeo = new THREE.PlaneGeometry(cols + 10, rows + 10);
    const floorMat = this.poolManager.getOpaqueSideMaterial();
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.frustumCulled = false;
    this.floorMesh.receiveShadow = true;
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.set(0, -0.5, 0);
    this.scene.add(this.floorMesh);

    // 2. Spatial chunks. Terrain, foliage and mountains are all built per chunk,
    // so a chunk is the unit of frustum culling, of incremental building, and of
    // any future streaming.
    const chunks = this.frustumCuller.createChunks(cols, rows, centerX, centerZ, 6);
    chunks.forEach((chunk) => {
      this.worldGroup.add(chunk.group);
    });

    // Clusters are global: skirt generation has to know whether a neighbouring
    // mountain tile belongs to the same cluster even across a chunk boundary.
    this.buildJob = {
      tileEngine,
      spritePack,
      clusters: findMountainClusters(tileEngine),
      pending: [],
    };

    // Nearest chunks first, so what the player is looking at appears first.
    const fx = this.controls.target.x;
    const fz = this.controls.target.z;
    const order = chunks.map((chunk, index) => {
      const cx = (chunk.minX + chunk.maxX) * 0.5 - fx;
      const cz = (chunk.minZ + chunk.maxZ) * 0.5 - fz;
      return { index, distSq: cx * cx + cz * cz };
    });
    order.sort((a, b) => a.distSq - b.distSq);
    for (let i = 0; i < order.length; i++) this.buildJob.pending.push(order[i].index);

    // Build within a time budget, then let updateFrame finish the rest. Small
    // worlds complete in one go; large ones stream in instead of freezing.
    this.drainBuildQueue(INITIAL_BUILD_BUDGET_MS);

    // Place the adventurer at the dungeon centre. If the exact centre is
    // occupied by terrain, walk outward to the nearest walkable cell so the
    // billboard remains visible and grounded on the dungeon floor.
    let playerX = 0;
    let playerZ = 0;
    let playerHeight = 0;
    const centreRow = Math.floor(rows / 2);
    const centreCol = Math.floor(cols / 2);
    for (let radius = 0; radius < Math.max(rows, cols); radius++) {
      let found = false;
      for (let dr = -radius; dr <= radius && !found; dr++) {
        for (let dc = -radius; dc <= radius && !found; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          const row = centreRow + dr;
          const col = centreCol + dc;
          const blockId = tileEngine.blockAt(row, col);
          if (blockId === BLOCK_ID_EMPTY || isMountainBlock(blockId) || isFoliageBlock(blockId)) continue;
          playerX = col - centerX;
          playerZ = row - centerZ;
          playerHeight = tileEngine.heightAt(row, col);
          found = true;
        }
      }
      if (found) break;
    }

    // The adventurer is an entity like anything else, drawn by the instanced
    // billboard renderer rather than as a one-off Sprite object.
    this.entities.clear();
    this.entities.spawn(EntityType.Adventurer, playerX, playerHeight + 0.68, playerZ, 0, 1);

    if (!this.entityRenderer) {
      this.entityRenderer = new EntityRenderer(this.adventurerTexture, EntityType.Adventurer, 1024);
      this.scene.add(this.entityRenderer.mesh);
    }
    this.entityRenderer.sync(this.entities);

    this.lightEmitters = tileEngine.emitters;
    this.lastTargetX = NaN;
    this.lastTargetZ = NaN;
    this.dirLight.shadow.needsUpdate = true;

    // The tint layer is only visible in fake-lighting mode, and baking it costs
    // ~22 ms at 256x256. Defer it until something actually needs it.
    this.buildTileEngine = tileEngine;
    this.tintDirty = true;

    this.centerLight.position.set(0, 20, 0);
    this.applyTheme(theme);
  }

  /**
   * Recolour the scene lights. Themes only affect light colours, so switching
   * one must never rebuild the world.
   */
  public applyTheme(theme: ColorTheme): void {
    this.centerLight.color.set(theme.light);
    this.ambientLight.color.set(theme.ambient);
    this.fillLight.color.set(theme.light);
  }

  /**
   * Rebuild the fake-lighting tint layer for the current world.
   *
   * Both the per-tile transform and the per-tile colour are computed here, once
   * per world, because both depend only on static data: tile height and emitter
   * positions. This used to re-run the whole rows x cols x emitters loop every
   * third frame and produce exactly the same numbers each time.
   */
  private rebuildFakeLightTint(tileEngine: TileDataEngine): void {
    const rows = this.rows;
    const cols = this.cols;
    const totalCells = rows * cols;

    if (this.tileHeights.length < totalCells) {
      this.tileHeights = new Float32Array(totalCells);
    }
    this.tileHeights.fill(0);

    // The instanced draw reads one matrix per instance, so capacity has to cover
    // the world. Growing it means a new mesh; the geometry and material are
    // shared with the old one and stay alive.
    if (this.lightTintMesh.instanceMatrix.count < totalCells) {
      this.fakeLightGroup.remove(this.lightTintMesh);
      this.entityRenderer?.dispose();
    this.entityRenderer = null;
    this.entities.clear();

    this.lightTintMesh.dispose();
      this.lightTintMesh = new THREE.InstancedMesh(this.tintGeometry, this.tintMaterial, totalCells);
      this.lightTintMesh.frustumCulled = false;
      this.fakeLightGroup.add(this.lightTintMesh);
    }

    // Scatter each emitter over the tiles inside its radius, rather than having
    // every tile test every emitter. That is O(emitters x radius^2) instead of
    // O(tiles x emitters), so it can use ALL emitters instead of an arbitrary
    // subset, and it stays fast on large worlds.
    if (this.tintAttenuation.length < totalCells) {
      this.tintAttenuation = new Float32Array(totalCells);
    }
    const attenuation = this.tintAttenuation;
    attenuation.fill(0, 0, totalCells);

    for (let i = 0; i < this.lightEmitters.length; i++) {
      const e = this.lightEmitters[i];
      const maxDist = e.distance || 16.0;
      const invMaxDist = 1 / maxDist;

      // Emitter position back to grid coordinates
      const gridC = e.x + this.centerX;
      const gridR = e.z + this.centerZ;
      const minC = Math.max(0, Math.ceil(gridC - maxDist));
      const maxC = Math.min(cols - 1, Math.floor(gridC + maxDist));
      const minR = Math.max(0, Math.ceil(gridR - maxDist));
      const maxR = Math.min(rows - 1, Math.floor(gridR + maxDist));

      for (let r = minR; r <= maxR; r++) {
        const dz = r - gridR;
        const dzSq = dz * dz;
        const rowBase = r * cols;
        for (let c = minC; c <= maxC; c++) {
          const dx = c - gridC;
          const dSq = dx * dx + dzSq;
          if (dSq >= maxDist * maxDist) continue;
          const att = 1.0 - Math.sqrt(dSq) * invMaxDist;
          const idx = rowBase + c;
          if (att > attenuation[idx]) attenuation[idx] = att;
        }
      }
    }

    let tintIdx = 0;
    _tempQuat_1.identity();
    _tempVec3_2.set(1.001, 1.0, 1.001);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const tileH = tileEngine.heights[idx];
        this.tileHeights[idx] = tileH;

        const worldX = c - this.centerX;
        const worldZ = r - this.centerZ;
        _tempVec3_1.set(worldX, tileH + 0.02, worldZ);
        _tempMat4_1.compose(_tempVec3_1, _tempQuat_1, _tempVec3_2);
        this.lightTintMesh.setMatrixAt(tintIdx, _tempMat4_1);

        const totalIntensity = Math.min(1.0, 0.3 + attenuation[idx] * 0.6);

        if (totalIntensity > 0.82) {
          _tempColor_1.setRGB(1.0, 0.98, 0.85);
        } else if (totalIntensity > 0.6) {
          _tempColor_1.setRGB(1.0, 0.82, 0.45);
        } else if (totalIntensity > 0.42) {
          _tempColor_1.setRGB(0.9, 0.65, 0.35);
        } else {
          _tempColor_1.setRGB(0.4, 0.48, 0.62);
        }

        const brightness = totalIntensity * 1.1;
        _tempColor_1.r *= brightness;
        _tempColor_1.g *= brightness;
        _tempColor_1.b *= brightness;
        this.lightTintMesh.setColorAt(tintIdx, _tempColor_1);

        tintIdx++;
      }
    }

    this.lightTintMesh.count = tintIdx;
    this.lightTintMesh.instanceMatrix.needsUpdate = true;
    if (this.lightTintMesh.instanceColor) {
      this.lightTintMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Per-frame fake-light work: animate the glowing orbs that mark each emitter.
   * The tile tint underneath them is static and is built in rebuildFakeLightTint.
   */
  private computeFakeLighting(): void {
    // 1. Render Visual Fake Light Source Meshes
    let sourceIdx = 0;

    // Emitters (Torches, Campfires, Chests, Portals)
    const numEmitters = Math.min(MAX_FAKE_LIGHT_EMITTERS, this.lightEmitters.length);
    for (let i = 0; i < numEmitters; i++) {
      const e = this.lightEmitters[i];
      _tempVec3_1.set(e.x, e.y + 0.5, e.z);
      const ePulse = 0.5 + Math.sin(this.time * 4.0 + i) * 0.1;
      _tempVec3_2.set(ePulse, ePulse, ePulse);
      _tempQuat_1.setFromAxisAngle(_upVec, this.time * 1.5 + i);
      _tempMat4_1.compose(_tempVec3_1, _tempQuat_1, _tempVec3_2);

      this.fakeLightSourcesMesh.setMatrixAt(sourceIdx, _tempMat4_1);
      _tempColor_1.setStyle(e.color || '#ff9900');
      this.fakeLightSourcesMesh.setColorAt(sourceIdx, _tempColor_1);
      sourceIdx++;
    }

    this.fakeLightSourcesMesh.count = sourceIdx;
    this.fakeLightSourcesMesh.instanceMatrix.needsUpdate = true;
    if (this.fakeLightSourcesMesh.instanceColor) {
      this.fakeLightSourcesMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * ZERO-ALLOCATION FRAME ANIMATION UPDATE
   */
  public updateFrame(
    delta: number,
    isPaused: boolean,
    autoRotate: boolean,
    dayNightState: DayNightState,
    pressedKeys: Set<string>
  ): void {
    if (!isPaused) {
      this.time += delta;
    }

    this.poolManager.updateWaterAnimation(this.time);

    // 1. WASD / Arrow Key Camera Movement with ZERO allocations
    if (!isPaused && pressedKeys.size > 0 && this.activeCamera && this.controls) {
      const cam = this.activeCamera;
      const controls = this.controls;

      cam.updateMatrixWorld();
      cam.matrixWorld.extractBasis(_rightVec, _upVec, _forwardVec);

      let speed = 0.6;
      if (cam instanceof THREE.OrthographicCamera) {
        const frustumHeight = (cam.top - cam.bottom) / (cam.zoom || 1);
        speed = frustumHeight * 0.012;
      } else if (cam instanceof THREE.PerspectiveCamera) {
        const dist = cam.position.distanceTo(controls.target);
        speed = dist * 0.012;
      }

      _panDeltaVec.set(0, 0, 0);

      if (pressedKeys.has('arrowleft') || pressedKeys.has('a')) {
        _panDeltaVec.addScaledVector(_rightVec, -speed);
      }
      if (pressedKeys.has('arrowright') || pressedKeys.has('d')) {
        _panDeltaVec.addScaledVector(_rightVec, speed);
      }
      if (pressedKeys.has('arrowup') || pressedKeys.has('w')) {
        _panDeltaVec.addScaledVector(_upVec, speed);
      }
      if (pressedKeys.has('arrowdown') || pressedKeys.has('s')) {
        _panDeltaVec.addScaledVector(_upVec, -speed);
      }

      if (_panDeltaVec.lengthSq() > 0) {
        cam.position.add(_panDeltaVec);
        controls.target.add(_panDeltaVec);
      }

      // Q / E zoom: dolly toward/away from the orbit target (perspective)
      // or adjust zoom factor (orthographic).
      if (pressedKeys.has('q') || pressedKeys.has('e')) {
        if (cam instanceof THREE.OrthographicCamera) {
          const zoomFactor = 1.04;
          if (pressedKeys.has('q')) {
            cam.zoom = Math.min(controls.maxZoom, cam.zoom * zoomFactor);
          }
          if (pressedKeys.has('e')) {
            cam.zoom = Math.max(controls.minZoom, cam.zoom / zoomFactor);
          }
          cam.updateProjectionMatrix();
        } else if (cam instanceof THREE.PerspectiveCamera) {
          const dist = cam.position.distanceTo(controls.target);
          const dollySpeed = Math.max(0.4, dist * 0.03);
          _tempVec3_1.copy(cam.position).sub(controls.target).normalize();
          if (pressedKeys.has('q')) {
            const newDist = Math.max(controls.minDistance, dist - dollySpeed);
            cam.position.copy(controls.target).addScaledVector(_tempVec3_1, newDist);
          }
          if (pressedKeys.has('e')) {
            const newDist = Math.min(controls.maxDistance, dist + dollySpeed);
            cam.position.copy(controls.target).addScaledVector(_tempVec3_1, newDist);
          }
        }
      }
    }

    // 2. Camera Auto-Rotation via OrbitControls
    if (this.controls) {
      this.controls.autoRotate = autoRotate && !isPaused;
      this.controls.autoRotateSpeed = 0.8;
    }
    if (this.worldGroup) {
      this.worldGroup.rotation.y = 0;
    }

    // OrbitControls can move/rotate the camera independently of its target. Update
    // its transform before choosing pooled lights so culling uses this frame's view.
    this.controls.update();
    this.activeCamera.updateMatrixWorld();
    _lightProjScreenMatrix.multiplyMatrices(
      this.activeCamera.projectionMatrix,
      this.activeCamera.matrixWorldInverse
    );
    _lightFrustum.setFromProjectionMatrix(_lightProjScreenMatrix);

    // 3. Lighting Pipeline Update (Real-Time vs Fake Light)
    if (this.lightType === 'fake') {
      this.fakeLightGroup.visible = true;

      // Remove lights from the render list entirely. Intensity zero still leaves
      // them in Three.js' forward-light shader permutation.
      this.dirLight.visible = false;
      this.fillLight.visible = false;
      this.centerLight.visible = false;
      this.mouseLight.visible = false;
      this.ambientLight.visible = false;

      for (let i = 0; i < this.lightPool.length; i++) {
        this.lightPool[i].visible = false;
      }

      if (this.tintDirty && this.buildTileEngine && !this.isBuilding) {
        this.rebuildFakeLightTint(this.buildTileEngine);
        this.tintDirty = false;
      }

      this.computeFakeLighting();
      this.lastLightType = 'fake';

    } else {
      // REAL-TIME LIGHTING MODE
      this.fakeLightGroup.visible = false;
      const enteringRealtime = this.lastLightType !== 'realtime';
      this.dirLight.visible = true;
      this.fillLight.visible = true;
      this.centerLight.visible = true;
      this.mouseLight.visible = this.mouseLightActive;
      this.ambientLight.visible = true;

      // Smooth Day/Night Celestial Sun Position
      const targetMins = dayNightState.isTimeLocked
        ? dayNightState.manualTimeMinutes
        : dayNightState.timeOfDayMinutes;

      let diff = targetMins - this.currentVisualMinutes;
      if (diff > 720) diff -= 1440;
      if (diff < -720) diff += 1440;

      // Frame-rate independent approach. A fixed per-frame fraction made the sun
      // move twice as fast at 120 FPS as at 60, so the simulation ran at a
      // different speed on every machine. The rate constant is chosen to match
      // the previous feel at 60 FPS (1 - 0.08 per 1/60 s).
      this.currentVisualMinutes += diff * (1 - Math.exp(-DAY_NIGHT_LERP_RATE * delta));
      if (this.currentVisualMinutes < 0) this.currentVisualMinutes += 1440;
      if (this.currentVisualMinutes >= 1440) this.currentVisualMinutes -= 1440;

      const sunAngle = ((this.currentVisualMinutes / 1440) * Math.PI * 2) - Math.PI / 2;
      const sunY = Math.sin(sunAngle);
      const sunX = Math.cos(sunAngle) * 110;
      const sunZ = Math.cos(sunAngle * 0.5) * 40;
      const isDaylight = sunY > 0;

      if (this.dirLight) {
        if (isDaylight) {
          this.dirLight.visible = true;
          this.dirLight.position.set(sunX, Math.max(8, sunY * 110), sunZ);
          const dayProgress = Math.max(0, sunY);
          if (dayProgress < 0.25) {
            this.dirLight.color.set('#ff8a36');
            this.dirLight.intensity = dayProgress * 4.0;
          } else {
            this.dirLight.color.set('#fff8e7');
            this.dirLight.intensity = 1.0 + dayProgress * 1.4;
          }
        } else {
          // Full night is unlit except for actual point-light emitters.
          this.dirLight.visible = false;
          this.dirLight.intensity = 0;
        }

        const shadowDx = this.dirLight.position.x - this.lastShadowSunX;
        const shadowDy = this.dirLight.position.y - this.lastShadowSunY;
        const shadowDz = this.dirLight.position.z - this.lastShadowSunZ;
        if (
          enteringRealtime ||
          !Number.isFinite(this.lastShadowSunX) ||
          shadowDx * shadowDx + shadowDy * shadowDy + shadowDz * shadowDz > 4
        ) {
          this.lastShadowSunX = this.dirLight.position.x;
          this.lastShadowSunY = this.dirLight.position.y;
          this.lastShadowSunZ = this.dirLight.position.z;
          this.dirLight.shadow.needsUpdate = true;
        }
      }

      if (this.fillLight) {
        this.fillLight.visible = isDaylight;
        this.fillLight.intensity = isDaylight ? sunY * 0.8 : 0;
      }

      if (this.ambientLight) {
        if (isDaylight) {
          this.ambientLight.visible = true;
          this.ambientLight.color.set('#3b4252');
          this.ambientLight.intensity = sunY * 1.8;
        } else {
          this.ambientLight.intensity = 0;
        }
      }

      // Point Light Pooling: assignments are sticky while any part of their
      // illumination radius remains on screen. Culling only the emitter position
      // switches a light off while it can still illuminate visible geometry.
      if (this.controls && this.lightEmitters.length > 0) {
        const fx = this.controls.target.x;
        const fz = this.controls.target.z;
        const targetDx = fx - this.lastTargetX;
        const targetDz = fz - this.lastTargetZ;
        const lightSelectionDirty =
          enteringRealtime ||
          !Number.isFinite(this.lastTargetX) ||
          targetDx * targetDx + targetDz * targetDz > 0.25;

        if (lightSelectionDirty) {
          this.lastTargetX = fx;
          this.lastTargetZ = fz;

          for (let i = 0; i < this.lightEmitters.length; i++) {
            const e = this.lightEmitters[i];
            const dx = e.x - fx;
            const dz = e.z - fz;
            e.distSq = dx * dx + dz * dz;
          }

          this.lightEmitters.sort(byDistanceSq);
        }

        const nightFactor = sunY < 0 ? 2.2 : 1.0;

        // First retain existing assignments that are still visibly on screen.
        for (let i = 0; i < this.lightPool.length; i++) {
          const e = this.pooledEmitters[i];
          const pl = this.lightPool[i];
          if (e) {
            _lightInfluenceSphere.center.set(e.x, e.y, e.z);
            _lightInfluenceSphere.radius = e.distance * (sunY < 0 ? 1.2 : 1.0);
          }

          if (e && _lightFrustum.intersectsSphere(_lightInfluenceSphere)) {
            pl.position.set(e.x, e.y, e.z);
            pl.color.set(e.color);
            pl.intensity = e.intensity * nightFactor;
            pl.distance = _lightInfluenceSphere.radius;
            pl.visible = true;
          } else {
            this.pooledEmitters[i] = null;
            pl.visible = false;
          }
        }

        // Fill newly available slots with the nearest currently visible emitters.
        for (let emitterIndex = 0; emitterIndex < this.lightEmitters.length; emitterIndex++) {
          const e = this.lightEmitters[emitterIndex];
          const effectiveDistance = e.distance * (sunY < 0 ? 1.2 : 1.0);
          _lightInfluenceSphere.center.set(e.x, e.y, e.z);
          _lightInfluenceSphere.radius = effectiveDistance;
          if (!_lightFrustum.intersectsSphere(_lightInfluenceSphere)) continue;

          let alreadyAssigned = false;
          let freePoolIndex = -1;
          for (let poolIndex = 0; poolIndex < this.lightPool.length; poolIndex++) {
            if (this.pooledEmitters[poolIndex] === e) {
              alreadyAssigned = true;
              break;
            }
            if (freePoolIndex < 0 && this.pooledEmitters[poolIndex] === null) {
              freePoolIndex = poolIndex;
            }
          }

          if (alreadyAssigned) continue;
          if (freePoolIndex < 0) break;

          const pl = this.lightPool[freePoolIndex];
          this.pooledEmitters[freePoolIndex] = e;
          pl.position.set(e.x, e.y, e.z);
          pl.color.set(e.color);
          pl.intensity = e.intensity * nightFactor;
          pl.distance = effectiveDistance;
          pl.visible = true;
        }
      } else {
        for (let i = 0; i < this.lightPool.length; i++) {
          this.pooledEmitters[i] = null;
          this.lightPool[i].visible = false;
        }
      }


      if (this.centerLight) {
        this.centerLight.intensity = sunY >= 0 ? 0.2 * sunY : 0;
      }

      this.lastSunY = sunY;
      this.lastLightType = 'realtime';
    }

    // 5a. Entity simulation, then push transforms into the instanced billboards.
    if (!isPaused && this.entities.count > 0) {
      this.entityScheduler.tick(
        this.entities,
        delta,
        this.controls.target.x,
        this.controls.target.z,
        NOOP_ENTITY_UPDATE
      );
    }
    this.entityRenderer?.sync(this.entities);

    // 5b. Continue any in-flight world build within this frame's budget.
    this.drainBuildQueue(PER_FRAME_BUILD_BUDGET_MS);

    // 6. Force current frame matrices update for camera and world
    if (this.activeCamera) this.activeCamera.updateMatrixWorld();
    this.worldGroup.updateMatrixWorld(true);

    // 7. Resolve the pointer pick once per frame, against this frame's matrices
    this.resolvePointerLight();

    // 8. Frustum Culling using FRESH current-frame matrices
    this.frustumCuller.updateVisibility(this.activeCamera);

    // 9. Render Scene
    this.renderer.render(this.scene, this.activeCamera);
  }

  public updateAdaptivePixelRatio(width: number, height: number): void {
    const area = width * height;
    // Cap pixel ratio adaptively so total fragments rendered per frame remains optimal for 60 FPS
    const maxDpr = area > 1800000 ? 1.0 : area > 1000000 ? 1.25 : 1.5;
    const targetDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.renderer.setPixelRatio(targetDpr);
  }

  public resize(width: number, height: number, rows: number, cols: number): void {
    const aspect = height > 0 ? width / height : 1;

    this.perspCamera.aspect = aspect;

    // Adjust perspective FOV adaptively on narrow/portrait screens to keep full world width in frame
    if (aspect < 1.0) {
      const vFOV = 2 * Math.atan(Math.tan((45 * Math.PI / 180) / 2) / aspect) * (180 / Math.PI);
      this.perspCamera.fov = Math.min(85, vFOV);
    } else {
      this.perspCamera.fov = 45;
    }
    this.perspCamera.updateProjectionMatrix();

    const mapDiagonal = Math.hypot(cols || 64, rows || 64);
    const baseFrustumSize = Math.max(68, mapDiagonal * 0.78);
    let orthoWidth = baseFrustumSize;
    let orthoHeight = baseFrustumSize;

    if (aspect >= 1.0) {
      orthoWidth = baseFrustumSize * aspect;
      orthoHeight = baseFrustumSize;
    } else {
      orthoWidth = baseFrustumSize;
      orthoHeight = baseFrustumSize / aspect;
    }

    this.orthoCamera.left = -orthoWidth / 2;
    this.orthoCamera.right = orthoWidth / 2;
    this.orthoCamera.top = orthoHeight / 2;
    this.orthoCamera.bottom = -orthoHeight / 2;
    this.orthoCamera.updateProjectionMatrix();

    this.updateAdaptivePixelRatio(width, height);
    this.renderer.setSize(width, height);

    if (this.controls) {
      this.controls.update();
    }

    if (this.activeCamera) {
      this.activeCamera.updateMatrixWorld(true);
    }
    if (this.worldGroup) {
      this.worldGroup.updateMatrixWorld(true);
    }
    this.frustumCuller.updateVisibility(this.activeCamera);
  }

  public dispose(): void {
    this.controls.dispose();

    // Everything this renderer allocated itself. Resources handed out by the
    // shared cache are released separately, and only once the last renderer
    // using them is gone.
    for (let i = 0; i < this.ownedGeometries.length; i++) {
      this.ownedGeometries[i].dispose();
    }
    this.ownedGeometries.length = 0;
    for (let i = 0; i < this.ownedMaterials.length; i++) {
      this.ownedMaterials[i].dispose();
    }
    this.ownedMaterials.length = 0;

    this.adventurerMaterial?.dispose();
    this.adventurerMaterial = null;
    this.adventurerTexture.dispose();

    this.worldGroup.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        obj.dispose();
      }
      if (obj instanceof THREE.Mesh && obj.parent?.name === 'UnifiedMountainMeshGroup') {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    this.worldGroup.clear();

    if (this.floorMesh) {
      this.scene.remove(this.floorMesh);
      this.floorMesh.geometry.dispose();
      this.floorMesh = null;
    }

    this.entityRenderer?.dispose();
    this.entityRenderer = null;
    this.entities.clear();

    this.lightTintMesh.dispose();
    this.fakeLightSourcesMesh.dispose();
    this.fakeLightSourcesMesh.geometry.dispose();
    (this.fakeLightSourcesMesh.material as THREE.Material).dispose();
    this.tintGeometry.dispose();
    this.tintMaterial.dispose();

    this.scene.clear();

    this.poolManager.release();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
