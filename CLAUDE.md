# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**asciidung** is an ASCII/sprite-based dungeon crawler game built with React, Three.js, TypeScript, and Vite. The project combines 2D sprite rendering with 3D camera control and lighting, featuring procedurally generated worlds with different visual themes and a day/night cycle system.

## Common Commands

```bash
npm run dev       # Start dev server on port 3000 (or $PORT if set)
npm run build     # Build for production (generates dist/)
npm run preview   # Preview the production build locally
npm run lint      # TypeScript type checking (no emits)
npm run clean     # Remove dist/ and server.js
```

**Development server** uses Vite with HMR enabled by default. The server runs on `http://localhost:3000` locally or respects the `PORT` environment variable (for Replit deployments). File watching is disabled when `DISABLE_HMR=true` to prevent flickering during agent edits.

## Architecture

### Core App Structure

**`src/App.tsx`** - Main React component managing global state:
- World grid generation (64x64 by default) with seed-based generation
- Color theme and sprite pack selection (retro, emerald, dungeon, cyber, blood, gold)
- Camera presets (isometric, topdown, side, firstperson)
- Day/night cycle state with manual time control
- Settings persistence to localStorage
- UI state (HUD collapsed, pause screen, etc.)

### Rendering Pipeline

Three core rendering modules in `src/rendering/`:

- **`TileRenderer.ts`** (37KB) - Main Three.js rendering engine:
  - Manages camera, controls, scene setup
  - Light management (realtime vs. fake lighting)
  - Instanced rendering for large numbers of tiles
  - Tree/mountain mesh rendering with LOD
  - Frustum culling via FrustumCuller
  - Handles mouse interactions and camera panning

- **`TileData.ts`** - World data structure and indexing:
  - BLOCK_TYPES_LIST maps tile types to 8-bit integer IDs for efficient typed-array access
  - Maze statistics tracking (tile counts, water, trees, etc.)
  - Light emitter management for day/night lighting

- **`TilePoolManager.ts`** - Object pooling for memory efficiency:
  - Reuses THREE.InstancedMesh geometries and materials
  - Manages batch rendering of similar tiles
  - Reduces garbage collection pressure during render loops

- **`FrustumCuller.ts`** - Visibility culling:
  - Frustum-based visibility checks to skip off-screen geometry

### UI Components

- **`ASCIIMazeCanvas.tsx`** - Integrates TileRenderer with React; handles canvas lifecycle and props updates
- **`HUDControls.tsx`** - Heads-up display showing stats and control hints
- **`PauseScreen.tsx`** - Menu interface with tabs for metrics, day/night, visuals, camera, audio
- **`FPSCounter.tsx`** - Real-time performance monitoring
- **`SpriteAtlasModal.tsx`** - Sprite browser/debug tool

### Utility Modules

**`src/utils/sprites.ts`** (40KB) - Sprite and world generation core:
- COLOR_THEMES - 6+ visual themes with fg/bg/lighting colors
- SPRITE_PACKS - Asset definitions for each visual style
- SPRITE_DEFS - 28+ block types (grass, trees, mountains, water, dungeon features, etc.)
- `generateNaturalWorld()` - Seed-based procedural world generation
- `playTerminalBeep()` - Audio feedback

**`src/utils/mountainMesh.ts`** - Terrain geometry:
- Builds unified mountain mesh groups from world grid
- Procedural mountain height maps

**`src/utils/treeModels.ts`** (18KB) - 3D tree generation:
- Procedurally generates oak and pine tree geometry
- Tree type toggleable via `setUse3DSpriteTrees()`

### Type System

**`src/types.ts`** defines core interfaces:
- `WorldCell` - Grid element (type, sprite, height, name)
- `ColorTheme` - Visual styling (fg, bg, light, ambient, accent colors)
- `SpritePackType` - Literal union of sprite pack IDs
- `BlockTypeID` - Literal union of 28+ terrain/dungeon block types
- `CameraPreset` - Camera view modes
- `DayNightState` - Time tracking (minutes, locked state, turn increments)
- `LightEmitter` - Point light definition (position, color, intensity, distance)
- `RenderMetrics` - Performance stats (fps, drawCalls, triangles, geometries, textures)

## Performance Considerations

1. **Zero-Allocation Render Loop** - `TileRenderer.ts` reuses temporary Vector3, Matrix4, Quaternion, Color objects to avoid GC pressure during render.

2. **Frustum Culling** - FrustumCuller filters out-of-view tiles before rendering.

3. **Object Pooling** - TilePoolManager recycles THREE.InstancedMesh to reduce mesh creation overhead.

4. **Instanced Rendering** - Batches identical tiles into single draw call via THREE.InstancedMesh.

5. **3D vs. 2D Trees** - `use3DSpriteTrees` setting allows toggling expensive 3D tree geometry for performance tuning.

## Development Notes

- **Environment Variables**:
  - `GEMINI_API_KEY` - Required for Gemini API calls (set in `.env.local`)
  - `PORT` - Overrides default 3000 port
  - `DISABLE_HMR` - Set to `'true'` to disable file watching (used in AI Studio)

- **Settings Persistence**: User preferences stored in localStorage under `spritedung_user_settings_v1` and `spritedung_camera_position_v3` keys. Settings include camera position per projection mode, theme, sprite pack, time state, etc.

- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` plugin. Base styles in `src/index.css`.

- **Build Output**: Vite outputs to `dist/` for production. Includes tree-shaking and minification.

## Running on Replit

`.replit` config pre-installs dependencies and runs `npm run dev`. Port is auto-detected from `PORT` env var.
