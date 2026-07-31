import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ColorTheme, WorldCell, MazeStats, CameraPreset, SpritePackType, RenderMetrics, DayNightState, LightType } from '../types';
import { TileDataEngine } from '../rendering/TileData';
import { TileRenderer } from '../rendering/TileRenderer';

interface ASCIIMazeCanvasProps {
  worldGrid: WorldCell[][];
  theme: ColorTheme;
  spritePack: SpritePackType;
  translucencyRatio: number;
  autoRotate: boolean;
  cameraPreset: CameraPreset;
  isOrthographic: boolean;
  lightType: LightType;
  centerCameraTrigger?: number;
  isPaused?: boolean;
  dayNightState: DayNightState;
  onStatsChange: (stats: MazeStats) => void;
  onRenderMetricsChange?: (metrics: RenderMetrics) => void;
}

const CAMERA_STORAGE_KEY = 'spritedung_camera_position_v3';

interface SavedCameraState {
  perspPos: { x: number; y: number; z: number };
  orthoPos: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  orthoZoom: number;
  isOrthographic: boolean;
}

const isValidCameraState = (state: SavedCameraState | null): state is SavedCameraState => {
  if (!state || typeof state !== 'object') return false;
  const { target, perspPos, orthoPos, orthoZoom } = state;
  if (!target || !perspPos || !orthoPos) return false;

  const validTarget = [target.x, target.y, target.z].every((n) => typeof n === 'number' && Number.isFinite(n));
  const validPersp = [perspPos.x, perspPos.y, perspPos.z].every((n) => typeof n === 'number' && Number.isFinite(n));
  const validOrtho = [orthoPos.x, orthoPos.y, orthoPos.z].every((n) => typeof n === 'number' && Number.isFinite(n));
  const validZoom = typeof orthoZoom === 'number' && Number.isFinite(orthoZoom) && orthoZoom >= 0.2 && orthoZoom <= 12.0;

  if (!validTarget || !validPersp || !validOrtho || !validZoom) return false;

  // Target must be within reasonable world bounds so camera is never lost
  if (Math.abs(target.x) > 80 || Math.abs(target.z) > 80 || Math.abs(target.y) > 40) return false;

  const pdx = perspPos.x - target.x;
  const pdy = perspPos.y - target.y;
  const pdz = perspPos.z - target.z;
  const pDistSq = pdx * pdx + pdy * pdy + pdz * pdz;

  const odx = orthoPos.x - target.x;
  const ody = orthoPos.y - target.y;
  const odz = orthoPos.z - target.z;
  const oDistSq = odx * odx + ody * ody + odz * odz;

  if (pDistSq < 1 || pDistSq > 30000 || oDistSq < 1 || oDistSq > 30000) return false;

  return true;
};

const saveCameraStateImmediate = (tileRenderer: TileRenderer | null, isOrthographic: boolean) => {
  if (!tileRenderer || !tileRenderer.controls || !tileRenderer.perspCamera || !tileRenderer.orthoCamera) return;

  const persp = tileRenderer.perspCamera;
  const ortho = tileRenderer.orthoCamera;
  const target = tileRenderer.controls.target;

  const state: SavedCameraState = {
    perspPos: { x: persp.position.x, y: persp.position.y, z: persp.position.z },
    orthoPos: { x: ortho.position.x, y: ortho.position.y, z: ortho.position.z },
    target: { x: target.x, y: target.y, z: target.z },
    orthoZoom: ortho.zoom || 1,
    isOrthographic,
  };

  if (isValidCameraState(state)) {
    try {
      localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }
};

let saveTimer: number | null = null;
const scheduleSaveCameraState = (tileRenderer: TileRenderer | null, isOrthographic: boolean) => {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveCameraStateImmediate(tileRenderer, isOrthographic);
  }, 100);
};

const loadSavedCameraState = (): SavedCameraState | null => {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidCameraState(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return null;
};

const applyPresetPosition = (
  tileRenderer: TileRenderer,
  preset: CameraPreset,
  rows: number,
  cols: number
) => {
  if (!tileRenderer || !tileRenderer.controls) return;

  const perspCam = tileRenderer.perspCamera;
  const orthoCam = tileRenderer.orthoCamera;
  const controls = tileRenderer.controls;

  // Reset target elevated to middle of world height space
  controls.target.set(0, 1.8, 0);

  // Reset UP vectors
  perspCam.up.set(0, 1, 0);
  orthoCam.up.set(0, 1, 0);

  // Reset world group rotations / translations
  if (tileRenderer.worldGroup) {
    tileRenderer.worldGroup.rotation.set(0, 0, 0);
    tileRenderer.worldGroup.position.set(0, 0, 0);
    tileRenderer.worldGroup.scale.set(1, 1, 1);
    tileRenderer.worldGroup.updateMatrixWorld(true);
  }

  const mapMax = Math.max(cols, rows);

  if (preset === 'topdown') {
    // Position camera directly above middle of world, elevated and looking straight down
    const py = mapMax * 0.95;
    const pz = 0.0001;
    perspCam.position.set(0, py, pz);
    orthoCam.position.set(0, py, pz);
    orthoCam.zoom = 1.0;
    controls.target.set(0, 0, 0);
  } else if (preset === 'isometric') {
    const px = cols * 0.72;
    const py = rows * 0.65;
    const pz = rows * 0.72;
    perspCam.position.set(px, py, pz);
    orthoCam.position.set(px, py, pz);
    orthoCam.zoom = 1.0;
    controls.target.set(0, 1.8, 0);
  } else if (preset === 'side') {
    const pz = rows * 0.82;
    const py = 14.0;
    perspCam.position.set(0, py, pz);
    orthoCam.position.set(0, py, pz);
    orthoCam.zoom = 1.0;
    controls.target.set(0, 2.0, 0);
  } else if (preset === 'firstperson') {
    const px = -cols * 0.25;
    const pz = -rows * 0.25;
    perspCam.position.set(px, 1.8, pz);
    orthoCam.position.set(px, 1.8, pz);
    orthoCam.zoom = 1.8;
    controls.target.set(0, 1.8, 0);
  }

  orthoCam.updateProjectionMatrix();
  perspCam.updateProjectionMatrix();

  perspCam.updateMatrixWorld(true);
  orthoCam.updateMatrixWorld(true);

  controls.update();

  if (tileRenderer.frustumCuller) {
    tileRenderer.frustumCuller.updateVisibility(tileRenderer.activeCamera);
  }
};

export const ASCIIMazeCanvas: React.FC<ASCIIMazeCanvasProps> = ({
  worldGrid,
  theme,
  spritePack,
  translucencyRatio,
  autoRotate,
  cameraPreset,
  isOrthographic,
  lightType,
  centerCameraTrigger = 0,
  isPaused = false,
  dayNightState = {
    timeOfDayMinutes: 720,
    isTimeLocked: false,
    manualTimeMinutes: 720,
    turnIncrementMinutes: 30,
    turnCount: 1,
  },
  onStatsChange,
  onRenderMetricsChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererInstanceRef = useRef<TileRenderer | null>(null);
  const tileEngineRef = useRef<TileDataEngine>(new TileDataEngine(64, 64));

  const isOrthographicRef = useRef(isOrthographic);
  useEffect(() => {
    isOrthographicRef.current = isOrthographic;
  }, [isOrthographic]);

  const autoRotateRef = useRef(autoRotate);
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const dayNightStateRef = useRef(dayNightState);
  useEffect(() => {
    dayNightStateRef.current = dayNightState;
  }, [dayNightState]);

  const lightTypeRef = useRef(lightType);
  useEffect(() => {
    lightTypeRef.current = lightType;
    if (rendererInstanceRef.current) {
      rendererInstanceRef.current.lightType = lightType;
    }
  }, [lightType]);

  const onRenderMetricsChangeRef = useRef(onRenderMetricsChange);
  useEffect(() => {
    onRenderMetricsChangeRef.current = onRenderMetricsChange;
  }, [onRenderMetricsChange]);

  const hasInitializedCameraRef = useRef(false);
  const isInitialPresetRef = useRef(true);
  const prevCenterTriggerRef = useRef(centerCameraTrigger);
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // Listen for WASD / Arrow keys for panning camera along X and Y axes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (
        ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(key)
      ) {
        pressedKeysRef.current.add(key);
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
          e.preventDefault();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      pressedKeysRef.current.delete(key);
    };

    const handleBlur = () => {
      pressedKeysRef.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Mount TileRenderer
  useEffect(() => {
    if (!containerRef.current) return;

    const tileRenderer = new TileRenderer(containerRef.current, isOrthographic, theme);
    tileRenderer.lightType = lightTypeRef.current;
    rendererInstanceRef.current = tileRenderer;

    const handleControlsChange = () => {
      if (hasInitializedCameraRef.current) {
        scheduleSaveCameraState(tileRenderer, isOrthographicRef.current);
      }
    };
    tileRenderer.controls.addEventListener('change', handleControlsChange);

    const handleUnload = () => {
      saveCameraStateImmediate(tileRenderer, isOrthographicRef.current);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCameraStateImmediate(tileRenderer, isOrthographicRef.current);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth || window.innerWidth || 1;
      const height = containerRef.current.clientHeight || window.innerHeight || 1;
      tileRenderer.resize(width, height, tileEngineRef.current.rows, tileEngineRef.current.cols);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', handleResize);
    handleResize();

    // ZERO-ALLOCATION Animation Loop
    let animationFrameId: number;
    let lastFpsTime = performance.now();
    let lastFrameTime = performance.now();
    let frameCount = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const now = performance.now();
      const delta = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      // Measure FPS and WebGL metrics every 500ms for smooth UI performance
      frameCount++;
      if (now - lastFpsTime >= 500) {
        const measuredFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
        frameCount = 0;
        lastFpsTime = now;

        if (onRenderMetricsChangeRef.current && tileRenderer.renderer) {
          const info = tileRenderer.renderer.info;
          onRenderMetricsChangeRef.current({
            fps: measuredFps,
            drawCalls: info.render.calls,
            triangles: info.render.triangles,
            geometries: info.memory.geometries,
            textures: info.memory.textures,
          });
        }
      }

      tileRenderer.updateFrame(
        delta,
        isPausedRef.current,
        autoRotateRef.current,
        dayNightStateRef.current,
        pressedKeysRef.current
      );
    };

    animate();

    return () => {
      saveCameraStateImmediate(tileRenderer, isOrthographicRef.current);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationFrameId);
      tileRenderer.controls.removeEventListener('change', handleControlsChange);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      tileRenderer.dispose();
      rendererInstanceRef.current = null;
    };
  }, []);

  const prevStatsJsonRef = useRef<string>('');

  // Rebuild 64x64 World whenever worldGrid, theme, spritePack, or translucencyRatio changes
  useEffect(() => {
    const tileRenderer = rendererInstanceRef.current;
    if (!tileRenderer) return;

    const tileEngine = tileEngineRef.current;
    tileEngine.loadWorldGrid(worldGrid, translucencyRatio);

    tileRenderer.buildWorld(tileEngine, worldGrid, spritePack, theme);

    const activeCam = isOrthographic ? tileRenderer.orthoCamera : tileRenderer.perspCamera;
    tileRenderer.activeCamera = activeCam;
    tileRenderer.controls.object = activeCam;

    if (!hasInitializedCameraRef.current && tileRenderer.controls) {
      const saved = loadSavedCameraState();

      if (saved) {
        tileRenderer.perspCamera.position.set(saved.perspPos.x, saved.perspPos.y, saved.perspPos.z);
        tileRenderer.orthoCamera.position.set(saved.orthoPos.x, saved.orthoPos.y, saved.orthoPos.z);
        tileRenderer.orthoCamera.zoom = saved.orthoZoom;
        tileRenderer.orthoCamera.updateProjectionMatrix();
        tileRenderer.perspCamera.updateProjectionMatrix();

        tileRenderer.controls.target.set(saved.target.x, saved.target.y, saved.target.z);
        tileRenderer.controls.update();

        activeCam.updateMatrixWorld(true);
        if (tileRenderer.frustumCuller) {
          tileRenderer.frustumCuller.updateVisibility(activeCam);
        }
      } else {
        applyPresetPosition(tileRenderer, cameraPreset, tileEngine.rows, tileEngine.cols);
      }
      hasInitializedCameraRef.current = true;
    }

    const statsJson = JSON.stringify(tileEngine.stats);
    if (statsJson !== prevStatsJsonRef.current) {
      prevStatsJsonRef.current = statsJson;
      onStatsChange(tileEngine.stats);
    }
  }, [worldGrid, theme, spritePack, translucencyRatio]);

  // Orthographic / Perspective camera toggle
  useEffect(() => {
    const tileRenderer = rendererInstanceRef.current;
    if (!tileRenderer) return;

    const newCam = isOrthographic ? tileRenderer.orthoCamera : tileRenderer.perspCamera;
    const oldCam = tileRenderer.activeCamera;

    if (oldCam !== newCam) {
      if (oldCam && tileRenderer.controls) {
        newCam.position.copy(oldCam.position);
        newCam.quaternion.copy(oldCam.quaternion);
        newCam.up.copy(oldCam.up);
      }

      tileRenderer.activeCamera = newCam;
      tileRenderer.controls.object = newCam;
      tileRenderer.controls.update();

      newCam.updateProjectionMatrix();
      newCam.updateMatrixWorld(true);

      if (tileRenderer.frustumCuller) {
        tileRenderer.frustumCuller.updateVisibility(newCam);
      }

      saveCameraStateImmediate(tileRenderer, isOrthographic);
    }
  }, [isOrthographic]);

  // Camera preset change
  useEffect(() => {
    if (isInitialPresetRef.current) {
      isInitialPresetRef.current = false;
      return;
    }
    const tileRenderer = rendererInstanceRef.current;
    if (tileRenderer && tileRenderer.controls) {
      applyPresetPosition(
        tileRenderer,
        cameraPreset,
        tileEngineRef.current.rows,
        tileEngineRef.current.cols
      );
      saveCameraStateImmediate(tileRenderer, isOrthographic);
    }
  }, [cameraPreset]);

  // Center camera trigger
  useEffect(() => {
    if (centerCameraTrigger === prevCenterTriggerRef.current) return;
    prevCenterTriggerRef.current = centerCameraTrigger;

    const tileRenderer = rendererInstanceRef.current;
    if (tileRenderer && tileRenderer.controls) {
      try {
        localStorage.removeItem(CAMERA_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
      applyPresetPosition(
        tileRenderer,
        cameraPreset,
        tileEngineRef.current.rows,
        tileEngineRef.current.cols
      );
      saveCameraStateImmediate(tileRenderer, isOrthographicRef.current);
    }
  }, [centerCameraTrigger, cameraPreset]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden bg-black"
    />
  );
};
