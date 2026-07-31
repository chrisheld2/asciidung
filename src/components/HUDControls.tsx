import React, { useState } from 'react';
import { ColorTheme, MazeStats, CameraPreset, SpritePackType } from '../types';
import { COLOR_THEMES, SPRITE_PACKS, SPRITE_DEFS, generateStandaloneHTML, playTerminalBeep } from '../utils/sprites';
import { FPSCounter } from './FPSCounter';
import { SpriteAtlasModal } from './SpriteAtlasModal';
import {
  RefreshCw,
  Palette,
  Camera,
  RotateCw,
  Download,
  Sparkles,
  Volume2,
  VolumeX,
  Grid,
  Focus,
  Box,
  ChevronUp,
  ChevronDown,
  Layers,
  Pause,
  Maximize2,
  Minimize2,
  Sun,
  Moon,
  Lock,
  Unlock,
  FastForward,
  Clock,
  Compass
} from 'lucide-react';

export function formatInGameTime(minutes: number): { timeStr: string; phase: string; icon: string } {
  const m = Math.floor(minutes) % 1440;
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  const padH = String(hours).padStart(2, '0');
  const padM = String(mins).padStart(2, '0');
  const timeStr = `${padH}:${padM}`;

  let phase = 'Night';
  let icon = '🌙';

  if (m >= 300 && m < 420) {
    phase = 'Dawn';
    icon = '🌅';
  } else if (m >= 420 && m < 720) {
    phase = 'Morning';
    icon = '🌤️';
  } else if (m >= 720 && m < 840) {
    phase = 'High Noon';
    icon = '☀️';
  } else if (m >= 840 && m < 1080) {
    phase = 'Afternoon';
    icon = '🌤️';
  } else if (m >= 1080 && m < 1200) {
    phase = 'Dusk';
    icon = '🌅';
  }

  return { timeStr, phase, icon };
}

interface HUDControlsProps {
  stats: MazeStats;
  theme: ColorTheme;
  spritePack: SpritePackType;
  translucencyRatio: number;
  autoRotate: boolean;
  cameraPreset: CameraPreset;
  isOrthographic: boolean;
  soundEnabled: boolean;
  crtEnabled: boolean;
  isHeaderCollapsed: boolean;
  isBottomCollapsed?: boolean;
  isFullscreen?: boolean;
  fps?: number;

  // Day/Night Turn State
  timeOfDayMinutes: number;
  isTimeLocked: boolean;
  manualTimeMinutes: number;
  turnIncrementMinutes: number;
  turnCount: number;

  onAdvanceTurn: () => void;
  onToggleTimeLock: () => void;
  onTimeOfDayChange: (minutes: number) => void;

  onPauseToggle: () => void;
  onFullscreenToggle: () => void;
  onHeaderCollapseToggle: () => void;
  onBottomCollapseToggle?: () => void;
  onThemeChange: (theme: ColorTheme) => void;
  onSpritePackChange: (pack: SpritePackType) => void;
  onRegenerateMaze: () => void;
  onTranslucencyChange: (ratio: number) => void;
  onAutoRotateToggle: () => void;
  onCameraPresetChange: (preset: CameraPreset) => void;
  onOrthographicToggle: () => void;
  onCenterCamera: () => void;
  onSoundToggle: () => void;
  onCrtToggle: () => void;
}

export const HUDControls: React.FC<HUDControlsProps> = ({
  stats,
  theme,
  spritePack,
  translucencyRatio,
  autoRotate,
  cameraPreset,
  isOrthographic,
  soundEnabled,
  crtEnabled,
  isHeaderCollapsed,
  isBottomCollapsed: propIsBottomCollapsed,
  isFullscreen = false,
  fps = 60,
  timeOfDayMinutes,
  isTimeLocked,
  manualTimeMinutes,
  turnIncrementMinutes,
  turnCount,
  onAdvanceTurn,
  onToggleTimeLock,
  onTimeOfDayChange,
  onPauseToggle,
  onFullscreenToggle,
  onHeaderCollapseToggle,
  onBottomCollapseToggle,
  onThemeChange,
  onSpritePackChange,
  onRegenerateMaze,
  onTranslucencyChange,
  onAutoRotateToggle,
  onCameraPresetChange,
  onOrthographicToggle,
  onCenterCamera,
  onSoundToggle,
  onCrtToggle,
}) => {
  const [showAtlasModal, setShowAtlasModal] = useState(false);
  const [localIsBottomCollapsed, setLocalIsBottomCollapsed] = useState(false);

  const effectiveIsBottomCollapsed = propIsBottomCollapsed !== undefined ? propIsBottomCollapsed : localIsBottomCollapsed;

  const handleToggleBottomCollapse = () => {
    if (onBottomCollapseToggle) {
      onBottomCollapseToggle();
    } else {
      setLocalIsBottomCollapsed((prev) => !prev);
    }
  };

  const activeMinutes = isTimeLocked ? manualTimeMinutes : timeOfDayMinutes;
  const timeInfo = formatInGameTime(activeMinutes);

  const handleRegen = () => {
    if (soundEnabled) playTerminalBeep(900, 0.05);
    onRegenerateMaze();
  };

  const handleThemeCycle = () => {
    if (soundEnabled) playTerminalBeep(1200, 0.04);
    const idx = COLOR_THEMES.findIndex((t) => t.id === theme.id);
    const nextTheme = COLOR_THEMES[(idx + 1) % COLOR_THEMES.length];
    onThemeChange(nextTheme);
  };

  const handleSpritePackCycle = () => {
    if (soundEnabled) playTerminalBeep(1000, 0.04);
    const idx = SPRITE_PACKS.findIndex((p) => p.id === spritePack);
    const nextPack = SPRITE_PACKS[(idx + 1) % SPRITE_PACKS.length];
    onSpritePackChange(nextPack.id);
  };

  const handleDownloadSingleFile = () => {
    if (soundEnabled) playTerminalBeep(1500, 0.08);
    const htmlContent = generateStandaloneHTML();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spritedung_3d_sprite_world.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentPackDef = SPRITE_PACKS.find((p) => p.id === spritePack) || SPRITE_PACKS[0];

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-4 font-mono select-none">
      {/* Top Bar: Title & Biome Legend */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3 w-full">
        {/* Header HUD */}
        {isHeaderCollapsed ? (
          <button
            onClick={() => {
              if (soundEnabled) playTerminalBeep(1100, 0.03);
              onHeaderCollapseToggle();
            }}
            className="pointer-events-auto p-2.5 rounded-lg bg-black/90 border hover:scale-110 active:scale-95 transition-all cursor-pointer backdrop-blur-md shadow-lg flex items-center justify-center"
            style={{ borderColor: theme.fg, color: theme.fg, boxShadow: `0 0 15px ${theme.fg}44` }}
            title="Expand Info & World Title Panel"
          >
            <Compass size={18} />
          </button>
        ) : (
          <div
            className="pointer-events-auto bg-black/90 border rounded-md p-3 max-w-md backdrop-blur-md shadow-lg transition-all duration-200"
            style={{ borderColor: theme.fg, boxShadow: `0 0 15px ${theme.fg}33` }}
          >
            <div
              className="flex items-center justify-between gap-2 transition-all border-b pb-2 mb-2"
              style={{ borderColor: `${theme.fg}44` }}
            >
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: theme.fg }} />
                <h1 className="text-sm font-bold tracking-widest uppercase" style={{ color: theme.fg, textShadow: `0 0 8px ${theme.fg}` }}>
                  SPRITEDUNG // 3D WORLD ENGINE
                </h1>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ color: theme.fg, borderColor: theme.fg }}>
                  DAY/NIGHT TURN ENGINE
                </span>
                <button
                  onClick={() => {
                    if (soundEnabled) playTerminalBeep(1100, 0.03);
                    onHeaderCollapseToggle();
                  }}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
                  title="Collapse Floating Window to Icon"
                >
                  <ChevronUp size={16} style={{ color: theme.fg }} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 mb-2">
              <span>Turn-based Day/Night transitions with dynamic torch & crystal point light pooling</span>
              <span className="text-[10px] bg-zinc-900 border border-zinc-700 text-amber-400 px-1.5 py-0.5 rounded font-bold font-mono">
                [SPACE] Turn
              </span>
            </div>

            {/* Block Meaning Legend */}
            <div className="flex flex-wrap gap-2 text-[10px] mb-2 p-1.5 bg-zinc-900/90 rounded border border-zinc-800">
              <span className="text-amber-400 font-bold">🔥 Torches & Braziers</span>
              <span className="text-purple-400 font-bold">🍄 Glowing Mushrooms</span>
              <span className="text-sky-400 font-bold">💎 Magic Crystals</span>
              <span className="text-red-400 font-bold">🌋 Molten Lava</span>
              <span className="text-slate-200 font-bold">🏔️ Mountains & Peaks</span>
              <span className="text-green-400 font-bold">🌲 3D Low-Poly Trees</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-zinc-950/80 p-2 rounded border border-zinc-800">
              <div>
                <span className="text-zinc-500">In-Game Time:</span> <span className="font-bold text-amber-400">{timeInfo.icon} {timeInfo.timeStr} ({timeInfo.phase})</span>
              </div>
              <div>
                <span className="text-zinc-500">Current Turn:</span> <span className="font-bold text-amber-300">TURN {turnCount}</span>
              </div>
              <div>
                <span className="text-zinc-500">World Size:</span> <span className="font-bold text-white">{stats.cols}x{stats.rows}</span>
              </div>
              <div>
                <span className="text-zinc-500">Total Tiles:</span> <span className="font-bold text-white">{stats.totalBlocks}</span>
              </div>
            </div>
          </div>
        )}

        {/* Top Right Quick Controls */}
        <div className="pointer-events-auto flex items-center gap-2 bg-black/90 p-2 rounded-md border border-zinc-800 backdrop-blur-md">
          {/* Accurate FPS Counter with zero string allocations */}
          <FPSCounter fps={fps} themeColor={theme.fg} />

          {/* Pause / Settings Button */}
          <button
            onClick={() => {
              if (soundEnabled) playTerminalBeep(1200, 0.04);
              onPauseToggle();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border transition-all active:scale-95 cursor-pointer"
            style={{
              backgroundColor: `${theme.fg}22`,
              color: theme.fg,
              borderColor: theme.fg,
              boxShadow: `0 0 10px ${theme.fg}33`,
            }}
            title="Pause Game & Open Full Settings Menu [ESC]"
          >
            <Pause size={14} className="fill-current" />
            <span>[ESC] Settings</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={() => {
              if (soundEnabled) playTerminalBeep(1100, 0.03);
              onFullscreenToggle();
            }}
            className="p-2 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            title={isFullscreen ? "Exit Fullscreen [F]" : "Fullscreen Mode [F]"}
          >
            {isFullscreen ? <Minimize2 size={16} style={{ color: theme.fg }} /> : <Maximize2 size={16} style={{ color: theme.fg }} />}
          </button>

          <button
            onClick={() => {
              if (soundEnabled) playTerminalBeep(1100, 0.03);
              setShowAtlasModal((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded border bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white hover:border-zinc-500"
            title="Inspect 8x8 Tile Atlas & Sprite Palette"
          >
            <Layers size={14} style={{ color: theme.fg }} />
            <span className="hidden sm:inline">Tile Atlas</span>
          </button>

          <button
            onClick={onSoundToggle}
            className="p-2 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Toggle Sound Effects"
          >
            {soundEnabled ? <Volume2 size={16} style={{ color: theme.fg }} /> : <VolumeX size={16} />}
          </button>

          <button
            onClick={onCrtToggle}
            className="p-2 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Toggle CRT Scanline Overlay"
          >
            <Sparkles size={16} style={{ color: crtEnabled ? theme.fg : '#a1a1aa' }} />
          </button>
        </div>
      </div>

      {/* Interactive 8x8 Tile Atlas Inspection Modal */}
      <SpriteAtlasModal
        isOpen={showAtlasModal}
        onClose={() => setShowAtlasModal(false)}
        theme={theme}
        activeSpritePack={spritePack}
        onSpritePackChange={onSpritePackChange}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};
