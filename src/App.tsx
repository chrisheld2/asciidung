import React, { useState, useCallback, useEffect } from 'react';
import { ASCIIMazeCanvas } from './components/ASCIIMazeCanvas';
import { HUDControls } from './components/HUDControls';
import { PauseScreen } from './components/PauseScreen';
import { COLOR_THEMES, SPRITE_PACKS, generateNaturalWorld, playTerminalBeep } from './utils/sprites';
import { setUse3DSpriteTrees } from './utils/treeModels';
import { ColorTheme, WorldCell, MazeStats, CameraPreset, SpritePackType, PauseTab, RenderMetrics, DayNightState, LightType } from './types';

const SETTINGS_STORAGE_KEY = 'spritedung_user_settings_v1';

interface StoredUserSettings {
  themeId?: string;
  spritePackId?: SpritePackType;
  translucencyRatio?: number;
  autoRotate?: boolean;
  cameraPreset?: CameraPreset;
  isOrthographic?: boolean;
  soundEnabled?: boolean;
  crtEnabled?: boolean;
  isHeaderCollapsed?: boolean;
  isBottomCollapsed?: boolean;
  timeOfDayMinutes?: number;
  isTimeLocked?: boolean;
  manualTimeMinutes?: number;
  turnIncrementMinutes?: number;
  turnCount?: number;
  lightType?: LightType;
  use3DSpriteTrees?: boolean;
}

function loadSavedSettings(): StoredUserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Unable to load settings from localStorage:', err);
  }
  return {};
}

export default function App() {
  const initialSettings = loadSavedSettings();

  const [worldGrid, setWorldGrid] = useState<WorldCell[][]>(() => generateNaturalWorld(64, 64, 42424));
  const [theme, setTheme] = useState<ColorTheme>(() => {
    return COLOR_THEMES.find((t) => t.id === initialSettings.themeId) || COLOR_THEMES.find((t) => t.id === 'natural') || COLOR_THEMES[0];
  });
  const [spritePack, setSpritePack] = useState<SpritePackType>(() => {
    return initialSettings.spritePackId && SPRITE_PACKS.some((p) => p.id === initialSettings.spritePackId)
      ? initialSettings.spritePackId
      : 'retro';
  });
  const [translucencyRatio, setTranslucencyRatio] = useState<number>(() => {
    return typeof initialSettings.translucencyRatio === 'number' ? initialSettings.translucencyRatio : 0.18;
  });
  const [autoRotate, setAutoRotate] = useState<boolean>(() => {
    return typeof initialSettings.autoRotate === 'boolean' ? initialSettings.autoRotate : true;
  });
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(() => {
    return initialSettings.cameraPreset || 'isometric';
  });
  const [isOrthographic, setIsOrthographic] = useState<boolean>(() => {
    return typeof initialSettings.isOrthographic === 'boolean' ? initialSettings.isOrthographic : true;
  });
  const [centerCameraTrigger, setCenterCameraTrigger] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return typeof initialSettings.soundEnabled === 'boolean' ? initialSettings.soundEnabled : true;
  });
  const [crtEnabled, setCrtEnabled] = useState<boolean>(() => {
    return typeof initialSettings.crtEnabled === 'boolean' ? initialSettings.crtEnabled : true;
  });
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(() => {
    return typeof initialSettings.isHeaderCollapsed === 'boolean' ? initialSettings.isHeaderCollapsed : false;
  });
  const [isBottomCollapsed, setIsBottomCollapsed] = useState<boolean>(() => {
    return typeof initialSettings.isBottomCollapsed === 'boolean' ? initialSettings.isBottomCollapsed : true;
  });
  const [lightType, setLightType] = useState<LightType>(() => {
    return initialSettings.lightType === 'fake' ? 'fake' : 'realtime';
  });
  const [use3DSpriteTreesState, setUse3DSpriteTreesState] = useState<boolean>(() => {
    const enabled = typeof initialSettings.use3DSpriteTrees === 'boolean' ? initialSettings.use3DSpriteTrees : true;
    setUse3DSpriteTrees(enabled);
    return enabled;
  });

  // Turn-Based Day/Night Cycle State
  const [timeOfDayMinutes, setTimeOfDayMinutes] = useState<number>(() => {
    return typeof initialSettings.timeOfDayMinutes === 'number' ? initialSettings.timeOfDayMinutes : 720; // Noon default
  });
  const [isTimeLocked, setIsTimeLocked] = useState<boolean>(() => {
    return typeof initialSettings.isTimeLocked === 'boolean' ? initialSettings.isTimeLocked : false;
  });
  const [manualTimeMinutes, setManualTimeMinutes] = useState<number>(() => {
    return typeof initialSettings.manualTimeMinutes === 'number' ? initialSettings.manualTimeMinutes : 720;
  });
  const [turnIncrementMinutes, setTurnIncrementMinutes] = useState<number>(() => {
    return typeof initialSettings.turnIncrementMinutes === 'number' ? initialSettings.turnIncrementMinutes : 30;
  });
  const [turnCount, setTurnCount] = useState<number>(() => {
    return typeof initialSettings.turnCount === 'number' ? initialSettings.turnCount : 1;
  });

  // Pause & Menu State
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<PauseTab>('metrics');
  const [gameTimeSeconds, setGameTimeSeconds] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [renderMetrics, setRenderMetrics] = useState<RenderMetrics>({
    fps: 60,
    drawCalls: 12,
    triangles: 24500,
    geometries: 18,
    textures: 2,
  });

  const handleToggle3DSpriteTrees = useCallback((enable: boolean) => {
    setUse3DSpriteTrees(enable);
    setUse3DSpriteTreesState(enable);
    setWorldGrid((prev) => [...prev]);
  }, []);

  // Turn Step Handler
  const handleAdvanceTurn = useCallback(() => {
    if (soundEnabled) playTerminalBeep(1200, 0.04);
    setTurnCount((prev) => prev + 1);
    if (!isTimeLocked) {
      setTimeOfDayMinutes((prev) => (prev + turnIncrementMinutes) % 1440);
    }
  }, [isTimeLocked, turnIncrementMinutes, soundEnabled]);

  const handleToggleTimeLock = useCallback(() => {
    if (soundEnabled) playTerminalBeep(1000, 0.04);
    setIsTimeLocked((prev) => !prev);
  }, [soundEnabled]);

  const handleTimeOfDayChange = useCallback((newMinutes: number) => {
    const bounded = Math.max(0, Math.min(1439, newMinutes));
    setTimeOfDayMinutes(bounded);
    setManualTimeMinutes(bounded);
  }, []);

  const handleTurnIncrementChange = useCallback((inc: number) => {
    if (soundEnabled) playTerminalBeep(1100, 0.03);
    setTurnIncrementMinutes(inc);
  }, [soundEnabled]);

  // Live stopwatch timer incrementing when game is running
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setGameTimeSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  // Fullscreen state listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcut listener for ESC (Pause), F (Fullscreen), and Space (Advance Turn)
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

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPaused((prev) => {
          const next = !prev;
          if (soundEnabled) {
            playTerminalBeep(next ? 700 : 1100, 0.05);
          }
          return next;
        });
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleFullscreenToggle();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setIsHeaderCollapsed((prev) => {
          if (soundEnabled) {
            playTerminalBeep(prev ? 1100 : 900, 0.04);
          }
          return !prev;
        });
      } else if (e.code === 'Space' && !isPaused) {
        e.preventDefault();
        handleAdvanceTurn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [soundEnabled, isPaused, handleAdvanceTurn]);

  const handleFullscreenToggle = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Unable to enter fullscreen mode:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.warn('Unable to exit fullscreen mode:', err);
        });
      }
    }
  }, []);

  const handleResetSettings = useCallback(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    setTheme(COLOR_THEMES[0]);
    setSpritePack('retro');
    setTranslucencyRatio(0.18);
    setAutoRotate(true);
    setCameraPreset('isometric');
    setIsOrthographic(true);
    setSoundEnabled(true);
    setCrtEnabled(true);
    setIsHeaderCollapsed(false);
    setIsBottomCollapsed(false);
    setTimeOfDayMinutes(720);
    setIsTimeLocked(false);
    setManualTimeMinutes(720);
    setTurnIncrementMinutes(30);
    setTurnCount(1);
    setLightType('realtime');
    setUse3DSpriteTrees(true);
    setUse3DSpriteTreesState(true);
  }, []);

  // Persist user settings to localStorage whenever they change
  useEffect(() => {
    try {
      const settingsToSave: StoredUserSettings = {
        themeId: theme.id,
        spritePackId: spritePack,
        translucencyRatio,
        autoRotate,
        cameraPreset,
        isOrthographic,
        soundEnabled,
        crtEnabled,
        isHeaderCollapsed,
        isBottomCollapsed,
        timeOfDayMinutes,
        isTimeLocked,
        manualTimeMinutes,
        turnIncrementMinutes,
        turnCount,
        lightType,
        use3DSpriteTrees: use3DSpriteTreesState,
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsToSave));
    } catch (err) {
      console.warn('Unable to save settings to localStorage:', err);
    }
  }, [
    theme,
    spritePack,
    translucencyRatio,
    autoRotate,
    cameraPreset,
    isOrthographic,
    soundEnabled,
    crtEnabled,
    isHeaderCollapsed,
    isBottomCollapsed,
    timeOfDayMinutes,
    isTimeLocked,
    manualTimeMinutes,
    turnIncrementMinutes,
    turnCount,
    lightType,
    use3DSpriteTreesState,
  ]);

  const [stats, setStats] = useState<MazeStats>({
    rows: 64,
    cols: 64,
    totalBlocks: 4096,
    translucentWalls: 0,
    opaqueWalls: 4096,
  });

  const handleRegenerateWorld = useCallback(() => {
    const newGrid = generateNaturalWorld(64, 64);
    setWorldGrid(newGrid);
  }, []);

  const handleCenterCamera = useCallback(() => {
    setCameraPreset('topdown');
    setCenterCameraTrigger((prev) => prev + 1);
  }, []);

  const handleStatsChange = useCallback((newStats: MazeStats) => {
    setStats(newStats);
  }, []);

  const handleRenderMetricsChange = useCallback((metrics: RenderMetrics) => {
    setRenderMetrics(metrics);
  }, []);

  const dayNightState: DayNightState = {
    timeOfDayMinutes,
    isTimeLocked,
    manualTimeMinutes,
    turnIncrementMinutes,
    turnCount,
  };

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-black select-none font-mono">
      {/* CRT Scanline Effect Overlay */}
      {crtEnabled && (
        <div
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            background: `
              linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.3) 50%),
              linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03))
            `,
            backgroundSize: '100% 4px, 6px 100%',
          }}
        />
      )}

      {/* 3D Canvas Scene */}
      <ASCIIMazeCanvas
        worldGrid={worldGrid}
        theme={theme}
        spritePack={spritePack}
        translucencyRatio={translucencyRatio}
        autoRotate={autoRotate}
        cameraPreset={cameraPreset}
        isOrthographic={isOrthographic}
        lightType={lightType}
        centerCameraTrigger={centerCameraTrigger}
        isPaused={isPaused}
        dayNightState={dayNightState}
        onStatsChange={handleStatsChange}
        onRenderMetricsChange={handleRenderMetricsChange}
      />

      {/* Cyberpunk HUD Controls */}
      <HUDControls
        stats={stats}
        theme={theme}
        spritePack={spritePack}
        translucencyRatio={translucencyRatio}
        autoRotate={autoRotate}
        cameraPreset={cameraPreset}
        isOrthographic={isOrthographic}
        soundEnabled={soundEnabled}
        crtEnabled={crtEnabled}
        isHeaderCollapsed={isHeaderCollapsed}
        isBottomCollapsed={isBottomCollapsed}
        isFullscreen={isFullscreen}
        fps={renderMetrics.fps}
        timeOfDayMinutes={timeOfDayMinutes}
        isTimeLocked={isTimeLocked}
        manualTimeMinutes={manualTimeMinutes}
        turnIncrementMinutes={turnIncrementMinutes}
        turnCount={turnCount}
        onAdvanceTurn={handleAdvanceTurn}
        onToggleTimeLock={handleToggleTimeLock}
        onTimeOfDayChange={handleTimeOfDayChange}
        onPauseToggle={() => setIsPaused((prev) => !prev)}
        onFullscreenToggle={handleFullscreenToggle}
        onHeaderCollapseToggle={() => setIsHeaderCollapsed((prev) => !prev)}
        onBottomCollapseToggle={() => setIsBottomCollapsed((prev) => !prev)}
        onThemeChange={setTheme}
        onSpritePackChange={setSpritePack}
        onRegenerateMaze={handleRegenerateWorld}
        onTranslucencyChange={setTranslucencyRatio}
        onAutoRotateToggle={() => setAutoRotate((prev) => !prev)}
        onCameraPresetChange={setCameraPreset}
        onOrthographicToggle={() => setIsOrthographic((prev) => !prev)}
        onCenterCamera={handleCenterCamera}
        onSoundToggle={() => setSoundEnabled((prev) => !prev)}
        onCrtToggle={() => setCrtEnabled((prev) => !prev)}
      />

      {/* Toggle Escape / Full Screen Pause Screen Modal */}
      <PauseScreen
        isOpen={isPaused}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={() => setIsPaused(false)}
        gameTimeSeconds={gameTimeSeconds}
        metrics={renderMetrics}
        stats={stats}
        theme={theme}
        spritePack={spritePack}
        translucencyRatio={translucencyRatio}
        autoRotate={autoRotate}
        cameraPreset={cameraPreset}
        isOrthographic={isOrthographic}
        soundEnabled={soundEnabled}
        crtEnabled={crtEnabled}
        isHeaderCollapsed={isHeaderCollapsed}
        isFullscreen={isFullscreen}
        lightType={lightType}
        use3DSpriteTrees={use3DSpriteTreesState}
        timeOfDayMinutes={timeOfDayMinutes}
        isTimeLocked={isTimeLocked}
        manualTimeMinutes={manualTimeMinutes}
        turnIncrementMinutes={turnIncrementMinutes}
        turnCount={turnCount}
        onAdvanceTurn={handleAdvanceTurn}
        onToggleTimeLock={handleToggleTimeLock}
        onTimeOfDayChange={handleTimeOfDayChange}
        onTurnIncrementChange={handleTurnIncrementChange}
        onThemeChange={setTheme}
        onSpritePackChange={setSpritePack}
        onRegenerateWorld={handleRegenerateWorld}
        onTranslucencyChange={setTranslucencyRatio}
        onAutoRotateToggle={() => setAutoRotate((prev) => !prev)}
        onCameraPresetChange={setCameraPreset}
        onOrthographicToggle={() => setIsOrthographic((prev) => !prev)}
        onCenterCamera={handleCenterCamera}
        onSoundToggle={() => setSoundEnabled((prev) => !prev)}
        onCrtToggle={() => setCrtEnabled((prev) => !prev)}
        onLightTypeChange={setLightType}
        onToggle3DSpriteTrees={handleToggle3DSpriteTrees}
        onFullscreenToggle={handleFullscreenToggle}
        onHeaderCollapseToggle={() => setIsHeaderCollapsed((prev) => !prev)}
        onResetSettings={handleResetSettings}
      />
    </div>
  );
}

