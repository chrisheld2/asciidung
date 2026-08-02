import React, { useState, useMemo, useEffect, useSyncExternalStore } from 'react';
import { PauseTab, ColorTheme, MazeStats, CameraPreset, SpritePackType, LightType } from '../types';
import { renderMetricsStore } from '../utils/renderMetricsStore';
import { COLOR_THEMES, SPRITE_PACKS, playTerminalBeep } from '../utils/sprites';
import { formatInGameTime } from './HUDControls';
import { GAME_VERSION } from '../version';
import { Play, Pause, Maximize2, Minimize2, ChartBar as BarChart2, Palette, Camera, Volume2, VolumeX, Sparkles, RefreshCw, RotateCw, Box, Focus, Download, Grid2x2 as Grid, Clock, Activity, Cpu, X, FileSliders as Sliders, Layers, Trash2, Monitor, Check, ShieldAlert, Flame, TreePine, Mountain, Waves, Castle, KeyRound, Compass, Sun, Moon, Lock, Clock as Unlock, FastForward, Zap, Lightbulb, Search } from 'lucide-react';

export interface SearchableUIElement {
  id: string;
  label: string;
  tab: PauseTab;
  tabName: string;
  description: string;
  keywords: string[];
}

export const SEARCHABLE_UI_ELEMENTS: SearchableUIElement[] = [
  {
    id: 'ui-session-time',
    label: 'Session Play Time',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Displays current active playing duration in HH:MM:SS format.',
    keywords: ['time', 'session', 'duration', 'play', 'clock', 'timer', 'metrics'],
  },
  {
    id: 'ui-render-rate',
    label: 'Render Rate & FPS',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Shows live frame rate (FPS) and estimated frame rendering time in milliseconds.',
    keywords: ['fps', 'frame', 'performance', 'rate', 'render', 'speed', 'ms'],
  },
  {
    id: 'ui-webgl-calls',
    label: 'WebGL Draw Calls & Polygons',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Monitors WebGL GPU draw call batches and total 3D polygon triangles rendered.',
    keywords: ['webgl', 'draw', 'calls', 'gpu', 'triangles', 'polygons', 'batches'],
  },
  {
    id: 'ui-map-dimensions',
    label: 'Map Dimensions & Total Tiles',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Displays 64x64 grid dimensions and total tile count.',
    keywords: ['map', 'grid', 'dimensions', 'size', 'tiles', 'blocks', '64x64'],
  },
  {
    id: 'ui-mountain-breakdown',
    label: 'Mountains & Peak Tiles',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Breakdown count and percentage of snowcap mountain ranges.',
    keywords: ['mountain', 'peaks', 'snow', 'height', 'terrain'],
  },
  {
    id: 'ui-tree-breakdown',
    label: '3D Trees & Flora Distribution',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Count of oaks, pines, mushrooms, and bushes in the world.',
    keywords: ['tree', 'flora', 'pine', 'oak', 'mushroom', 'bush', 'plants', 'nature'],
  },
  {
    id: 'ui-trails-breakdown',
    label: 'Meadows & Dirt Trails',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Tile metrics for grass, dirt paths, sand beaches, and cobblestones.',
    keywords: ['dirt', 'grass', 'sand', 'trails', 'meadow', 'cobble', 'ground'],
  },
  {
    id: 'ui-water-breakdown',
    label: 'Water & Oceans',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Shallow and deep water body tile metrics.',
    keywords: ['water', 'ocean', 'river', 'sea', 'lake', 'waves', 'liquid'],
  },
  {
    id: 'ui-ruins-breakdown',
    label: 'Crypt Ruins & Stone Walls',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Count of dungeon stone walls, mossy pillars, and crypt gates.',
    keywords: ['ruins', 'walls', 'crypt', 'stone', 'pillars', 'dungeon', 'gates'],
  },
  {
    id: 'ui-chests-breakdown',
    label: 'Chests, Relics & Lava Hazards',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Count of treasure chests, arcane runes, spikes, and lava pools.',
    keywords: ['chest', 'relics', 'lava', 'treasure', 'gold', 'runes', 'spikes', 'hazards'],
  },
  {
    id: 'ui-keyboard-shortcuts',
    label: 'Keyboard Shortcuts & Controls Reference',
    tab: 'metrics',
    tabName: 'Metrics',
    description: 'Quick guide for ESC (Pause), WASD (Pan), Left Drag (Orbit), and Scroll Wheel (Zoom).',
    keywords: ['controls', 'shortcuts', 'keyboard', 'keys', 'wasd', 'esc', 'mouse', 'pan', 'zoom'],
  },
  {
    id: 'ui-advance-turn',
    label: 'Advance Turn Button (+Turn Increment)',
    tab: 'daynight',
    tabName: 'Day/Night Cycle',
    description: 'Fast-forward time by the selected turn increment (+15m, +30m, +60m).',
    keywords: ['advance', 'turn', 'step', 'forward', 'time', 'next', 'fast'],
  },
  {
    id: 'ui-ingame-time',
    label: 'In-Game Time Display',
    tab: 'daynight',
    tabName: 'Day/Night Cycle',
    description: 'Shows exact simulated time of day (e.g. 12:00 High Noon, Dawn, Dusk, Midnight).',
    keywords: ['time', 'ingame', 'clock', 'noon', 'midnight', 'dawn', 'dusk', 'phase'],
  },
  {
    id: 'ui-time-locking',
    label: 'Time Locking Toggle',
    tab: 'daynight',
    tabName: 'Day/Night Cycle',
    description: 'Lock simulated time at a fixed hour or allow continuous auto-advancing.',
    keywords: ['lock', 'freeze', 'pause time', 'time lock', 'unlock', 'auto advance'],
  },
  {
    id: 'ui-turn-increment',
    label: 'Turn Step Increment Buttons',
    tab: 'daynight',
    tabName: 'Day/Night Cycle',
    description: 'Configure how many minutes elapse per turn step (15m, 30m, 60m, 120m).',
    keywords: ['increment', 'minutes', 'step size', 'turn speed', '15m', '30m', '60m'],
  },
  {
    id: 'ui-time-slider',
    label: 'Time-of-Day Range Slider',
    tab: 'daynight',
    tabName: 'Day/Night Cycle',
    description: 'Scrub time manually from 00:00 to 23:59 to see real-time sun angle & shadow changes.',
    keywords: ['slider', 'scrub', 'time slider', 'sun', 'shadows', 'hours', 'dial'],
  },
  {
    id: 'ui-time-presets',
    label: 'Time Presets (Midnight, Dawn, Noon, Dusk)',
    tab: 'daynight',
    tabName: 'Day/Night Cycle',
    description: 'Quick-jump buttons for Midnight (00:00), Dawn (06:00), Noon (12:00), and Dusk (18:00).',
    keywords: ['presets', 'midnight', 'dawn', 'noon', 'dusk', 'quick time', 'hours'],
  },
  {
    id: 'ui-light-mode',
    label: 'Light Rendering Engine Mode (Real-Time vs Fake)',
    tab: 'daynight',
    tabName: 'Day/Night Cycle',
    description: 'Switch between WebGL Real-Time shaders and custom tile-distance Line-of-Sight Fake lighting.',
    keywords: ['light', 'lighting', 'realtime', 'fake light', 'shaders', 'los', 'shadows', 'mode'],
  },
  {
    id: 'ui-light-pooling',
    label: 'Dynamic Light Optimization & Pooling Cards',
    tab: 'daynight',
    tabName: 'Day/Night Cycle',
    description: 'Details on dynamic point lights (torches, mushrooms, crystals, lava) and GPU light pooling.',
    keywords: ['torch', 'light pooling', 'mushrooms', 'crystal', 'lava light', 'emitter', 'point lights'],
  },
  {
    id: 'ui-theme-palette',
    label: 'Color Palette Themes',
    tab: 'visuals',
    tabName: 'Visuals & Themes',
    description: 'Select color schemes (Cyberpunk, Matrix Green, Amber CRT, Synthwave, Solarized, etc.).',
    keywords: ['theme', 'color', 'palette', 'matrix', 'cyberpunk', 'amber', 'synthwave', 'visuals', 'skin'],
  },
  {
    id: 'ui-sprite-pack',
    label: 'Sprite Art Style Pack',
    tab: 'visuals',
    tabName: 'Visuals & Themes',
    description: 'Choose 8x8 pixel art palettes (Retro 8-Bit, Emerald Matrix, Dungeon Dark, Cyber, Gold).',
    keywords: ['sprite', 'pack', 'pixel art', '8x8', 'style', 'retro', 'dungeon', 'graphics'],
  },
  {
    id: 'ui-tree-mode',
    label: '3D Tree & Flora Model Style (Sprite vs Mesh)',
    tab: 'visuals',
    tabName: 'Visuals & Themes',
    description: 'Toggle between 3D Sprite Billboard quads (4-quad star pattern) and low-poly 3D meshes.',
    keywords: ['tree', 'trees', '3d trees', 'sprite trees', 'flora', 'billboard', 'oak', 'pine', 'mesh'],
  },
  {
    id: 'ui-wall-translucency',
    label: 'Wall Translucency Ratio',
    tab: 'visuals',
    tabName: 'Visuals & Themes',
    description: 'Adjust opacity slider for high dungeon walls to reveal hidden pathways.',
    keywords: ['translucency', 'wall opacity', 'transparent', 'walls', 'see through', 'visibility'],
  },
  {
    id: 'ui-crt-scanlines',
    label: 'CRT Scanlines Effect Toggle',
    tab: 'visuals',
    tabName: 'Visuals & Themes',
    description: 'Toggle retro CRT monitor scanlines, phosphor glow, and screen curve overlay.',
    keywords: ['crt', 'scanlines', 'retro', 'monitor', 'effect', 'overlay', 'phosphor', 'tv'],
  },
  {
    id: 'ui-camera-presets',
    label: 'Camera Angle View Presets',
    tab: 'camera',
    tabName: 'Camera & View',
    description: 'Switch camera angles between Isometric (3/4), Topdown (Overhead), Side, and Firstperson.',
    keywords: ['camera', 'angle', 'preset', 'isometric', 'topdown', 'side', 'firstperson', 'view', 'perspective'],
  },
  {
    id: 'ui-projection-mode',
    label: 'Projection Mode (Orthographic / Perspective)',
    tab: 'camera',
    tabName: 'Camera & View',
    description: 'Toggle between Orthographic (no depth distortion) and 3D Perspective projection.',
    keywords: ['projection', 'orthographic', 'perspective', 'ortho', 'persp', 'lens', 'distortion', '3d'],
  },
  {
    id: 'ui-turntable-rotate',
    label: 'Turntable Auto-Rotate Toggle',
    tab: 'camera',
    tabName: 'Camera & View',
    description: 'Enable or disable smooth continuous 360 degree horizontal camera rotation.',
    keywords: ['rotate', 'turntable', 'auto rotate', 'spin', 'camera turn', 'rotation'],
  },
  {
    id: 'ui-center-camera',
    label: 'Center Camera & Reset Target Button',
    tab: 'camera',
    tabName: 'Camera & View',
    description: 'Recenter camera focus onto the middle of the 3D map.',
    keywords: ['center', 'recenter', 'reset camera', 'focus', 'target', 'origin'],
  },
  {
    id: 'ui-regenerate-world',
    label: 'Regenerate World Seed Button',
    tab: 'camera',
    tabName: 'Camera & View',
    description: 'Generate a brand new random procedural dungeon layout and terrain seed.',
    keywords: ['regenerate', 'world', 'seed', 'randomize', 'new map', 'generate', 'reset world'],
  },
  {
    id: 'ui-terminal-audio',
    label: 'Terminal Audio Feedback Toggle',
    tab: 'audio',
    tabName: 'Audio & System',
    description: 'Enable or mute retro cyberpunk terminal UI beeps and button click audio.',
    keywords: ['audio', 'sound', 'beeps', 'terminal sound', 'volume', 'mute', 'clicks', 'sfx'],
  },
  {
    id: 'ui-hud-window',
    label: 'HUD Floating Window Collapse / Expand',
    tab: 'audio',
    tabName: 'Audio & System',
    description: 'Toggle in-game HUD between mini collapsed header and expanded map metric panel.',
    keywords: ['hud', 'collapse', 'expand', 'floating window', 'gui', 'overlay', 'interface'],
  },
  {
    id: 'ui-export-html',
    label: 'Export Standalone Offline .HTML',
    tab: 'audio',
    tabName: 'Audio & System',
    description: 'Download full single-file .html version containing renderer & asset atlas for offline play.',
    keywords: ['export', 'download', 'html', 'standalone', 'offline', 'save file', 'single file'],
  },
  {
    id: 'ui-reset-settings',
    label: 'Reset All Settings to Defaults',
    tab: 'audio',
    tabName: 'Audio & System',
    description: 'Restore theme, audio, camera, and display preferences back to factory defaults.',
    keywords: ['reset', 'defaults', 'restore', 'factory reset', 'clear settings', 'wipe'],
  },
  {
    id: 'ui-fullscreen',
    label: 'Fullscreen Mode Toggle',
    tab: 'metrics',
    tabName: 'Header Bar',
    description: 'Toggle full screen browser presentation mode.',
    keywords: ['fullscreen', 'maximize', 'minimize', 'screen', 'display'],
  },
  {
    id: 'ui-resume',
    label: 'Resume Game Button',
    tab: 'metrics',
    tabName: 'Header Bar',
    description: 'Close pause menu and resume playing.',
    keywords: ['resume', 'play', 'unpause', 'close menu', 'continue', 'start'],
  },
];

interface SearchedTooltipProps {
  elementId: string;
  activeElement: SearchableUIElement | null;
  onClose: () => void;
  theme: ColorTheme;
}

const SearchedTooltip: React.FC<SearchedTooltipProps> = ({
  elementId,
  activeElement,
  onClose,
  theme,
}) => {
  if (!activeElement || activeElement.id !== elementId) return null;

  return (
    <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center pointer-events-auto animate-bounce">
      <div
        className="px-3 py-1.5 rounded-lg border text-xs font-mono font-bold shadow-2xl flex items-center gap-2 bg-zinc-950 text-white whitespace-nowrap"
        style={{
          borderColor: theme.fg,
          boxShadow: `0 0 25px ${theme.fg}aa, inset 0 0 10px ${theme.fg}33`,
        }}
      >
        <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: theme.fg }} />
        <span style={{ color: theme.fg }}>[SEARCH TARGET]</span>
        <span>{activeElement.label}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-2 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="Dismiss tooltip"
        >
          <X size={12} />
        </button>
      </div>
      <div
        className="w-2.5 h-2.5 rotate-45 border-r border-b bg-zinc-950 -mt-1.5"
        style={{ borderColor: theme.fg }}
      />
    </div>
  );
};

interface PauseScreenProps {
  activeTab: PauseTab;
  onTabChange: (tab: PauseTab) => void;
  onClose: () => void;
  gameTimeSeconds: number;
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
  isFullscreen: boolean;
  lightType?: LightType;
  use3DSpriteTrees?: boolean;

  // Day/Night Turn State & Handlers
  timeOfDayMinutes: number;
  isTimeLocked: boolean;
  manualTimeMinutes: number;
  turnIncrementMinutes: number;
  turnCount: number;
  onAdvanceTurn: () => void;
  onToggleTimeLock: () => void;
  onTimeOfDayChange: (minutes: number) => void;
  onTurnIncrementChange: (incMinutes: number) => void;

  onThemeChange: (theme: ColorTheme) => void;
  onSpritePackChange: (pack: SpritePackType) => void;
  onRegenerateWorld: () => void;
  onTranslucencyChange: (ratio: number) => void;
  onAutoRotateToggle: () => void;
  onCameraPresetChange: (preset: CameraPreset) => void;
  onOrthographicToggle: () => void;
  onCenterCamera: () => void;
  onSoundToggle: () => void;
  onCrtToggle: () => void;
  onLightTypeChange?: (type: LightType) => void;
  onToggle3DSpriteTrees?: (enable: boolean) => void;
  onFullscreenToggle: () => void;
  onHeaderCollapseToggle: () => void;
  onResetSettings: () => void;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

const PauseScreenComponent: React.FC<PauseScreenProps> = ({
  activeTab,
  onTabChange,
  onClose,
  gameTimeSeconds,
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
  isFullscreen,
  lightType = 'realtime',
  use3DSpriteTrees = true,
  timeOfDayMinutes = 720,
  isTimeLocked = false,
  manualTimeMinutes = 720,
  turnIncrementMinutes = 30,
  turnCount = 1,
  onAdvanceTurn,
  onToggleTimeLock,
  onTimeOfDayChange,
  onTurnIncrementChange,
  onThemeChange,
  onSpritePackChange,
  onRegenerateWorld,
  onTranslucencyChange,
  onAutoRotateToggle,
  onCameraPresetChange,
  onOrthographicToggle,
  onCenterCamera,
  onSoundToggle,
  onCrtToggle,
  onLightTypeChange,
  onToggle3DSpriteTrees,
  onFullscreenToggle,
  onHeaderCollapseToggle,
  onResetSettings,
}) => {
  // Mounted only while paused (see App), so every hook below runs
  // unconditionally. They used to sit after an `if (!isOpen) return null`,
  // which changed the hook count between renders - React reported this as
  // "Expected static flag was missing".
  const metrics = useSyncExternalStore(renderMetricsStore.subscribe, renderMetricsStore.get);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchedElement, setSearchedElement] = useState<SearchableUIElement | null>(null);

  useEffect(() => {
    if (searchedElement) {
      const timer = setTimeout(() => {
        setSearchedElement(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [searchedElement]);

  const filteredElements = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return SEARCHABLE_UI_ELEMENTS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tabName.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const handleSelectUIElement = (item: SearchableUIElement) => {
    if (soundEnabled) playTerminalBeep(1200, 0.04);
    onTabChange(item.tab);
    setSearchedElement(item);
    setIsSearchOpen(false);
    setSearchQuery('');

    setTimeout(() => {
      const el = document.getElementById(item.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleTabClick = (tab: PauseTab) => {
    if (soundEnabled) playTerminalBeep(1100, 0.03);
    onTabChange(tab);
  };

  const handleDownload = async () => {
    if (soundEnabled) playTerminalBeep(1400, 0.06);
    const { generateStandaloneHTML } = await import('../utils/standaloneExport');
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
    <div className="tui-pause fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-lg select-none font-mono">
      {/* Container Window */}
      <div
        className="relative w-full max-w-4xl h-[90vh] max-h-[90vh] bg-zinc-950 border rounded-xl shadow-2xl flex flex-col overflow-hidden text-zinc-200"
        style={{
          borderColor: theme.fg,
          boxShadow: `0 0 40px ${theme.fg}33, inset 0 0 15px ${theme.fg}11`,
        }}
      >
        {/* Top Header Bar */}
        <div
          className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b bg-zinc-900/90 backdrop-blur-md"
          style={{ borderColor: `${theme.fg}44` }}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: theme.fg }}
              />
              <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: theme.fg }} />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-wider uppercase flex items-center gap-2" style={{ color: theme.fg }}>
                <Pause size={18} />
                SYSTEM PAUSED // CONTROL PANEL
              </h2>
              <p className="text-[10px] sm:text-xs text-zinc-400">v{GAME_VERSION} • Press ESC or click Resume to return to game</p>
            </div>
          </div>

          {/* Top Actions: Fullscreen & Resume */}
          <div className="flex items-center gap-2">
            <button
              id="ui-fullscreen"
              onClick={() => {
                if (soundEnabled) playTerminalBeep(1200, 0.03);
                onFullscreenToggle();
              }}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border bg-zinc-900 text-zinc-300 hover:text-white transition-all ${
                searchedElement?.id === 'ui-fullscreen' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-700 hover:border-zinc-500'
              }`}
              title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
            >
              <SearchedTooltip elementId="ui-fullscreen" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
              {isFullscreen ? <Minimize2 size={14} style={{ color: theme.fg }} /> : <Maximize2 size={14} style={{ color: theme.fg }} />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>

            <button
              id="ui-resume"
              onClick={() => {
                if (soundEnabled) playTerminalBeep(900, 0.04);
                onClose();
              }}
              className={`relative flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded border transition-all active:scale-95 ${
                searchedElement?.id === 'ui-resume' ? 'ring-2 ring-amber-400 border-amber-400' : ''
              }`}
              style={{
                backgroundColor: theme.fg,
                color: '#000',
                borderColor: theme.fg,
                boxShadow: `0 0 10px ${theme.fg}55`,
              }}
            >
              <SearchedTooltip elementId="ui-resume" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
              <Play size={14} className="fill-current" />
              <span>Resume</span>
            </button>
          </div>
        </div>

        {/* Search UI Elements Input Bar */}
        <div className="relative px-4 sm:px-6 py-2.5 bg-zinc-900/95 border-b border-zinc-800 flex items-center gap-3 z-30">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
              <Search size={15} style={{ color: theme.fg }} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredElements.length > 0) {
                  handleSelectUIElement(filteredElements[0]);
                } else if (e.key === 'Escape') {
                  setIsSearchOpen(false);
                }
              }}
              placeholder="Search UI controls... (e.g. FPS, Theme, Camera, Audio, Time, Fullscreen)"
              className="w-full pl-9 pr-8 py-1.5 text-xs font-mono bg-zinc-950/90 border rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 transition-all"
              style={{
                borderColor: isSearchOpen && searchQuery ? theme.fg : '#3f3f46',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-400 hover:text-white"
              >
                <X size={14} />
              </button>
            )}

            {/* Search Results Dropdown */}
            {isSearchOpen && searchQuery.trim() && (
              <div
                className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-zinc-950 border rounded-lg shadow-2xl z-50 p-1 text-xs font-mono"
                style={{ borderColor: theme.fg }}
              >
                {filteredElements.length === 0 ? (
                  <div className="p-3 text-center text-zinc-500 italic">
                    No UI elements matching "{searchQuery}"
                  </div>
                ) : (
                  filteredElements.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectUIElement(item)}
                      className="w-full text-left px-3 py-2 rounded flex items-center justify-between hover:bg-zinc-800/80 transition-colors cursor-pointer group mb-0.5"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="font-bold text-zinc-200 group-hover:text-amber-300 flex items-center gap-2">
                          <span>{item.label}</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 line-clamp-1">
                          {item.description}
                        </div>
                      </div>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap ml-2 border"
                        style={{
                          backgroundColor: `${theme.fg}15`,
                          borderColor: `${theme.fg}44`,
                          color: theme.fg,
                        }}
                      >
                        {item.tabName}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Active Search Target Indicator */}
          {searchedElement && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded bg-amber-950/80 border border-amber-500/50 text-amber-300 text-[11px] font-bold animate-pulse">
              <Sparkles size={13} />
              <span>Target: {searchedElement.label}</span>
              <button
                onClick={() => setSearchedElement(null)}
                className="ml-1 text-amber-400 hover:text-white"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation Bar */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/50 overflow-x-auto scrollbar-none">
          <button
            onClick={() => handleTabClick('metrics')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'metrics'
                ? 'bg-zinc-800/80 text-white border-b-2'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 border-transparent'
            }`}
            style={{
              borderBottomColor: activeTab === 'metrics' ? theme.fg : 'transparent',
              color: activeTab === 'metrics' ? theme.fg : undefined,
            }}
          >
            <BarChart2 size={16} />
            <span>1. Metrics</span>
          </button>

          <button
            onClick={() => handleTabClick('daynight')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'daynight'
                ? 'bg-zinc-800/80 text-white border-b-2'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 border-transparent'
            }`}
            style={{
              borderBottomColor: activeTab === 'daynight' ? theme.fg : 'transparent',
              color: activeTab === 'daynight' ? theme.fg : undefined,
            }}
          >
            <Sun size={16} className="text-amber-400" />
            <span>2. Day/Night Cycle</span>
          </button>

          <button
            onClick={() => handleTabClick('visuals')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'visuals'
                ? 'bg-zinc-800/80 text-white border-b-2'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 border-transparent'
            }`}
            style={{
              borderBottomColor: activeTab === 'visuals' ? theme.fg : 'transparent',
              color: activeTab === 'visuals' ? theme.fg : undefined,
            }}
          >
            <Palette size={16} />
            <span>3. Visuals & Themes</span>
          </button>

          <button
            onClick={() => handleTabClick('camera')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'camera'
                ? 'bg-zinc-800/80 text-white border-b-2'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 border-transparent'
            }`}
            style={{
              borderBottomColor: activeTab === 'camera' ? theme.fg : 'transparent',
              color: activeTab === 'camera' ? theme.fg : undefined,
            }}
          >
            <Camera size={16} />
            <span>4. Camera & View</span>
          </button>

          <button
            onClick={() => handleTabClick('audio')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'audio'
                ? 'bg-zinc-800/80 text-white border-b-2'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 border-transparent'
            }`}
            style={{
              borderBottomColor: activeTab === 'audio' ? theme.fg : 'transparent',
              color: activeTab === 'audio' ? theme.fg : undefined,
            }}
          >
            <Sliders size={16} />
            <span>5. Audio & System</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: GAME METRICS */}
          {activeTab === 'metrics' && (
            <div className="space-y-6">
              {/* Primary Key Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Time On / Play Time */}
                <div
                  id="ui-session-time"
                  className={`relative bg-zinc-900/80 border rounded-lg p-3.5 flex flex-col justify-between transition-all ${
                    searchedElement?.id === 'ui-session-time' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-session-time" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Clock size={14} className="text-sky-400" />
                      Session Time
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-sky-400 font-bold">
                      PAUSED
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-white mt-1">
                    {formatTime(gameTimeSeconds)}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">Active playing duration</div>
                </div>

                {/* FPS & Performance */}
                <div
                  id="ui-fps-rate"
                  className={`relative bg-zinc-900/80 border rounded-lg p-3.5 flex flex-col justify-between transition-all ${
                    searchedElement?.id === 'ui-fps-rate' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-fps-rate" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Activity size={14} className="text-emerald-400" />
                      Render Rate
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                      {metrics.fps >= 50 ? 'OPTIMAL' : 'GOOD'}
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-emerald-400 mt-1">
                    {metrics.fps > 0 ? metrics.fps : 60} <span className="text-sm font-normal text-zinc-400">FPS</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    ~{Math.round(1000 / (metrics.fps || 60))}ms frame time
                  </div>
                </div>

                {/* WebGL Draw Calls & Triangles */}
                <div
                  id="ui-webgl-calls"
                  className={`relative bg-zinc-900/80 border rounded-lg p-3.5 flex flex-col justify-between transition-all ${
                    searchedElement?.id === 'ui-webgl-calls' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-webgl-calls" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Cpu size={14} className="text-amber-400" />
                      WebGL Calls
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 font-bold">
                      BATCHED
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-amber-300 mt-1">
                    {metrics.drawCalls || 12} <span className="text-sm font-normal text-zinc-400">calls</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {(metrics.triangles || stats.totalBlocks * 12).toLocaleString()} polygons
                  </div>
                </div>

                {/* World Grid Stats */}
                <div
                  id="ui-map-dimensions"
                  className={`relative bg-zinc-900/80 border rounded-lg p-3.5 flex flex-col justify-between transition-all ${
                    searchedElement?.id === 'ui-map-dimensions' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-map-dimensions" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Grid size={14} className="text-purple-400" />
                      Map Dimensions
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-purple-400 font-bold">
                      64x64
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-purple-300 mt-1">
                    {stats.totalBlocks} <span className="text-sm font-normal text-zinc-400">tiles</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">Unified 3D low-poly terrain</div>
                </div>
              </div>

              {/* World Block Breakdown */}
              <div
                id="ui-block-distribution"
                className={`relative bg-zinc-900/50 border rounded-xl p-4 sm:p-5 transition-all ${
                  searchedElement?.id === 'ui-block-distribution' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-block-distribution" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-2">
                  <Layers size={16} style={{ color: theme.fg }} />
                  World Block Type Distribution ({stats.totalBlocks} Tiles Total)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Item 1: Mountains */}
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Mountain size={18} className="text-slate-300" />
                      <div>
                        <div className="font-bold text-slate-200">Unified Low-Poly Peaks</div>
                        <div className="text-[10px] text-zinc-500">Snowcap mountain ranges</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-300">{stats.mountainCount || 0}</div>
                      <div className="text-[10px] text-zinc-500">
                        {Math.round(((stats.mountainCount || 0) / stats.totalBlocks) * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Item 2: Trees */}
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <TreePine size={18} className="text-green-400" />
                      <div>
                        <div className="font-bold text-green-300">3D Trees & Flora</div>
                        <div className="text-[10px] text-zinc-500">Oaks, Pines, Mushrooms & Bushes</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-400">{stats.treeCount || 0}</div>
                      <div className="text-[10px] text-zinc-500">
                        {Math.round(((stats.treeCount || 0) / stats.totalBlocks) * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Item 3: Soil & Sand */}
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Compass size={18} className="text-amber-500" />
                      <div>
                        <div className="font-bold text-amber-300">Meadows & Dirt Trails</div>
                        <div className="text-[10px] text-zinc-500">Grass, Dirt, Sand & Cobble</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-amber-400">{stats.dirtCount || 0}</div>
                      <div className="text-[10px] text-zinc-500">
                        {Math.round(((stats.dirtCount || 0) / stats.totalBlocks) * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Item 4: Water */}
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Waves size={18} className="text-sky-400" />
                      <div>
                        <div className="font-bold text-sky-300">Water & Oceans</div>
                        <div className="text-[10px] text-zinc-500">Shallow & Deep water bodies</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-sky-400">{stats.waterCount || 0}</div>
                      <div className="text-[10px] text-zinc-500">
                        {Math.round(((stats.waterCount || 0) / stats.totalBlocks) * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Item 5: Ruins */}
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Castle size={18} className="text-zinc-300" />
                      <div>
                        <div className="font-bold text-zinc-200">Crypt Ruins & Walls</div>
                        <div className="text-[10px] text-zinc-500">Stone walls, Pillars & Gates</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-zinc-200">{stats.ruinCount || 0}</div>
                      <div className="text-[10px] text-zinc-500">
                        {Math.round(((stats.ruinCount || 0) / stats.totalBlocks) * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Item 6: Chests & Special */}
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <KeyRound size={18} className="text-amber-400" />
                      <div>
                        <div className="font-bold text-amber-200">Chests, Relics & Lava</div>
                        <div className="text-[10px] text-zinc-500 font-mono">Gold chests, Runes & Spikes</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-amber-400">
                        {(stats.chestCount || 0) + (stats.specialCount || 0)}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {Math.round((((stats.chestCount || 0) + (stats.specialCount || 0)) / stats.totalBlocks) * 100)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Controls Quick Reference Guide */}
              <div
                id="ui-controls-guide"
                className={`relative bg-zinc-900/50 border rounded-xl p-4 sm:p-5 transition-all ${
                  searchedElement?.id === 'ui-controls-guide' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-controls-guide" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-2">
                  <Monitor size={16} style={{ color: theme.fg }} />
                  Keyboard Shortcuts & Game Controls
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-center">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-[11px]">
                      ESC
                    </span>
                    <div className="text-[11px] text-zinc-400 mt-1.5">Pause / Settings Menu</div>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-center">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-[11px]">
                      WASD / ◄▲▼►
                    </span>
                    <div className="text-[11px] text-zinc-400 mt-1.5">Pan Camera X/Y</div>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-center">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-[11px]">
                      Left Mouse Drag
                    </span>
                    <div className="text-[11px] text-zinc-400 mt-1.5">Orbit Camera</div>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-center">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-[11px]">
                      Q / E
                    </span>
                    <div className="text-[11px] text-zinc-400 mt-1.5">Zoom Camera In / Out</div>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-center">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-[11px]">
                      Scroll Wheel
                    </span>
                    <div className="text-[11px] text-zinc-400 mt-1.5">Zoom Camera</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TURN-BASED DAY/NIGHT & LIGHTING ENGINE */}
          {activeTab === 'daynight' && (
            <div className="space-y-6">
              {/* Primary Time Dial & Quick Controls Card */}
              <div
                id="ui-advance-turn"
                className={`relative bg-zinc-900/60 border rounded-xl p-4 sm:p-6 space-y-4 transition-all ${
                  searchedElement?.id === 'ui-advance-turn' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-advance-turn" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                      <Sun size={18} className="text-amber-400" />
                      Turn-Based Day/Night Cycle
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Time advances per turn step. Sunlight angle, color temperature, and ambient shadows update smoothly.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-md bg-amber-950/80 border border-amber-500/40 text-amber-300 font-extrabold font-mono">
                      TURN {turnCount}
                    </span>
                    <button
                      onClick={onAdvanceTurn}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-md font-bold text-xs uppercase tracking-wider transition-all transform active:scale-95 cursor-pointer shadow-md"
                      style={{
                        backgroundColor: theme.fg,
                        color: '#000',
                      }}
                    >
                      <FastForward size={14} className="fill-current" />
                      <span>Advance Turn (+{turnIncrementMinutes}m)</span>
                    </button>
                  </div>
                </div>

                {/* Current In-Game Time Display */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">In-Game Time</div>
                      <div className="text-2xl font-black font-mono text-amber-400 mt-0.5 flex items-center gap-2">
                        <span>{formatInGameTime(isTimeLocked ? manualTimeMinutes : timeOfDayMinutes).icon}</span>
                        <span>{formatInGameTime(isTimeLocked ? manualTimeMinutes : timeOfDayMinutes).timeStr}</span>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-zinc-900 text-amber-300 font-bold border border-zinc-800">
                      {formatInGameTime(isTimeLocked ? manualTimeMinutes : timeOfDayMinutes).phase}
                    </span>
                  </div>

                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Time Locking</div>
                      <div className="text-base font-bold text-white mt-1 flex items-center gap-1.5">
                        {isTimeLocked ? (
                          <span className="text-red-400 flex items-center gap-1"><Lock size={14} /> Time Locked</span>
                        ) : (
                          <span className="text-emerald-400 flex items-center gap-1"><Unlock size={14} /> Auto-Advancing</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={onToggleTimeLock}
                      className={`px-3 py-1.5 text-xs font-bold rounded border transition-colors cursor-pointer ${
                        isTimeLocked
                          ? 'bg-red-950/60 border-red-700 text-red-300 hover:bg-red-900'
                          : 'bg-emerald-950/60 border-emerald-700 text-emerald-300 hover:bg-emerald-900'
                      }`}
                    >
                      {isTimeLocked ? 'Unlock Time' : 'Lock Time'}
                    </button>
                  </div>

                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Turn Step Increment</div>
                      <div className="text-base font-bold text-amber-300 mt-1">
                        +{turnIncrementMinutes} mins / turn
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[15, 30, 60, 120].map((inc) => (
                        <button
                          key={inc}
                          onClick={() => onTurnIncrementChange(inc)}
                          className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                            turnIncrementMinutes === inc
                              ? 'bg-amber-500 text-black border-amber-400 font-extrabold'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                          }`}
                        >
                          {inc}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Time Dial Range Slider */}
                <div
                  id="ui-time-slider"
                  className={`relative bg-zinc-950 p-4 rounded-lg border space-y-2 transition-all ${
                    searchedElement?.id === 'ui-time-slider' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-time-slider" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                      <Sun size={14} className="text-amber-400" /> Time-of-Day Slider (00:00 - 23:59)
                    </span>
                    <span className="text-amber-400 font-mono font-bold">
                      {formatInGameTime(isTimeLocked ? manualTimeMinutes : timeOfDayMinutes).timeStr}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1439}
                    step={15}
                    value={isTimeLocked ? manualTimeMinutes : timeOfDayMinutes}
                    onChange={(e) => onTimeOfDayChange(Number(e.target.value))}
                    className="w-full accent-amber-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex items-center justify-between pt-1 text-[10px]">
                    {[
                      { name: '00:00 Midnight', mins: 0, icon: '🌙' },
                      { name: '06:00 Dawn', mins: 360, icon: '🌅' },
                      { name: '12:00 High Noon', mins: 720, icon: '☀️' },
                      { name: '18:00 Dusk', mins: 1080, icon: '🌅' },
                      { name: '23:45 Night', mins: 1425, icon: '🌙' },
                    ].map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => onTimeOfDayChange(preset.mins)}
                        className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 text-zinc-400 hover:text-amber-300 font-mono transition-colors cursor-pointer"
                      >
                        {preset.icon} {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Light Mode Toggle Setting: Real-Time vs Fake */}
              <div
                id="ui-light-mode"
                className={`relative bg-zinc-900/60 border rounded-xl p-4 sm:p-6 space-y-4 transition-all ${
                  searchedElement?.id === 'ui-light-mode' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-light-mode" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                      <Lightbulb size={18} className="text-amber-400" />
                      Light Rendering Engine Mode
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Toggle between full WebGL Real-Time lighting and custom tile-distance Line-of-Sight (LoS) Fake Light.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                    <button
                      onClick={() => {
                        if (soundEnabled) playTerminalBeep(1100, 0.03);
                        onLightTypeChange?.('realtime');
                      }}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                        lightType === 'realtime'
                          ? 'bg-amber-500 text-black shadow-md font-extrabold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Real-Time
                    </button>
                    <button
                      onClick={() => {
                        if (soundEnabled) playTerminalBeep(1100, 0.03);
                        onLightTypeChange?.('fake');
                      }}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                        lightType === 'fake'
                          ? 'bg-amber-500 text-black shadow-md font-extrabold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Fake
                    </button>
                  </div>
                </div>

                <div className="text-xs text-zinc-400 bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80 font-mono">
                  {lightType === 'realtime' ? (
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-400 font-bold whitespace-nowrap">● REAL-TIME:</span>
                      <span>Standard WebGL shader pipeline with directional lights, ambient lighting, and point-light pooling.</span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold whitespace-nowrap">● FAKE LIGHT:</span>
                      <span>Overrides real-time shaders with inverse tile-distance brightness gradients and raycasted Line-of-Sight (LoS) solid shadow boxes.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Light Optimization & Pooling Architecture */}
              <div
                id="ui-dynamic-lights"
                className={`relative bg-zinc-900/60 border rounded-xl p-4 sm:p-6 space-y-4 transition-all ${
                  searchedElement?.id === 'ui-dynamic-lights' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-dynamic-lights" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Zap size={18} className="text-amber-400" />
                  Performant Light Source Optimization (Dynamic Light Pooling)
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  To achieve 60+ FPS without WebGL shader pipeline stalls, dynamic light emitters (torches, mushrooms, crystals, lava) are scanned across the 64x64 world grid and sorted dynamically by camera distance. Up to <strong>6 visible point lights</strong> are rendered in real time, and active lights retain their slots until they leave the camera view.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-amber-400 font-bold flex items-center gap-1.5"><Flame size={14} /> Torches & Braziers</span>
                      <span className="text-[10px] bg-amber-950 text-amber-400 border border-amber-800 px-1.5 py-0.5 rounded font-bold">WARM POOL</span>
                    </div>
                    <div className="text-lg font-bold text-white mt-1">Flickering Warm Light</div>
                    <div className="text-[10px] text-zinc-500 mt-1">Color: #ff9933 • Radius: 12 tiles</div>
                  </div>

                  <div className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-purple-400 font-bold flex items-center gap-1.5"><Lightbulb size={14} /> Glowing Mushrooms</span>
                      <span className="text-[10px] bg-purple-950 text-purple-400 border border-purple-800 px-1.5 py-0.5 rounded font-bold">BIOLUM</span>
                    </div>
                    <div className="text-lg font-bold text-white mt-1">Purple Ambient Pulse</div>
                    <div className="text-[10px] text-zinc-500 mt-1">Color: #a855f7 • Radius: 8 tiles</div>
                  </div>

                  <div className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sky-400 font-bold flex items-center gap-1.5"><Zap size={14} /> Magic Crystals</span>
                      <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-800 px-1.5 py-0.5 rounded font-bold">ARCANE</span>
                    </div>
                    <div className="text-lg font-bold text-white mt-1">Cyan Crystal Glow</div>
                    <div className="text-[10px] text-zinc-500 mt-1">Color: #38bdf8 • Radius: 10 tiles</div>
                  </div>

                  <div className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-red-400 font-bold flex items-center gap-1.5"><Flame size={14} /> Molten Lava</span>
                      <span className="text-[10px] bg-red-950 text-red-400 border border-red-800 px-1.5 py-0.5 rounded font-bold">MOLTEN</span>
                    </div>
                    <div className="text-lg font-bold text-white mt-1">Red Thermal Aura</div>
                    <div className="text-[10px] text-zinc-500 mt-1">Color: #ef4444 • Radius: 14 tiles</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: VISUALS & THEMES */}
          {activeTab === 'visuals' && (
            <div className="space-y-6">
              {/* Theme Palette Picker */}
              <div
                id="ui-theme-picker"
                className={`relative bg-zinc-900/40 p-4 rounded-xl border transition-all ${
                  searchedElement?.id === 'ui-theme-picker' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-theme-picker" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-2">
                  <Palette size={16} style={{ color: theme.fg }} />
                  Color Palette Themes ({COLOR_THEMES.length} Themes)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {COLOR_THEMES.map((t) => {
                    const isSelected = theme.id === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          if (soundEnabled) playTerminalBeep(1100, 0.03);
                          onThemeChange(t);
                        }}
                        className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-zinc-800/90 border-2 shadow-lg'
                            : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900'
                        }`}
                        style={{
                          borderColor: isSelected ? t.fg : undefined,
                          boxShadow: isSelected ? `0 0 12px ${t.fg}33` : undefined,
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-white truncate">{t.name}</span>
                          {isSelected && <Check size={14} style={{ color: t.fg }} />}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-full border border-black/40" style={{ backgroundColor: t.fg }} />
                          <span className="w-3.5 h-3.5 rounded-full border border-black/40" style={{ backgroundColor: t.accent }} />
                          <span className="w-3.5 h-3.5 rounded-full border border-black/40" style={{ backgroundColor: t.light }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sprite Pack Picker */}
              <div
                id="ui-sprite-pack"
                className={`relative bg-zinc-900/40 p-4 rounded-xl border transition-all ${
                  searchedElement?.id === 'ui-sprite-pack' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-sprite-pack" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-2">
                  <Grid size={16} style={{ color: theme.fg }} />
                  Sprite Art Style Pack
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {SPRITE_PACKS.map((pack) => {
                    const isSelected = spritePack === pack.id;
                    return (
                      <button
                        key={pack.id}
                        onClick={() => {
                          if (soundEnabled) playTerminalBeep(1000, 0.03);
                          onSpritePackChange(pack.id);
                        }}
                        className={`p-3.5 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'bg-zinc-800/90 border-2 shadow-lg'
                            : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900'
                        }`}
                        style={{
                          borderColor: isSelected ? theme.fg : undefined,
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-white">{pack.name}</span>
                          {isSelected && <Check size={14} style={{ color: theme.fg }} />}
                        </div>
                        <p className="text-[11px] text-zinc-400">8x8 pixel palette mapping</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3D Tree & Flora Model Style Picker */}
              <div
                id="ui-tree-mode"
                className={`relative bg-zinc-900/40 p-4 rounded-xl border transition-all ${
                  searchedElement?.id === 'ui-tree-mode' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-tree-mode" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-2">
                  <TreePine size={16} className="text-green-400" />
                  3D Tree & Flora Rendering Mode
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      if (soundEnabled) playTerminalBeep(1100, 0.03);
                      onToggle3DSpriteTrees?.(true);
                    }}
                    className={`p-3.5 rounded-lg border text-left transition-all ${
                      use3DSpriteTrees
                        ? 'bg-zinc-800/90 border-2 shadow-lg'
                        : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900'
                    }`}
                    style={{
                      borderColor: use3DSpriteTrees ? theme.fg : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        🌲 3D Sprite Trees (4-Quad Star)
                      </span>
                      {use3DSpriteTrees && <Check size={14} style={{ color: theme.fg }} />}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Lightweight 4-quad intersecting billboard star pattern with transparent pixel leaf textures
                    </p>
                  </button>

                  <button
                    onClick={() => {
                      if (soundEnabled) playTerminalBeep(1100, 0.03);
                      onToggle3DSpriteTrees?.(false);
                    }}
                    className={`p-3.5 rounded-lg border text-left transition-all ${
                      !use3DSpriteTrees
                        ? 'bg-zinc-800/90 border-2 shadow-lg'
                        : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900'
                    }`}
                    style={{
                      borderColor: !use3DSpriteTrees ? theme.fg : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        🌳 Low-Poly Mesh Trees
                      </span>
                      {!use3DSpriteTrees && <Check size={14} style={{ color: theme.fg }} />}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Heavy 3D low-poly solid geometry with tapered bark trunks and conical foliage cores
                    </p>
                  </button>
                </div>
              </div>

              {/* Translucency & CRT Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Wall Translucency Slider */}
                <div
                  id="ui-wall-translucency"
                  className={`relative bg-zinc-900/70 border p-4 rounded-xl transition-all ${
                    searchedElement?.id === 'ui-wall-translucency' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-wall-translucency" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                      Wall Translucency Ratio
                    </label>
                    <span className="text-xs font-mono font-bold text-white">
                      {Math.round(translucencyRatio * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.02"
                    value={translucencyRatio}
                    onChange={(e) => onTranslucencyChange(parseFloat(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                  <p className="text-[10px] text-zinc-400 mt-2">
                    Controls opacity of high dungeon walls to reveal interior pathways
                  </p>
                </div>

                {/* CRT Scanlines Overlay Toggle */}
                <div
                  id="ui-crt-toggle"
                  className={`relative bg-zinc-900/70 border p-4 rounded-xl flex items-center justify-between transition-all ${
                    searchedElement?.id === 'ui-crt-toggle' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-crt-toggle" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                      <Sparkles size={14} style={{ color: crtEnabled ? theme.fg : '#a1a1aa' }} />
                      CRT Scanlines Effect
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Retro CRT monitor scanline & phosphor glow overlay
                    </p>
                  </div>
                  <button
                    onClick={onCrtToggle}
                    className={`px-3 py-1.5 text-xs font-bold rounded border transition-all ${
                      crtEnabled
                        ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {crtEnabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CAMERA & VIEW */}
          {activeTab === 'camera' && (
            <div className="space-y-6">
              {/* View Presets */}
              <div
                id="ui-camera-presets"
                className={`relative bg-zinc-900/40 p-4 rounded-xl border transition-all ${
                  searchedElement?.id === 'ui-camera-presets' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-camera-presets" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-2">
                  <Camera size={16} style={{ color: theme.fg }} />
                  Camera Angle View Presets
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['isometric', 'topdown', 'side', 'firstperson'] as CameraPreset[]).map((preset) => {
                    const isSelected = cameraPreset === preset;
                    return (
                      <button
                        key={preset}
                        onClick={() => {
                          if (soundEnabled) playTerminalBeep(900, 0.03);
                          onCameraPresetChange(preset);
                        }}
                        className={`p-4 rounded-xl border text-center capitalize transition-all ${
                          isSelected
                            ? 'bg-zinc-800/90 border-2 shadow-lg text-white font-bold'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                        }`}
                        style={{
                          borderColor: isSelected ? theme.fg : undefined,
                        }}
                      >
                        <div className="text-sm font-bold capitalize">{preset}</div>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {preset === 'isometric' && 'Classic 3/4 Perspective'}
                          {preset === 'topdown' && 'Direct Overhead View'}
                          {preset === 'side' && 'Low Horizon Profile'}
                          {preset === 'firstperson' && 'Close Dungeon Eye-Level'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Projection & Auto Rotate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Projection Mode */}
                <div
                  id="ui-projection-mode"
                  className={`relative bg-zinc-900/70 border p-4 rounded-xl flex items-center justify-between transition-all ${
                    searchedElement?.id === 'ui-projection-mode' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-projection-mode" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                      <Box size={16} style={{ color: theme.fg }} />
                      Projection Mode
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      {isOrthographic ? 'Orthographic (No lens distortion)' : 'Perspective (Depth vanishing point)'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (soundEnabled) playTerminalBeep(900, 0.03);
                      onOrthographicToggle();
                    }}
                    className="px-3 py-1.5 text-xs font-bold rounded border bg-zinc-800 border-zinc-700 text-white hover:border-zinc-500"
                  >
                    {isOrthographic ? 'ORTHO' : 'PERSP'}
                  </button>
                </div>

                {/* Auto Rotate Toggle */}
                <div
                  id="ui-auto-rotate"
                  className={`relative bg-zinc-900/70 border p-4 rounded-xl flex items-center justify-between transition-all ${
                    searchedElement?.id === 'ui-auto-rotate' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-auto-rotate" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                      <RotateCw size={16} style={{ color: theme.fg }} />
                      Turntable Auto-Rotate
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Smooth continuous 360° horizontal rotation
                    </p>
                  </div>
                  <button
                    onClick={onAutoRotateToggle}
                    className={`px-3 py-1.5 text-xs font-bold rounded border transition-all ${
                      autoRotate
                        ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {autoRotate ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Center Camera & Regenerate Action */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  id="ui-center-camera"
                  onClick={() => {
                    if (soundEnabled) playTerminalBeep(1000, 0.03);
                    onCenterCamera();
                  }}
                  className={`relative flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg border bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white hover:border-zinc-500 transition-all ${
                    searchedElement?.id === 'ui-center-camera' ? 'ring-2 ring-amber-400 border-amber-400' : ''
                  }`}
                >
                  <SearchedTooltip elementId="ui-center-camera" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <Focus size={16} style={{ color: theme.fg }} />
                  <span>Center Camera & Reset Target</span>
                </button>

                <button
                  id="ui-regenerate-world"
                  onClick={() => {
                    if (soundEnabled) playTerminalBeep(900, 0.05);
                    onRegenerateWorld();
                  }}
                  className={`relative flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg border transition-all ${
                    searchedElement?.id === 'ui-regenerate-world' ? 'ring-2 ring-amber-400 border-amber-400' : ''
                  }`}
                  style={{ backgroundColor: `${theme.fg}22`, color: theme.fg, borderColor: theme.fg }}
                >
                  <SearchedTooltip elementId="ui-regenerate-world" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <RefreshCw size={16} />
                  <span>Regenerate World Seed</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIO & SYSTEM */}
          {activeTab === 'audio' && (
            <div className="space-y-6">
              {/* System Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Audio Beeps */}
                <div
                  id="ui-terminal-audio"
                  className={`relative bg-zinc-900/70 border p-4 rounded-xl flex items-center justify-between transition-all ${
                    searchedElement?.id === 'ui-terminal-audio' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-terminal-audio" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                      {soundEnabled ? <Volume2 size={16} style={{ color: theme.fg }} /> : <VolumeX size={16} />}
                      Terminal Audio Feedback
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Cyberpunk UI terminal beeps and key click sounds
                    </p>
                  </div>
                  <button
                    onClick={onSoundToggle}
                    className={`px-3 py-1.5 text-xs font-bold rounded border transition-all ${
                      soundEnabled
                        ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {soundEnabled ? 'ENABLED' : 'MUTED'}
                  </button>
                </div>

                {/* HUD Header Collapse */}
                <div
                  id="ui-hud-collapse"
                  className={`relative bg-zinc-900/70 border p-4 rounded-xl flex items-center justify-between transition-all ${
                    searchedElement?.id === 'ui-hud-collapse' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                  }`}
                >
                  <SearchedTooltip elementId="ui-hud-collapse" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                      <Monitor size={16} style={{ color: theme.fg }} />
                      HUD Floating Window
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      {isHeaderCollapsed ? 'Collapsed to mini header' : 'Expanded with full map metrics'}
                    </p>
                  </div>
                  <button
                    onClick={onHeaderCollapseToggle}
                    className="px-3 py-1.5 text-xs font-bold rounded border bg-zinc-800 border-zinc-700 text-white hover:border-zinc-500"
                  >
                    {isHeaderCollapsed ? 'EXPAND' : 'COLLAPSE'}
                  </button>
                </div>
              </div>

              {/* Standalone HTML File Exporter */}
              <div
                id="ui-export-standalone"
                className={`relative bg-zinc-900/50 border rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
                  searchedElement?.id === 'ui-export-standalone' ? 'ring-2 ring-amber-400 border-amber-400' : 'border-zinc-800'
                }`}
              >
                <SearchedTooltip elementId="ui-export-standalone" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Download size={16} style={{ color: theme.fg }} />
                    Export Standalone Offline Single-File HTML
                  </h4>
                  <p className="text-xs text-zinc-400 mt-1">
                    Bundles the entire 3D sprite renderer, mountain mesh builder, and 8x8 tile atlas into a single downloadable .html file that runs anywhere without dependencies.
                  </p>
                </div>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg border whitespace-nowrap active:scale-95 transition-all"
                  style={{
                    backgroundColor: theme.fg,
                    color: '#000',
                    borderColor: theme.fg,
                    boxShadow: `0 0 15px ${theme.fg}44`,
                  }}
                >
                  <Download size={16} />
                  <span>Download Standalone .HTML</span>
                </button>
              </div>

              {/* Reset to Defaults */}
              <div className="pt-4 border-t border-zinc-800 flex justify-end">
                <button
                  id="ui-reset-defaults"
                  onClick={() => {
                    if (confirm('Are you sure you want to reset all preferences to defaults?')) {
                      if (soundEnabled) playTerminalBeep(700, 0.08);
                      onResetSettings();
                    }
                  }}
                  className={`relative flex items-center gap-2 px-4 py-2 text-xs font-bold rounded border transition-all border-red-900/60 bg-red-950/30 text-red-400 hover:bg-red-900/50 hover:text-red-200 ${
                    searchedElement?.id === 'ui-reset-defaults' ? 'ring-2 ring-amber-400 border-amber-400' : ''
                  }`}
                >
                  <SearchedTooltip elementId="ui-reset-defaults" activeElement={searchedElement} onClose={() => setSearchedElement(null)} theme={theme} />
                  <Trash2 size={14} />
                  <span>Reset All Settings to Defaults</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-6 py-3 border-t border-zinc-800/80 bg-zinc-950 flex items-center justify-between text-[11px] text-zinc-500">
          <span>SPRITEDUNG v{GAME_VERSION} // 8x8 Low-Poly Engine</span>
          <div className="flex items-center gap-2">
            <span>Press <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-300 font-bold">ESC</kbd> to exit menu</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PauseScreen = React.memo(PauseScreenComponent);

export default PauseScreen;
