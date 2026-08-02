import React, { useState, useEffect, useRef } from 'react';
import { SpritePackType, ColorTheme } from '../types';
import {
  SPRITE_PACKS,
  SPRITE_DEFS,
  EXTRA_SPRITE_DEFS,
  generateSpriteAtlasCanvas,
  renderSpriteToCanvas,
  playTerminalBeep,
} from '../utils/sprites';
import {
  Layers,
  X,
  Download,
  Grid,
  Search,
  Check,
  Eye,
  Info,
  Sparkles,
  ChevronRight,
  Palette,
} from 'lucide-react';

interface SpriteAtlasModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ColorTheme;
  activeSpritePack: SpritePackType;
  onSpritePackChange: (pack: SpritePackType) => void;
  soundEnabled?: boolean;
}

interface ItemSprite {
  id: string;
  name: string;
  category: string;
  spriteIndex: number;
  x: number;
  y: number;
  defaultHeight: number;
  pixels: number[][];
  isVariant?: boolean;
}

export const SpriteAtlasModal: React.FC<SpriteAtlasModalProps> = ({
  isOpen,
  onClose,
  theme,
  activeSpritePack,
  onSpritePackChange,
  soundEnabled = true,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectSprite, setInspectSprite] = useState<ItemSprite | null>(null);
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);

  const atlasCanvasRef = useRef<HTMLCanvasElement>(null);

  // Combine standard and extra sprite definitions
  const allSprites: ItemSprite[] = React.useMemo(() => {
    const list: ItemSprite[] = Object.values(SPRITE_DEFS).map((s) => ({
      ...s,
      isVariant: false,
    }));

    EXTRA_SPRITE_DEFS.forEach((e, idx) => {
      list.push({
        id: `grass_var_${idx + 1}`,
        name: `Grass Variant ${idx + 1}`,
        category: 'terrain',
        spriteIndex: e.spriteIndex,
        x: e.x,
        y: e.y,
        defaultHeight: 0.1,
        pixels: e.pixels,
        isVariant: true,
      });
    });

    return list;
  }, []);

  // Filtered sprites based on category and search query
  const filteredSprites = React.useMemo(() => {
    return allSprites.filter((s) => {
      const matchesCat =
        selectedCategory === 'all' ||
        (selectedCategory === 'variants' ? s.isVariant : s.category === selectedCategory);
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [allSprites, selectedCategory, searchQuery]);

  // Render main 128x128 Tile Atlas canvas onto modal element
  useEffect(() => {
    if (!isOpen || !atlasCanvasRef.current) return;

    const atlasCanvas = generateSpriteAtlasCanvas(activeSpritePack);
    const ctx = atlasCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 256, 256);
      ctx.drawImage(atlasCanvas, 0, 0, 256, 256);
    }
  }, [isOpen, activeSpritePack]);

  if (!isOpen) return null;

  const currentPack =
    SPRITE_PACKS.find((p) => p.id === activeSpritePack) || SPRITE_PACKS[0];

  // Tile lookup by grid (x, y)
  const tileAtHover = hoveredTile
    ? allSprites.find((s) => s.x === hoveredTile.x && s.y === hoveredTile.y)
    : null;

  const handleDownloadAtlas = () => {
    if (soundEnabled) playTerminalBeep(1400, 0.05);
    const canvas = generateSpriteAtlasCanvas(activeSpritePack);
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `tile_atlas_${activeSpritePack}_128x128.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.floor((x / rect.width) * 16);
    const gridY = Math.floor((y / rect.height) * 16);

    if (gridX >= 0 && gridX < 16 && gridY >= 0 && gridY < 16) {
      if (!hoveredTile || hoveredTile.x !== gridX || hoveredTile.y !== gridY) {
        setHoveredTile({ x: gridX, y: gridY });
      }
    }
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md select-none font-mono">
      <div
        className="relative w-full max-w-5xl max-h-[92vh] bg-zinc-950 border rounded-xl shadow-2xl flex flex-col overflow-hidden text-zinc-200"
        style={{
          borderColor: theme.fg,
          boxShadow: `0 0 35px ${theme.fg}33, inset 0 0 15px ${theme.fg}11`,
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b bg-zinc-900/90"
          style={{ borderColor: `${theme.fg}44` }}
        >
          <div className="flex items-center gap-3">
            <Layers size={20} style={{ color: theme.fg }} />
            <div>
              <h2
                className="text-base sm:text-lg font-bold tracking-wider uppercase flex items-center gap-2"
                style={{ color: theme.fg }}
              >
                UNIFIED 8x8 TILE ATLAS & SPRITE PALETTE
              </h2>
              <p className="text-[10px] sm:text-xs text-zinc-400">
                128x128 Pixel Atlas • {allSprites.length} 8x8 Tiles • Single-Draw-Call GPU Batching
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadAtlas}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer"
              title="Download 128x128 PNG Tile Atlas Texture"
            >
              <Download size={14} style={{ color: theme.fg }} />
              <span className="hidden sm:inline">Export Atlas PNG</span>
            </button>

            <button
              onClick={() => {
                if (soundEnabled) playTerminalBeep(900, 0.03);
                onClose();
              }}
              className="p-1.5 text-zinc-400 hover:text-white bg-zinc-900 rounded border border-zinc-800 hover:border-zinc-600 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Sprite Pack Selector Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-zinc-900/50 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Palette size={14} className="text-amber-400" />
            <span className="font-bold text-zinc-300">Active Sprite Pack:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {SPRITE_PACKS.map((pack) => {
              const isSelected = activeSpritePack === pack.id;
              return (
                <button
                  key={pack.id}
                  onClick={() => {
                    if (soundEnabled) playTerminalBeep(1100, 0.03);
                    onSpritePackChange(pack.id);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-800 text-white border-2'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                  style={{
                    borderColor: isSelected ? theme.fg : undefined,
                    boxShadow: isSelected ? `0 0 8px ${theme.fg}44` : undefined,
                  }}
                >
                  {pack.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Body: Left Atlas Canvas & Right Sprite Library */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (5 Cols): Live 128x128 Tile Atlas Viewer */}
          <div className="lg:col-span-5 space-y-4 flex flex-col items-center">
            <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col items-center space-y-3">
              <div className="flex items-center justify-between w-full text-xs font-bold">
                <span className="text-zinc-300 flex items-center gap-1.5">
                  <Grid size={14} style={{ color: theme.fg }} />
                  128x128 Atlas Grid (16x16 Sprites)
                </span>
                <span className="text-zinc-500 font-mono text-[10px]">256x256 Preview</span>
              </div>

              {/* Interactive Canvas Container */}
              <div className="relative border-2 border-zinc-700 rounded-lg overflow-hidden bg-black shadow-2xl group cursor-crosshair">
                <canvas
                  ref={atlasCanvasRef}
                  width={256}
                  height={256}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={() => setHoveredTile(null)}
                  className="block w-[256px] h-[256px]"
                  style={{ imageRendering: 'pixelated' }}
                />

                {/* Grid Overlay Box */}
                {hoveredTile && (
                  <div
                    className="absolute pointer-events-none border-2 border-amber-400 bg-amber-400/20 shadow-lg transition-all"
                    style={{
                      left: `${hoveredTile.x * 16}px`,
                      top: `${hoveredTile.y * 16}px`,
                      width: '16px',
                      height: '16px',
                    }}
                  />
                )}
              </div>

              {/* Hover Tile Inspector Card */}
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs space-y-1">
                {hoveredTile ? (
                  <>
                    <div className="flex items-center justify-between text-amber-400 font-bold">
                      <span>Tile Grid ({hoveredTile.x}, {hoveredTile.y})</span>
                      <span className="text-[10px] text-zinc-500">Index #{hoveredTile.y * 16 + hoveredTile.x}</span>
                    </div>
                    {tileAtHover ? (
                      <div className="text-zinc-200">
                        <div className="font-bold text-white text-sm">{tileAtHover.name}</div>
                        <div className="text-[10px] text-zinc-400 capitalize">
                          Category: {tileAtHover.category} • Height: {tileAtHover.defaultHeight}
                        </div>
                      </div>
                    ) : (
                      <div className="text-zinc-500 italic text-[11px]">Empty / Unused Atlas Slot</div>
                    )}
                  </>
                ) : (
                  <div className="text-zinc-500 text-[11px] text-center py-1">
                    Hover cursor over any tile in the atlas above to inspect
                  </div>
                )}
              </div>
            </div>

            {/* Active Color Palette Breakdown */}
            <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase text-zinc-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-sky-400" /> Palette Colors ({currentPack.name})
              </h3>
              <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                {Object.entries(currentPack.colors).map(([key, hex]) => (
                  <div
                    key={key}
                    className="bg-zinc-950 p-1.5 rounded border border-zinc-800 flex items-center gap-1.5"
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-black/40 flex-shrink-0"
                      style={{ backgroundColor: hex }}
                    />
                    <div className="overflow-hidden">
                      <div className="font-bold text-zinc-300 uppercase">{key}</div>
                      <div className="text-zinc-500 font-mono text-[9px] truncate">{hex}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column (7 Cols): Sprite Library Search & Cards */}
          <div className="lg:col-span-7 space-y-4">
            {/* Search & Category Filter Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
              {/* Category Pills */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-[11px]">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'nature', label: 'Nature' },
                  { id: 'dungeon', label: 'Dungeon' },
                  { id: 'terrain', label: 'Terrain' },
                  { id: 'special', label: 'Special' },
                  { id: 'variants', label: 'Variants' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      if (soundEnabled) playTerminalBeep(1000, 0.02);
                      setSelectedCategory(cat.id);
                    }}
                    className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat.id
                        ? 'bg-zinc-800 text-white border border-zinc-600'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                    style={{
                      color: selectedCategory === cat.id ? theme.fg : undefined,
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative flex items-center">
                <Search size={14} className="absolute left-2.5 text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search sprites..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 w-full sm:w-36"
                />
              </div>
            </div>

            {/* Sprite Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
              {filteredSprites.map((sprite) => (
                <SpriteCard
                  key={sprite.id}
                  sprite={sprite}
                  activeSpritePack={activeSpritePack}
                  theme={theme}
                  onClick={() => {
                    if (soundEnabled) playTerminalBeep(1200, 0.03);
                    setInspectSprite(sprite);
                  }}
                />
              ))}

              {filteredSprites.length === 0 && (
                <div className="col-span-full py-12 text-center text-zinc-500 text-xs">
                  No sprites found matching category & search criteria.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400">
          <div>
            Showing <strong className="text-white">{filteredSprites.length}</strong> of{' '}
            <strong className="text-white">{allSprites.length}</strong> total sprites
          </div>

          <button
            onClick={() => {
              if (soundEnabled) playTerminalBeep(900, 0.03);
              onClose();
            }}
            className="px-4 py-1.5 font-bold rounded bg-zinc-800 hover:bg-zinc-700 text-white cursor-pointer"
          >
            Close Atlas
          </button>
        </div>
      </div>

      {/* Enlarged Single Sprite Inspector Modal Overlay */}
      {inspectSprite && (
        <div className="pointer-events-auto fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-5 max-w-md w-full text-zinc-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Info size={18} style={{ color: theme.fg }} />
                <h3 className="text-sm font-bold text-white uppercase">{inspectSprite.name}</h3>
              </div>
              <button
                onClick={() => setInspectSprite(null)}
                className="text-zinc-400 hover:text-white p-1 bg-zinc-900 rounded"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scaled-up 8x8 Canvas View */}
            <div className="flex justify-center py-2">
              <SpritePixelGrid
                pixels={inspectSprite.pixels}
                packId={activeSpritePack}
                scale={16}
              />
            </div>

            {/* Metadata Table */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-900 p-3 rounded-lg border border-zinc-800">
              <div>
                <span className="text-zinc-500">Sprite ID:</span>{' '}
                <span className="font-bold text-white font-mono">{inspectSprite.id}</span>
              </div>
              <div>
                <span className="text-zinc-500">Category:</span>{' '}
                <span className="font-bold text-amber-400 capitalize">{inspectSprite.category}</span>
              </div>
              <div>
                <span className="text-zinc-500">Grid Position:</span>{' '}
                <span className="font-bold text-sky-400 font-mono">({inspectSprite.x}, {inspectSprite.y})</span>
              </div>
              <div>
                <span className="text-zinc-500">Atlas Index:</span>{' '}
                <span className="font-bold text-purple-400 font-mono">#{inspectSprite.spriteIndex}</span>
              </div>
              <div>
                <span className="text-zinc-500">Default Height:</span>{' '}
                <span className="font-bold text-emerald-400">{inspectSprite.defaultHeight}m</span>
              </div>
              <div>
                <span className="text-zinc-500">Is Variant:</span>{' '}
                <span className="font-bold text-white">{inspectSprite.isVariant ? 'Yes' : 'No'}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectSprite(null)}
                className="px-4 py-1.5 text-xs font-bold rounded bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Component: Individual Sprite Card
const SpriteCard: React.FC<{
  sprite: ItemSprite;
  activeSpritePack: SpritePackType;
  theme: ColorTheme;
  onClick: () => void;
}> = ({ sprite, activeSpritePack, theme, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderSpriteToCanvas(sprite.pixels, activeSpritePack, canvasRef.current, 4);
    }
  }, [sprite.pixels, activeSpritePack]);

  return (
    <div
      onClick={onClick}
      className="bg-zinc-900/90 border border-zinc-800 hover:border-zinc-600 rounded-lg p-2.5 flex items-center gap-3 transition-all hover:bg-zinc-800/80 cursor-pointer group shadow-sm"
    >
      {/* Actual 8x8 Canvas Render (32x32px element) */}
      <div className="w-8 h-8 bg-black rounded border border-zinc-700/80 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-inner group-hover:border-zinc-500">
        <canvas
          ref={canvasRef}
          width={32}
          height={32}
          className="w-8 h-8 block"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      <div className="overflow-hidden flex-1">
        <div className="font-bold text-white text-[11px] truncate group-hover:text-amber-300 transition-colors">
          {sprite.name}
        </div>
        <div className="text-[9px] text-zinc-400 flex items-center gap-1 capitalize mt-0.5">
          <span>{sprite.category}</span>
          <span>•</span>
          <span>H:{sprite.defaultHeight}</span>
        </div>
      </div>
    </div>
  );
};

// Helper Component: Scaled-up Interactive Pixel Grid
const SpritePixelGrid: React.FC<{
  pixels: number[][];
  packId: SpritePackType;
  scale: number;
}> = ({ pixels, packId, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderSpriteToCanvas(pixels, packId, canvasRef.current, scale / 8);
    }
  }, [pixels, packId, scale]);

  return (
    <div className="border-2 border-zinc-700 rounded-lg overflow-hidden bg-black shadow-xl">
      <canvas
        ref={canvasRef}
        width={8 * (scale / 8) * 8}
        height={8 * (scale / 8) * 8}
        className="block"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};

export default SpriteAtlasModal;
