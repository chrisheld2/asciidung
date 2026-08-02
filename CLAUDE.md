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
npm run perf      # Build, then assert the rendering budgets in scripts/perf-budgets.json
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

- **`TilePoolManager.ts`** - Shared GPU resource cache (singleton, ref-counted):
  - Caches geometry templates, materials, atlas textures and tree models across rebuilds
  - `get*` returns SHARED resources - never mutate them or attach per-world instance
    attributes to them (that orphans a GPU buffer on every rebuild)
  - `create*` returns geometry the caller owns and must dispose
  - Does not pool InstancedMesh objects: their `instanceMatrix` is sized to the exact
    instance count, so a recycled mesh would need reallocating anyway

- **`FrustumCuller.ts`** - Visibility culling:
  - Frustum-based visibility checks to skip off-screen geometry
  - Chunk size scales with world size (min 64) so chunk count stays bounded; every
    chunk costs at least one draw call per content type it holds

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

3. **Shared Resource Cache** - TilePoolManager caches geometry, materials and textures across world rebuilds.

4. **Instanced Rendering** - Batches identical tiles into single draw call via THREE.InstancedMesh. The
   default 64x64 world renders in ~10 draw calls. `npm run perf` enforces this; see scripts/perf-budgets.json.

5. **3D vs. 2D Trees** - `use3DSpriteTrees` setting allows toggling expensive 3D tree geometry for performance tuning.

6. **Alpha cutout, never alpha blend** - Foliage materials must keep `transparent: false` with `alphaTest`
   set. `transparent: true` combined with `side: DoubleSide` makes Three.js draw every mesh twice and
   disables early-Z; it previously accounted for 55 of 115 draw calls.

7. **Split terrain batches** - Ground tiles whose four neighbours are at least as tall render as a 2-triangle
   top quad (`BatchedTerrainFlat`); only tiles with an exposed side use the 12-triangle box (`BatchedTerrainSolid`).

8. **Per-instance colour needs `instanceColor`, not `vertexColors`** - `vertexColors: true` makes the shader
   multiply by a `color` VERTEX attribute; on geometry without one WebGL supplies (0,0,0) and everything
   renders black. `setColorAt` works on its own.

9. **World size is dynamic** - Nothing in `TileRenderer` may assume 64x64. Buffers size from
   `tileEngine.rows/cols`, and `mesh.count` must never exceed `instanceMatrix.count`.

10. **Rebuild only for geometry changes** - Theme changes go through `applyTheme()`; only the WorldSpec and
    `spritePack` trigger a rebuild. Building is chunk-incremental and time-budgeted (8 ms in `buildWorld`, then
    4 ms per frame), so a large world streams in rather than freezing.

11. **World generation runs on a worker** - `utils/worldGenClient.ts` posts to `worldGen.worker.ts` and gets
    transferred typed arrays back. Keep `spriteDefs.ts`, `worldGen.ts` and `worldPayload.ts` free of Three.js
    and DOM references, or the worker bundle gains a second copy of Three.js.

12. **Entities are typed-array columns** - `game/EntityStore.ts` is structure-of-arrays with generation-tagged
    handles; `game/UpdateScheduler.ts` updates them at a rate that falls off with distance; `game/EntityRenderer.ts`
    draws each visual type in one instanced billboard call. 10,000 entities cost 1 draw call.

## Development Notes

- **Environment Variables**:
  - `PORT` - Overrides default 3000 port
  - `DISABLE_HMR` - Set to `'true'` to disable file watching (used in AI Studio)

- **Settings Persistence**: User preferences stored in localStorage under `spritedung_user_settings_v1` and `spritedung_camera_position_v3` keys. Settings include camera position per projection mode, theme, sprite pack, time state, etc.

- **Assets**: `public/` is shipped to the browser verbatim - only put runtime-sized assets there.
  Source masters live in `art/` and are excluded from the build. The adventurer billboard renders
  ~30 px on screen, so its runtime texture is 256x256, not the 1254x1254 master.

- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` plugin. Base styles in `src/index.css`.

- **Build Output**: Vite outputs to `dist/` for production. Includes tree-shaking and minification.

## Running on Replit

`.replit` config pre-installs dependencies and runs `npm run dev`. Port is auto-detected from `PORT` env var.
