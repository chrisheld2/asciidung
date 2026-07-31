import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ColorTheme, CameraPreset, SpritePackType, RenderMetrics, DayNightState, LightEmitter, LightType } from '../types';
import { TileDataEngine } from './TileData';
import { TilePoolManager } from './TilePoolManager';
import { FrustumCuller } from './FrustumCuller';
import { buildUnifiedMountainMeshGroup } from '../utils/mountainMesh';
import { SPRITE_DEFS } from '../utils/sprites';

// MODULE-SCOPED SCRATCHPAD OBJECTS FOR ZERO-ALLOCATION RENDER LOOP
const _tempVec3_1 = new THREE.Vector3();
const _tempVec3_2 = new THREE.Vector3();
const _tempVec3_3 = new THREE.Vector3();
const _tempMat4_1 = new THREE.Matrix4();
const _tempQuat_1 = new THREE.Quaternion();
const _tempEuler_1 = new THREE.Euler();
const _tempColor_1 = new THREE.Color();
const _tempColor_2 = new THREE.Color();

const _rightVec = new THREE.Vector3();
const _upVec = new THREE.Vector3();
const _forwardVec = new THREE.Vector3();
const _panDeltaVec = new THREE.Vector3();

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

  // Lights
  public ambientLight: THREE.AmbientLight;
  public dirLight: THREE.DirectionalLight;
  public fillLight: THREE.DirectionalLight;
  public centerLight: THREE.PointLight;
  public orbLight: THREE.PointLight;
  public lightPool: THREE.PointLight[] = [];

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
  private tileHeights: Float32Array = new Float32Array(4096);
  private lastLightType: LightType = 'realtime';
  private fakeLightFrameCount = 0;

  // Light update dirty checking
  private lastTargetX = NaN;
  private lastTargetZ = NaN;
  private lastSunY = NaN;
  private lastShadowSunX = NaN;
  private lastShadowSunY = NaN;
  private lastShadowSunZ = NaN;

  constructor(container: HTMLDivElement, isOrthographic = true, theme: ColorTheme) {
    this.poolManager = TilePoolManager.getInstance();
    this.frustumCuller = new FrustumCuller(16);

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0e14');
    this.scene.fog = new THREE.FogExp2('#0b0e14', 0.0015);

    // 2. Cameras
    const aspect = container.clientWidth / container.clientHeight || 1;

    this.perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 3000);

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

    this.orbLight = new THREE.PointLight(0x38bdf8, 2.0, 40);
    this.scene.add(this.orbLight);

    // Forward rendering pays the point-light cost in every lit fragment. A strict
    // nearest-six budget is a predictable console/desktop-quality performance tier.
    const MAX_POOLED_LIGHTS = 6;
    for (let i = 0; i < MAX_POOLED_LIGHTS; i++) {
      const pl = new THREE.PointLight(0xffaa44, 0, 16);
      pl.castShadow = false;
      pl.visible = false;
      this.scene.add(pl);
      this.lightPool.push(pl);
    }

    // 6. World Root Container
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    // 7. Fake Light Mode Visual Objects (Glowing Light Sources & Distance Light Tint)
    const sourceGeo = new THREE.OctahedronGeometry(0.35, 1);
    const sourceMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
    });
    this.fakeLightSourcesMesh = new THREE.InstancedMesh(sourceGeo, sourceMat, 256);
    this.fakeLightSourcesMesh.frustumCulled = false;

    const tintGeo = new THREE.PlaneGeometry(1.001, 1.001);
    tintGeo.rotateX(-Math.PI / 2);
    const tintMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.lightTintMesh = new THREE.InstancedMesh(tintGeo, tintMat, 4096);
    this.lightTintMesh.frustumCulled = false;

    this.fakeLightGroup = new THREE.Group();
    this.fakeLightGroup.add(this.fakeLightSourcesMesh);
    this.fakeLightGroup.add(this.lightTintMesh);
    this.fakeLightGroup.visible = false;
    this.scene.add(this.fakeLightGroup);
  }

  /**
   * Rebuild whole 64x64 scene with InstancedMesh groups & GPU offloading
   */
  public buildWorld(
    tileEngine: TileDataEngine,
    worldGrid: any[][],
    spritePack: SpritePackType,
    theme: ColorTheme
  ): void {
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

    // 1. Base Ground Plane
    const floorGeo = new THREE.PlaneGeometry(cols + 10, rows + 10);
    const floorMat = this.poolManager.getOpaqueSideMaterial();
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.frustumCulled = false;
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.set(0, -0.5, 0);
    this.scene.add(this.floorMesh);

    // 2. Setup tree chunks and one GPU-driven terrain batch.
    // Terrain is cheap to keep resident as a single mesh; trees remain chunked so
    // their alpha-tested pixels and shadow casters can be culled aggressively.
    const chunks = this.frustumCuller.createChunks(cols, rows, centerX, centerZ, 40);
    chunks.forEach((chunk) => {
      this.worldGroup.add(chunk.group);
    });

    const terrainInstances: TerrainInstanceData[] = [];
    const treeInstancesByChunk = chunks.map(() => ({
      oak: [] as TreeInstanceData[],
      pine: [] as TreeInstanceData[],
      bush: [] as TreeInstanceData[],
      mushroom: [] as TreeInstanceData[],
    }));
    const chunksPerRow = Math.ceil(cols / this.frustumCuller.chunkSize);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = tileEngine.getIndex(r, c);
        if (tileEngine.blockTypeIds[idx] === 255) continue;

        const cell = worldGrid[r][c];
        if (!cell) continue;

        const posX = c - centerX;
        const posZ = r - centerZ;
        const isTree = cell.type === 'tree_oak' || cell.type === 'tree_pine' || cell.type === 'bush';
        const isMushroom = cell.type === 'mushroom';

        if (isTree || isMushroom) {
          terrainInstances.push({
            x: posX,
            y: 0.1 / 2 - 0.5,
            z: posZ,
            height: 0.1,
            spriteIndex: cell.spriteIndex ?? SPRITE_DEFS.grass.spriteIndex,
          });

          const chunkX = Math.floor(c / this.frustumCuller.chunkSize);
          const chunkZ = Math.floor(r / this.frustumCuller.chunkSize);
          const treeChunk = treeInstancesByChunk[chunkZ * chunksPerRow + chunkX];
          const seedVal = r * 31 + c * 17;
          const pseudoRng = Math.abs(Math.sin(seedVal));
          const rotY = pseudoRng * Math.PI * 2;
          const scaleVar = 0.85 + (pseudoRng % 0.3);
          const instance: TreeInstanceData = {
            x: posX,
            y: -0.45,
            z: posZ,
            rotY,
            scaleX: scaleVar,
            scaleY: cell.type === 'tree_pine' ? scaleVar * 1.15 : scaleVar,
            scaleZ: scaleVar,
          };

          if (cell.type === 'tree_oak') treeChunk.oak.push(instance);
          else if (cell.type === 'tree_pine') treeChunk.pine.push(instance);
          else if (cell.type === 'bush') treeChunk.bush.push(instance);
          else treeChunk.mushroom.push(instance);
          continue;
        }

        if (cell.type.startsWith('mountain') || cell.type === 'rock') {
          continue; // Handled by the unified mountain mesh.
        }

        const height = tileEngine.heights[idx];
        terrainInstances.push({
          x: posX,
          y: height / 2 - 0.5,
          z: posZ,
          height,
          spriteIndex: tileEngine.spriteIndices[idx],
        });
      }
    }

    if (terrainInstances.length > 0) {
      const terrainGeometry = this.poolManager.getBatchedBlockGeometry();
      const terrainMaterials = [
        this.poolManager.getOpaqueSideMaterial(),
        this.poolManager.getTopAtlasMaterial(spritePack),
      ];
      const terrainMesh = this.poolManager.acquireInstancedMesh(
        terrainGeometry,
        terrainMaterials,
        terrainInstances.length
      );
      const spriteIndices = new Float32Array(terrainInstances.length);
      _tempQuat_1.identity();

      for (let i = 0; i < terrainInstances.length; i++) {
        const instance = terrainInstances[i];
        _tempVec3_1.set(instance.x, instance.y, instance.z);
        _tempVec3_2.set(1, instance.height, 1);
        _tempMat4_1.compose(_tempVec3_1, _tempQuat_1, _tempVec3_2);
        terrainMesh.setMatrixAt(i, _tempMat4_1);
        spriteIndices[i] = instance.spriteIndex;
      }

      terrainGeometry.setAttribute(
        'instanceSpriteIndex',
        new THREE.InstancedBufferAttribute(spriteIndices, 1).setUsage(THREE.StaticDrawUsage)
      );
      terrainMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      terrainMesh.instanceMatrix.needsUpdate = true;
      terrainMesh.name = 'BatchedTerrain';
      this.worldGroup.add(terrainMesh);
    }

    chunks.forEach((chunk, chunkIndex) => {
      const treeInstances = treeInstancesByChunk[chunkIndex];

      // Render low-poly trees per chunk so alpha-tested geometry and shadows cull together.
      const renderChunkTrees = (type: 'oak' | 'pine' | 'bush' | 'mushroom', instances: TreeInstanceData[]) => {
        if (instances.length === 0) return;

        const model = this.poolManager.getTreeModel(type, spritePack);
        const mesh = this.poolManager.acquireInstancedMesh(model.geometry, model.materials, instances.length);
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

        mesh.instanceMatrix.needsUpdate = true;
        chunk.group.add(mesh);
      };

      renderChunkTrees('oak', treeInstances.oak);
      renderChunkTrees('pine', treeInstances.pine);
      renderChunkTrees('bush', treeInstances.bush);
      renderChunkTrees('mushroom', treeInstances.mushroom);
    });

    // 3. Render Unified Mountain Mesh Group
    const unifiedMountainGroup = buildUnifiedMountainMeshGroup(worldGrid, spritePack);
    this.worldGroup.add(unifiedMountainGroup);

    this.lightEmitters = tileEngine.emitters;
    this.lastTargetX = NaN;
    this.lastTargetZ = NaN;
    this.dirLight.shadow.needsUpdate = true;

    // Populate tileHeights & pre-allocate lightTintMesh tile matrices
    this.tileHeights.fill(0);

    let tintIdx = 0;
    _tempQuat_1.identity();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * 64 + c;
        const cell = worldGrid[r]?.[c];
        const tileH = cell ? cell.height || 0 : 0;
        this.tileHeights[idx] = tileH;

        const worldX = c - 31.5;
        const worldZ = r - 31.5;
        _tempVec3_1.set(worldX, tileH + 0.02, worldZ);
        _tempVec3_2.set(1.001, 1.0, 1.001);
        _tempMat4_1.compose(_tempVec3_1, _tempQuat_1, _tempVec3_2);
        this.lightTintMesh.setMatrixAt(tintIdx++, _tempMat4_1);
      }
    }
    this.lightTintMesh.count = tintIdx;
    this.lightTintMesh.instanceMatrix.needsUpdate = true;

    if (this.centerLight) {
      this.centerLight.position.set(0, 20, 0);
      this.centerLight.color.set(theme.light);
    }
    if (this.ambientLight) {
      this.ambientLight.color.set(theme.ambient);
    }
  }

  /**
   * ZERO-ALLOCATION Fake Light Computation:
   * - Renders visual fake light source meshes (glowing octahedrons/orbs at emitter & sun locations)
   * - Calculates multi-tier simple color intensity gradients across all 64x64 tiles
   * - Ambient light is OFF and no black shadow boxes are used
   */
  private computeFakeLighting(orbX: number, orbY: number, orbZ: number): void {
    // 1. Render Visual Fake Light Source Meshes
    let sourceIdx = 0;

    // A) Main Orbiting Sun / Ember Orb Light Source
    _tempVec3_1.set(orbX, orbY, orbZ);
    const orbPulse = 0.8 + Math.sin(this.time * 3.0) * 0.15;
    _tempVec3_2.set(orbPulse, orbPulse, orbPulse);
    _tempQuat_1.setFromAxisAngle(_upVec, this.time * 2.0);
    _tempMat4_1.compose(_tempVec3_1, _tempQuat_1, _tempVec3_2);

    this.fakeLightSourcesMesh.setMatrixAt(sourceIdx, _tempMat4_1);
    _tempColor_1.setHex(0xffea00); // Bright golden yellow
    this.fakeLightSourcesMesh.setColorAt(sourceIdx, _tempColor_1);
    sourceIdx++;

    // B) Emitters (Torches, Campfires, Chests, Portals)
    const numEmitters = Math.min(24, this.lightEmitters.length);
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

    // 2. Tile Light Intensity & Simple Color Gradients (Rate limited to every 3 frames for 60 FPS)
    this.fakeLightFrameCount++;
    if (this.fakeLightFrameCount % 3 !== 0) {
      return;
    }

    let tintCount = 0;

    for (let r = 0; r < 64; r++) {
      for (let c = 0; c < 64; c++) {
        const worldX = c - 31.5;
        const worldZ = r - 31.5;

        // Distance from orbiting orb light
        const dxOrb = worldX - orbX;
        const dzOrb = worldZ - orbZ;
        const dOrbSq = dxOrb * dxOrb + dzOrb * dzOrb;
        const orbIntensity = dOrbSq < 1024 ? Math.max(0, 1.0 - Math.sqrt(dOrbSq) / 32.0) : 0;

        // Distance from closest light emitters
        let maxEmitterAtt = 0;

        for (let i = 0; i < numEmitters; i++) {
          const e = this.lightEmitters[i];
          const dxE = worldX - e.x;
          const dzE = worldZ - e.z;
          if (Math.abs(dxE) < 16 && Math.abs(dzE) < 16) {
            const dESq = dxE * dxE + dzE * dzE;
            const maxDist = e.distance || 16.0;
            if (dESq < maxDist * maxDist) {
              const att = Math.max(0, 1.0 - Math.sqrt(dESq) / maxDist);
              if (att > maxEmitterAtt) {
                maxEmitterAtt = att;
              }
            }
          }
        }

        // Total fake illumination score (0.0 to 1.0)
        const totalIntensity = Math.min(1.0, 0.3 + orbIntensity * 0.7 + maxEmitterAtt * 0.6);

        // Simple distinct colors at different intensity thresholds
        if (totalIntensity > 0.82) {
          _tempColor_1.setRGB(1.0, 0.98, 0.85);
        } else if (totalIntensity > 0.60) {
          _tempColor_1.setRGB(1.0, 0.82, 0.45);
        } else if (totalIntensity > 0.42) {
          _tempColor_1.setRGB(0.9, 0.65, 0.35);
        } else {
          _tempColor_1.setRGB(0.4, 0.48, 0.62);
        }

        // Brightness scaling
        _tempColor_1.r *= totalIntensity * 1.1;
        _tempColor_1.g *= totalIntensity * 1.1;
        _tempColor_1.b *= totalIntensity * 1.1;

        this.lightTintMesh.setColorAt(tintCount++, _tempColor_1);
      }
    }

    this.lightTintMesh.count = tintCount;
    if (this.lightTintMesh.instanceColor) {
      this.lightTintMesh.instanceColor.needsUpdate = true;
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
    }

    // 2. Camera Auto-Rotation via OrbitControls
    if (this.controls) {
      this.controls.autoRotate = autoRotate && !isPaused;
      this.controls.autoRotateSpeed = 0.8;
    }
    if (this.worldGroup) {
      this.worldGroup.rotation.y = 0;
    }

    // 3. Lighting Pipeline Update (Real-Time vs Fake Light)
    const orbX = Math.cos(this.time * 0.6) * 26.88;
    const orbZ = Math.sin(this.time * 0.6) * 26.88;
    const orbY = 4.0 + Math.sin(this.time * 2.0) * 1.5;

    if (this.lightType === 'fake') {
      this.fakeLightGroup.visible = true;

      // Remove lights from the render list entirely. Intensity zero still leaves
      // them in Three.js' forward-light shader permutation.
      this.dirLight.visible = false;
      this.fillLight.visible = false;
      this.orbLight.visible = false;
      this.centerLight.visible = false;
      this.ambientLight.visible = false;

      for (let i = 0; i < this.lightPool.length; i++) {
        this.lightPool[i].visible = false;
      }

      this.computeFakeLighting(orbX, orbY, orbZ);
      this.lastLightType = 'fake';

    } else {
      // REAL-TIME LIGHTING MODE
      this.fakeLightGroup.visible = false;
      const enteringRealtime = this.lastLightType !== 'realtime';
      this.dirLight.visible = true;
      this.fillLight.visible = true;
      this.orbLight.visible = true;
      this.centerLight.visible = true;
      this.ambientLight.visible = true;

      // Smooth Day/Night Celestial Sun Position
      const targetMins = dayNightState.isTimeLocked
        ? dayNightState.manualTimeMinutes
        : dayNightState.timeOfDayMinutes;

      let diff = targetMins - this.currentVisualMinutes;
      if (diff > 720) diff -= 1440;
      if (diff < -720) diff += 1440;

      this.currentVisualMinutes += diff * 0.08;
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

      // Point Light Pooling (Closest pooled lights)
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

          this.lightEmitters.sort((a, b) => (a.distSq || 0) - (b.distSq || 0));
        }

        const nightFactor = sunY < 0 ? 2.2 : 1.0;

        for (let i = 0; i < this.lightPool.length; i++) {
          const pl = this.lightPool[i];
          if (i < this.lightEmitters.length && (this.lightEmitters[i].distSq || 0) < 4000) {
            const e = this.lightEmitters[i];
            pl.position.set(e.x, e.y, e.z);
            pl.color.set(e.color);
            pl.intensity = e.intensity * nightFactor;
            pl.distance = e.distance * (sunY < 0 ? 1.2 : 1.0);
            pl.visible = true;
          } else {
            pl.visible = false;
          }
        }
      }

      if (this.orbLight) {
        this.orbLight.position.set(orbX, orbY, orbZ);
        this.orbLight.intensity = sunY < 0 ? 0.8 : 2.0;
        this.orbLight.distance = sunY < 0 ? 14 : 35;
      }

      if (this.centerLight) {
        this.centerLight.intensity = sunY >= 0 ? 0.2 * sunY : 0;
      }

      this.lastSunY = sunY;
      this.lastLightType = 'realtime';
    }

    // 6. Update Controls FIRST to update camera transform
    this.controls.update();

    // 7. Force current frame matrices update for camera and world
    if (this.activeCamera) this.activeCamera.updateMatrixWorld();

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
    this.poolManager.disposeAll();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
