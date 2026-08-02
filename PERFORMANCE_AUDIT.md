# asciidung — Performance, Rendering, Memory & Architecture Audit

> **Status: most findings implemented on branch `perf-optimizations`.**
> See [§11 Implementation Results](#11-implementation-results) for measured before/after
> and the list of what was deliberately left undone. The body of this report below
> describes the code **as audited**, before those changes.

---


**Date:** 2026-08-02 · **Branch:** `optimize-1` @ `f6e064e` · **Reviewer:** Principal Engine/Graphics/Perf review
**Codebase:** 8,077 LOC TypeScript across 16 files · React 19 + **raw Three.js r185** (no React Three Fiber)

---

## 0. Methodology & how to read the numbers

Everything marked **[measured]** was obtained by instrumenting the running application, not by inspection:

- Dev build served locally, Chromium/Apple Silicon, canvas **1280×720 @ DPR 1**, default world (64×64), default isometric ortho camera framing the entire map.
- `WebGL2RenderingContext.prototype` was patched to count `drawElements*`/`drawArrays*`/`createBuffer`/`deleteBuffer`/`createTexture`/`deleteTexture`.
- The live `TileRenderer` instance was extracted from the React fiber tree and `updateFrame()` was driven manually in tight loops (the headless preview pane throttles `requestAnimationFrame` to zero).

**Important caveat on the `ms` figures.** Driving `updateFrame()` manually measures **CPU time**: scene traversal, render-list construction, uniform/attribute upload, and the JS side of the GL driver. It does **not** measure GPU execution (fill rate, overdraw, blending, shadow rasterisation). So:

- Draw-call, triangle, instance, buffer and byte counts are **exact**.
- `ms` deltas are **real CPU wins** and are a floor, not a ceiling — the fixes below also remove GPU work that these numbers do not capture.
- I could not measure end-to-end FPS in this environment. Nothing in this report claims a measured FPS. Where I give an FPS-shaped estimate it is labelled as an estimate and derived from the exact counts.

**Measured baseline (64×64, the shipping default):**

| Metric | Value |
|---|---|
| Draw calls / frame (colour pass) | **115** |
| Triangles / frame | **81,984** |
| CPU time in `updateFrame()` | **1.34 – 1.51 ms** |
| Shadow pass, when it refreshes | **+56 calls, +20,328 tris** |
| Terrain instances | 3,633 (1 mesh, 2 material groups) |
| Tree instances | 2,257 across **55** separate `InstancedMesh`es |
| Mountain mesh | 2,272 tris, 1 mesh |
| Light emitters | 77 (6-light forward pool) |
| Shader programs | 9 |
| `buildWorld()` | **14.5 ms** median, 34 ms cold |
| `pointermove` handler | **0.91 ms per event** |
| JS heap at rest | ~17–20 MB |

---

## 1. Executive Summary

### Scores

| Dimension | Score | One-line justification |
|---|---|---|
| **Overall Performance** | **5 / 10** | Comfortable at 64×64 on a modern GPU, but ~48% of draw calls are pure waste from a one-word material bug, and the frame loop runs flat-out for a turn-based game. |
| **Rendering** | **4 / 10** | Genuinely good ideas (GPU atlas indexing, index-reordered box, unified mountain mesh) undermined by a two-pass transparency bug, chunk×type mesh explosion, a shadow pass nothing receives, and zero LOD. |
| **Memory** | **5 / 10** | Typed-array tile store and shared caches are right; but a **proven GL buffer leak on every world rebuild**, incomplete `dispose()`, 4.1 MB of dead PNGs shipped, and a 1254×1254 texture for a ~30 px sprite. |
| **Architecture** | **4 / 10** | Clean file boundaries, but two parallel world representations (only the slow one is used at build time), a "pool manager" that pools nothing, and dead state driving 14 ms of work. |
| **Scalability** | **2 / 10** | **Hard blocker.** The renderer silently corrupts data and draws garbage at any world size other than 64×64. Verified at 256×256. |

### Top 10 Performance Risks (ranked by severity)

| # | Risk | Evidence |
|---|---|---|
| 1 | **Foliage materials set `transparent: true` alongside `side: DoubleSide`**, triggering Three.js' two-pass double-sided transparent path. Every tree mesh is drawn **twice**, with blending on and early-Z disabled. | **[measured]** Setting `transparent:false` (alphaTest already present): **115 → 60 draw calls**, 81,984 → 63,928 tris, **1.34 ms → 0.16 ms CPU**. Visually identical. |
| 2 | **Hardcoded 64×64 assumptions** in `TileRenderer` silently drop data and issue instanced draws with no backing buffer at any other size. | **[measured]** At 256×256: **61,440 of 65,536 tile heights silently discarded**; `lightTintMesh.count = 65,536` against a **4,096-entry** matrix buffer. |
| 3 | **Tree geometry split by chunk × type → 55 meshes** (880 at 256×256) for 4 materials. | **[measured]** Merging to 4 meshes: **60 → 9 draw calls**, 0.335 ms → 0.138 ms. Combined with #1: **115 → 9 (−92%)**. |
| 4 | **`buildWorld()` is a synchronous full-world rebuild** on the main thread, triggered by ordinary UI interaction including a **slider drag**. | **[measured]** 14.5 ms @ 64² (≈1 dropped frame per drag step); **248 ms @ 256²**. |
| 5 | **GL buffer leaked on every world rebuild** — `instanceSpriteIndex` is written onto the *shared, cached, never-disposed* block geometry. | **[measured]** 20 rebuilds → 1,280 buffers created, 1,260 deleted: **exactly 1 leaked per rebuild**, unbounded. |
| 6 | **`pointermove` raycasts the whole world**, unthrottled, allocating per event, scaling linearly with instance count. | **[measured]** **0.91 ms/event**; ~0.008 ms of that is matrix updates — the rest is raycast. GC observed firing mid-sweep. |
| 7 | **4.1 MB of dead/oversized image assets shipped**; the one texture actually used is **1254×1254 (474 KB, ~6.3 MB VRAM)** for a billboard ~30 px tall. | **[measured]** `sips` dimensions + `dist/` contents; only `adventurer-2d.png` is referenced anywhere. |
| 8 | **Shadow pass casts from 55 meshes onto almost nothing** — `BatchedTerrain` and the floor both have `receiveShadow = false`. Only the mountain mesh receives. | **[measured]** 56 shadow casters, +56 calls / +20,328 tris per refresh, for shadows on ~3% of visible surface. |
| 9 | **"Fake" (cheap) lighting mode is more expensive than the real-time lighting it replaces**, and adds a full-map transparent overdraw layer. | **[measured]** 0.421 ms vs **0.189 ms** realtime; 4,096 `DoubleSide` + `depthWrite:false` quads; 98,304 CPU distance tests per update. |
| 10 | **Always-on `requestAnimationFrame` render loop** in a turn-based game with a static world; no render-on-demand, no damage tracking. | `ASCIIMazeCanvas.tsx:376-420` — full scene re-render every frame even when nothing has changed. |

### The headline

> **A single-word change on four materials removes 55 draw calls (48%) and 88% of measured CPU frame time. Merging the tree meshes removes 51 more. Together: 115 → 9 draw calls.**

Note the irony worth naming: the *legacy* tree models in `treeModels.ts` (lines 369-378, 456-465, 517-525, 596-604) correctly use `transparent: false, alphaTest: 0.5`. The newer "lightweight optimised sprite" path that replaced them (lines 147-156, 185-194, 226-234, 266-274) got it wrong. The optimisation made rendering slower.

---

## 2. Findings Table

Severity: **Critical** = blocks the stated targets or corrupts state · **High** = large measurable cost · **Medium** = real cost or clear risk · **Low** = hygiene.

| Sev | Category | Location | Problem | Impact | Recommendation |
|---|---|---|---|---|---|
| **Critical** | Rendering / Material | `utils/treeModels.ts:149-155`, `187-193`, `228-233`, `268-273` | `transparent: true` + `alphaTest: 0.15` + `side: DoubleSide`. Three.js renders double-sided **transparent** materials in two passes (back faces, then front). `transparent` is unnecessary — `alphaTest` alone does hard cutout, which is what pixel-art foliage needs. | **[measured]** 55 duplicate draw calls; +18,056 tris; **1.18 ms CPU/frame**. Also forfeits early-Z, forces back-to-front sort, enables blending, and pushes foliage into the transparent queue where it cannot be occlusion-rejected. | Set `transparent: false` on all four sprite-tree materials. Keep `alphaTest`. Verified visually identical (screenshot-compared). **One-line fix, highest ROI in the repo.** |
| **Critical** | Scalability / Correctness | `rendering/TileRenderer.ts:94` (`new Float32Array(4096)`), `:247` (`lightTintMesh`, 4096), `:555` (`r * 64 + c`), `:560-561` (`c - 31.5`, `r - 31.5`), `:620-621` (`r < 64`, `c < 64`) | World dimensions are hardcoded to 64×64 in six places while `TileDataEngine` correctly reallocates for any size. | **[measured @ 256²]** 61,440 height writes silently dropped (`Float32Array` ignores OOB writes — no error); `lightTintMesh.count` set to 65,536 against a 4,096-entry `instanceMatrix` → 61,440 instances drawn from unbacked attribute reads; fake lighting silently lights only the top-left 6.25% of the map. | Derive all of these from `tileEngine.rows/cols` and `centerX/centerZ`. Size `tileHeights` and `lightTintMesh` from `totalCells`, reallocating on change. Add a dev assertion that `mesh.count <= instanceMatrix.count`. |
| **Critical** | Draw calls / Scene | `rendering/TileRenderer.ts:363-368`, `465-496` | Tree instances are bucketed by **chunk × type**, producing `chunks × 4` meshes. 16 chunks → 55 meshes; 256 chunks → **880 meshes**. | **[measured]** 51 excess draw calls @ 64² (60 → 9 when merged); at 256² this alone produces most of the 591 draw calls. | Bucket by **type first**. For 64², use 4 global meshes. For large worlds, keep chunking but put all four foliage types in **one atlas + one material** so a chunk is 1 mesh, not 4 — and set `frustumCulled = true` with real bounds instead of relying solely on group visibility. |
| **Critical** | Loading / Frame spikes | `rendering/TileRenderer.ts:301-578`; triggered from `components/ASCIIMazeCanvas.tsx:445-486` | `buildWorld()` tears down and rebuilds the entire world synchronously. Effect deps are `[worldGrid, theme, spritePack, translucencyRatio]`. | **[measured]** 14.5 ms median / 34 ms cold @ 64²; **248 ms @ 256²**. `translucencyRatio` is a `type="range"` slider (`PauseScreen.tsx:1482-1489`, step 0.02 over 0→0.8): **dragging it triggers up to 41 full world rebuilds**. | Split the rebuild: theme/light changes need only uniform updates; sprite-pack changes need only a material swap; only `worldGrid` needs geometry. Chunk the build across frames (or a worker) for large worlds. And see the next row — the slider should not rebuild anything at all. |
| **High** | Dead state / Wasted work | `rendering/TileData.ts:60-61, 113-114, 150-155` | `isTranslucentFlags` and `isRuinFlags` are computed and stored but **never read by any rendering code** (verified by full-tree grep). | The translucency slider costs a **14.5 ms world rebuild per drag step and produces zero visual change**. Two `Uint8Array(totalCells)` buffers are allocated and filled for nothing. | Either implement the translucent-wall feature the slider advertises, or delete the flags, the `translucencyRatio` prop chain (App → Canvas → TileData), and the slider. Remove `translucencyRatio` from the rebuild effect deps immediately regardless. |
| **High** | Memory / GPU leak | `rendering/TileRenderer.ts:455-458` + `rendering/TilePoolManager.ts:44-76` | `terrainGeometry.setAttribute('instanceSpriteIndex', …)` writes a per-world attribute onto the **shared cached** `BoxGeometry`. Replacing an attribute does not free the previous `WebGLBuffer`; the shared geometry is never disposed, so the orphan is never reclaimed. | **[measured]** Exactly **1 GL buffer leaked per rebuild** (1,280 created / 1,260 deleted over 20 rebuilds). ~14.5 KB per rebuild @ 64², ~262 KB @ 256². Unbounded across a long session. `renderer.info.memory` does **not** report this. | Give the terrain mesh its **own** geometry instance (cheap — clone the cached one), or explicitly `geometry.deleteAttribute('instanceSpriteIndex')` and dispose the old attribute before replacing. Never mutate a cached shared resource per-instance. |
| **High** | CPU / Input | `rendering/TileRenderer.ts:261-291`; bound at `components/ASCIIMazeCanvas.tsx:323-327` | Every `pointermove` runs `intersectObjects([worldGroup, floorMesh], true)`: forced `updateMatrixWorld(true)` ×3, a fresh `targets` array literal per call, a full recursive raycast over 3,633 terrain instances + 2,257 tree instances + a 2,272-tri mountain mesh with no BVH, then an allocated+sorted intersection array of which `[0]` is used. | **[measured]** **0.91 ms per event** (matrix updates are only 0.008 ms of it — 0.9 ms is raycast). Pointer events fire at 60–120+ Hz. At 120 Hz that is ~11% of a core spent on a cosmetic cursor light, arriving as jitter between frames. Heap shrank mid-sweep — GC firing under the churn. | Throttle to one raycast per rendered frame (store last pointer position, resolve in `updateFrame`). Hoist the `targets` array to module scope. Use `raycaster.firstHitOnly` / restrict `raycaster.layers` to a dedicated pick layer. Best: skip raycasting entirely — you have a heightfield; unproject the ray to `y = tileHeight` analytically in O(1). |
| **High** | Assets / VRAM | `public/assets/sprites/` (4 files, 4.1 MB); loaded at `rendering/TileRenderer.ts:226` | All four PNGs are **1254×1254**. Only `adventurer-2d.png` (474 KB) is referenced; `adventurer-source.png` (1.5 MB), `adventurer-2d-source.png` (1.1 MB) and `adventurer.png` (978 KB) are **shipped to `dist/` and never used**. The used one backs a billboard scaled to 0.95×1.35 world units — roughly 30 px on screen. | **[measured]** 3.6 MB of dead payload in the production build. The live texture costs ~6.3 MB VRAM decoded (~8.4 MB with mipmaps) for a ~30 px sprite — **~500× more than needed**. | Delete the three unused PNGs (or move them out of `public/`). Downscale the sprite to 64×64 or 128×128 and export as WebP/KTX2. Set `magFilter = NearestFilter` to match the pixel-art look. Load through a shared texture cache and dispose it in `dispose()`. |
| **High** | Shadows | `rendering/TileRenderer.ts:474-475` (`castShadow = true`), `TilePoolManager.ts:216-218` (`receiveShadow = false`), `TileRenderer.ts:349` (floor) | 55 tree meshes and the mountain mesh cast shadows into a 1024² map, but `BatchedTerrain` and the ground plane both have `receiveShadow = false`. **Only the mountain mesh receives shadows.** | **[measured]** +56 draw calls and +20,328 tris per shadow refresh, plus a 1024² depth rasterisation, to produce shadows on a small fraction of visible surface. Refreshes whenever the sun moves >2 units — i.e. continuously during day/night transitions. | Decide the art direction. If shadows matter: enable `receiveShadow` on terrain and floor and tighten the shadow frustum to the visible region (it is currently ±65 units — the whole map — at 1024², ≈8 texels/tile). If they do not: disable `castShadow` and `renderer.shadowMap.enabled` and reclaim the entire pass. |
| **High** | Lighting | `rendering/TileRenderer.ts:586-671`, `237-248` | "Fake" lighting is presented as the cheap option. It runs `64 × 64 × min(24, emitters)` = **98,304** distance tests per update (every 3rd frame ≈ 20×/s ⇒ ~2M/s), re-uploads 4,096 instance colours, and draws 4,096 `PlaneGeometry` instances with `transparent: true`, `opacity: 0.9`, `depthWrite: false`, `side: DoubleSide` laid over the entire map. | **[measured]** **0.421 ms/frame vs 0.189 ms for realtime** — the "cheap" mode is **2.2× more expensive on CPU**, before counting a full-map unsorted transparent overdraw layer that this CPU measurement does not capture. | Either delete the mode, or reimplement it as what it should be: bake the per-tile light value into a **vertex/instance colour attribute on the existing terrain batch** (zero extra meshes, zero extra draw calls, zero overdraw), recomputed only when emitters or time change — not on a frame counter. |
| **Medium** | Geometry | `rendering/TilePoolManager.ts:44-76`; instanced at `TileRenderer.ts:432-463` | Every terrain tile is a full 12-triangle box. For a flat field (most tiles have `height ≈ 0.1`) the four sides and the bottom are never visible. | **[measured]** 43,596 of 63,928 triangles come from terrain boxes; a top-quad-only variant is 2 tris ⇒ **7,266** (−83% of terrain geometry, −57% of total scene triangles). | Keep the box only for tiles with `height` above a threshold (walls, pillars, mountains). Use a single top quad for flat ground. Two instanced meshes, two draw calls, same as today. |
| **Medium** | Pooling / Dead code | `rendering/TilePoolManager.ts:24, 209-228, 246-254` | `acquireInstancedMesh()` unconditionally calls `new THREE.InstancedMesh(...)`. `releaseInstancedMesh()` is never called from anywhere. `instancedMeshPool` is always empty, so the disposal loop over it in `disposeAll()` is a no-op. | The class named `TilePoolManager` does not pool. Every rebuild allocates 56+ `InstancedMesh` objects and their `instanceMatrix` typed arrays — a large share of the ~2 MB of garbage per rebuild. The dead code actively misleads (`CLAUDE.md` documents pooling as an implemented optimisation). | Either implement real pooling keyed by `(geometry, material, capacity-bucket)` with `mesh.count` resizing, or rename the class to `TileResourceCache` and delete the pool members. It is a good **material/geometry cache**; that is what it should claim to be. |
| **Medium** | Lifecycle / Disposal | `rendering/TileRenderer.ts:1033-1038` | `dispose()` releases controls, the pool manager, the renderer and the DOM element — but **not**: `adventurerTexture`, `floorMesh` geometry, the fake-light `OctahedronGeometry`/`PlaneGeometry`/materials (`:230-247`), the mountain group, or the scene contents. It also calls `poolManager.disposeAll()` on a **singleton**. | Leaked GPU objects per renderer teardown. Worse: the singleton disposal means a second `TileRenderer` sharing the singleton receives disposed materials — and **React StrictMode's deliberate mount→cleanup→mount cycle exercises exactly this path in development**. | Dispose everything the renderer owns; traverse the scene and dispose geometries/materials/textures it created. Make pool disposal reference-counted, or make the pool per-renderer rather than a singleton. |
| **Medium** | React | `App.tsx:109, 111-117, 151-157, 315-317, 361-444` | `App` re-renders at least twice a second (`renderMetrics` every 500 ms, `gameTimeSeconds` every 1 s). It has **no `React.memo` anywhere in the tree** and passes ~20 freshly-allocated inline arrow props to `HUDControls` (354 LOC) and `PauseScreen` (1,796 LOC) on every render. `dayNightState` (`App.tsx:319-325`) is a new object literal every render, so the `dayNightStateRef` effect in `ASCIIMazeCanvas.tsx:229-232` re-runs every render too. | Continuous reconciliation of the entire HUD tree competing with the frame budget, plus steady allocation of ~20 closures × 2/s. Not fatal today; it is the reason the frame loop has an unpredictable neighbour. | `React.memo` on `HUDControls`, `PauseScreen`, `FPSCounter`. `useMemo` the `dayNightState` object. Move `renderMetrics` and `gameTimeSeconds` out of `App` state into a leaf component (or a ref + direct canvas write — `FPSCounter` already draws to a canvas imperatively; it just needs a ref instead of a prop). |
| **Medium** | Simulation correctness | `rendering/TileRenderer.ts:807-813` | The day/night interpolation is `this.currentVisualMinutes += diff * 0.08` — a fixed fraction **per frame**, not per second. `delta` is computed and passed but unused here. | The sun moves **twice as fast at 120 FPS as at 60 FPS**. Simulation speed is coupled to frame rate; behaviour is non-deterministic across machines and unreproducible. | Use `delta`: an exponential approach such as `1 - Math.exp(-k * delta)`, or a fixed-timestep accumulator for all simulation state. |
| **Medium** | Determinism | `rendering/TileData.ts:153` | `Math.random()` inside `loadWorldGrid()`. | Breaks seed-based reproducibility: the same seed yields different worlds across rebuilds. Blocks save/replay, deterministic tests, and multiplayer. (Currently masked by the fact that the output is never read — see the dead-state row.) | Use the existing seeded `pseudoRandom2D(r, c, seed)` from `utils/sprites.ts`. Ban `Math.random()` in world generation. |
| **Medium** | Algorithmic | `utils/mountainMesh.ts:17-66` | Cluster BFS uses `` `${r},${c}` `` string keys in `Set`s (2 string allocations per cell visit) and `queue.shift()` on a plain array — **O(n) per dequeue ⇒ O(n²) BFS**. | A large share of `buildWorld()`'s 14.5 ms, and a superlinear share of the 248 ms at 256². | Use integer keys (`r * cols + c`) with a `Uint8Array` visited mask and a `Int32Array` ring-buffer queue with a head index. Straightforward 10–50× speedup on this function. |
| **Medium** | Allocation | `utils/mountainMesh.ts:264-266, 309-311` | `positions.push(...p1, ...p2, ...p3)` — spread operators inside the per-triangle loop, plus a `[number,number,number]` tuple allocated per vertex from `getVertexPos()` and per colour from `getLowPolyMountainColor()`. | ~2,272 triangles × ~9 short-lived arrays each ≈ 20k allocations per rebuild. Contributes directly to the GC churn measured during rebuilds. | Write directly into pre-sized `Float32Array`s with a running offset. Return values via out-parameters or scratch tuples. |
| **Medium** | Storage I/O | `components/ASCIIMazeCanvas.tsx:49-96, 330-335, 347-353` | Every OrbitControls `change` event (≈60/s while auto-rotating) calls `scheduleSaveCameraState`, which does a `clearTimeout` + `setTimeout` pair. The 3 s interval save does `JSON.stringify` + `localStorage.getItem` + **full-string comparison** + `setItem`, then fires a `setState` toast → App re-render. | Synchronous localStorage on the main thread on a timer, plus 120 timer operations/second during auto-rotate, plus a periodic React re-render cascade. | Save on a `visibilitychange`/`pagehide`/idle basis only. Compare a numeric fingerprint (sum of components) instead of stringifying to compare. Drop the "Camera state saved" toast or drive it without React state. |
| **Medium** | Culling | `rendering/TilePoolManager.ts:218`, `TileRenderer.ts:235, 248, 349` | `frustumCulled = false` is set on `BatchedTerrain`, both fake-light meshes, the floor, and **every tree mesh**. The only culling in the entire renderer is `FrustumCuller` toggling `chunk.group.visible` — which covers trees only. | Terrain, mountains, floor and the 4,096-quad tint layer are submitted regardless of camera position. At 64² the whole map is on screen so this costs nothing; at 256²+ it means **no culling at all** for the majority of geometry. | Chunk the terrain batch too (one instanced mesh per chunk, or a single mesh with per-chunk index ranges). Let Three.js cull meshes with correct bounds instead of disabling it. `frustumCulled = false` should be the rare exception, not the default. |
| **Low** | Bundle | `vite.config.ts`; `package.json:16-27` | Single 921 KB JS chunk (244 KB gzip), no code splitting. `motion`, `@google/genai`, `express`, `dotenv` are declared dependencies but **imported nowhere in `src/`** (verified — they are tree-shaken out of the bundle, but they are installed and carried). | Slow first paint on cold cache; ~200 MB of unnecessary `node_modules`; supply-chain surface for four packages that do nothing. | Remove the four unused dependencies. `manualChunks` to split `three` from app code so app edits do not invalidate the 600 KB vendor chunk. Lazy-load `PauseScreen` and `SpriteAtlasModal` — neither is needed for first paint. |
| **Low** | Texture quality | `utils/sprites.ts:956-961`, `utils/treeModels.ts:70-74` | Atlas and leaf textures use `minFilter: NearestFilter` with `generateMipmaps: false`. | When the camera zooms out, minified tiles alias badly (shimmer under auto-rotate) and sample incoherently, hurting the GPU texture cache. | Keep `magFilter: NearestFilter` (that is what makes it pixel-art). Set `minFilter: NearestMipmapLinearFilter` and `generateMipmaps: true`. The atlas is 128×128 — mipmaps cost 5 KB. |
| **Low** | Renderer config | `rendering/TileRenderer.ts:145-150` | `antialias: true` on a nearest-filtered pixel-art renderer. | MSAA resolves cost bandwidth on every frame to smooth edges that the art style deliberately wants hard. | Disable MSAA and spend the bandwidth on resolution instead (raise the adaptive DPR cap). Measure both; the pixel-art look likely improves. |
| **Low** | Architecture | `types.ts:59-66`; `TileData.ts:102-213` vs `TileRenderer.ts:371-430` | Two parallel world representations: `WorldCell[][]` (one JS object + one string `type` + one string `name` per tile) and the typed-array `TileDataEngine`. `buildWorld()` reads from **`worldGrid[r][c]`** and does `cell.type.startsWith('mountain')` string comparisons in the hot build loop, using the typed arrays only for `heights`/`spriteIndices`. | 4,096 objects @ 64², 65,536 @ 256², **>1 M @ 1024²** — with per-tile string comparisons during the build. The typed-array optimisation is bypassed exactly where it would pay off. | Make `TileDataEngine` the single source of truth. Build from `blockTypeIds` integer comparisons, not `cell.type.startsWith(...)`. `WorldCell[][]` becomes a generation-time-only intermediate that is discarded after `loadWorldGrid()`. |

---

## 3. Visibility & LOD Report

| System | Current state | Issue | Recommendation | Estimated gain |
|---|---|---|---|---|
| **Frustum culling** | `FrustumCuller` (106 LOC) tests 16 chunk `Box3`s per frame and toggles `group.visible`. Zero-allocation, correct. | Covers **trees only**. Chunk bounds are `minY = -100, maxY = 250` — 350 units tall for ≤5-unit content, so chunks almost never cull in an angled view. Everything else has `frustumCulled = false`. | Tighten chunk Y bounds to actual content height. Extend chunking to terrain. Restore `frustumCulled = true` with correct bounds instead of disabling it. | 0 @ 64² (whole map visible); **large at 256²+** — currently ~0% of the 591 draw calls are cullable. |
| **Distance culling** | None. | No system for props, effects, audio, or NPCs. No `camera.far`-based fade (`far = 3000` for a 64-unit world). | Add a per-chunk distance test alongside the frustum test. Reduce `perspCamera.far` to ~500. | Low today; prerequisite for large worlds. |
| **Occlusion culling** | None. | For an isometric camera over a heightfield, mountains occlude very little. Not worth queries or portals **at this scale**. For the "dungeon" content this is heading toward, sector/portal culling becomes the right answer. | Defer. Revisit when interiors exist. Prefer a 2D sector graph over GPU occlusion queries for this camera model. | 0 now; potentially large for interiors. |
| **Scene traversal** | 14 scene children, ~59 meshes, ~11 lights. **[measured]** matrix-world updates cost 0.008 ms. | Traversal is not a bottleneck at this scale. `updateMatrixWorld(true)` (forced) is called from the pointer handler on every event, which is unnecessary. | Drop the `true` flag; let Three.js use its dirty flags. | Negligible now; keep it that way as entity counts grow. |
| **Geometry LOD** | **None.** | Trees are 8 tris — already effectively ultra-low. The real waste is not polygon density, it is 12-tri boxes for flat ground and 55 draw calls for 2,257 tiny instances. **This codebase does not need geometry LOD; it needs batching.** | Do **not** build a mesh-LOD system. Fix batching and the flat-ground geometry instead. | **[measured]** Flat-ground quads: −36,330 tris (−57% of scene). |
| **Material LOD** | None. All terrain uses one `MeshStandardMaterial` (PBR) with a custom `onBeforeCompile` atlas shader. | `MeshStandardMaterial` computes a full PBR BRDF per fragment for flat-shaded pixel art with `metalness: 0.1`. `MeshLambertMaterial` would be visually near-identical at a fraction of the fragment cost. | Prototype `MeshLambertMaterial` (or `MeshPhongMaterial`) for terrain and foliage. Keep the atlas `onBeforeCompile` — it ports directly. | Not CPU-visible; **potentially the largest un-measured GPU win**, especially on low-end integrated GPUs where this is fill-rate bound. |
| **Texture LOD** | Mipmaps **disabled** on all textures. | Aliasing and poor texture-cache coherence when minified. | Enable mipmaps with `NearestMipmapLinearFilter` for minification. | Small GPU win, visible quality win. |
| **Imposters** | Trees are already 4 intersecting billboard quads — the correct imposter form for this art style. | The implementation is right; only the material flags and mesh splitting are wrong. | No change beyond findings #1 and #3. | — |
| **Simulation LOD** | Not applicable — there is no AI, physics, or particle simulation yet. | The only per-frame simulation is the light-emitter sort and fake-lighting grid, neither of which is distance-graded. | When entities arrive, band updates by distance (near 60 Hz / mid 15 Hz / far event-driven). Build this into the entity system from day one rather than retrofitting. | N/A today. |
| **Spatial partitioning** | Uniform 16×16 chunk grid in `FrustumCuller`. | A uniform grid is the right structure for a tile world. It is simply under-used (trees only) and the chunk size is not tuned. | Keep the uniform grid. Add per-chunk emitter lists so the light selection stops scanning all 77 (1,206 @ 256²) emitters. No octree/BVH needed for a heightfield. | Removes the O(n log n) emitter sort from the frame path. |
| **World streaming** | None. Entire world is resident and rebuilt atomically. | 248 ms rebuild at 256² is already a visible freeze; 1024² would be multi-second. | Build per-chunk meshes independently so chunks can be created/destroyed individually, then load/unload by distance. This is the single largest architectural prerequisite for "significantly larger levels". | Converts a 248 ms freeze into amortised per-chunk work. |
| **Draw calls** | **[measured] 115** @ 64² · **591** @ 256². | 55 duplicated by the transparency bug; 51 more by chunk×type splitting. | Findings #1 + #3. | **[measured] 115 → 9 (−92%)**. |
| **Overdraw** | Foliage in the transparent queue (no early-Z, blending on, drawn twice); fake-light mode adds 4,096 `depthWrite:false` `DoubleSide` quads over the whole map. | The dominant GPU cost on fill-rate-limited hardware, and the one my CPU instrumentation cannot see. | Finding #1 moves foliage to the opaque queue with early-Z. Finding #9 removes the tint layer entirely. | Not measurable here; **likely the largest real-world win on low-end GPUs**. |

---

## 4. Memory & Allocation Report

### Confirmed leaks

| Leak | Location | Rate | Evidence |
|---|---|---|---|
| **`WebGLBuffer` per world rebuild** | `TileRenderer.ts:455-458` — `instanceSpriteIndex` set on the shared cached geometry | **1 buffer / rebuild**, ~14.5 KB @ 64², ~262 KB @ 256². Unbounded. | **[measured]** 20 rebuilds: 1,280 created, 1,260 deleted. Invisible to `renderer.info.memory`. |
| **Undisposed renderer-owned GPU objects** | `TileRenderer.ts:1033-1038` | Per renderer teardown: 1 texture (~6.3 MB VRAM), 3 geometries, 3 materials, mountain geometry+material. | Code inspection; `dispose()` covers only controls/pool/renderer/DOM. |
| **Singleton disposed by an instance** | `TileRenderer.dispose()` → `TilePoolManager.getInstance().disposeAll()` | Any second renderer sharing the singleton gets disposed materials. Triggered by React StrictMode in dev. | Code inspection. |

### Explicitly checked and **clean**

I ran 20 consecutive `buildWorld()` cycles with a render between each and tracked `renderer.info`:

| Metric | After 0 | After 20 | Verdict |
|---|---|---|---|
| Shader programs | 9 | **9** | No leak |
| Geometries | 8 | **8** | No leak |
| Textures | 9 | **9** | No leak |
| GL textures created/deleted | — | 0 / 0 | No leak |

The `traverse`-based teardown at `TileRenderer.ts:308-331` is doing its job for geometries and materials. Credit where due.

### GC pressure sources (ranked)

| Source | Location | Cost | Fix |
|---|---|---|---|
| **`buildWorld()` allocation storm** | `TileRenderer.ts:301-578` | ~2 MB garbage per rebuild: `terrainInstances[]` (3,633 object literals), `treeInstancesByChunk` (16 objects × 4 arrays), 56 `InstancedMesh`es + `instanceMatrix` Float32Arrays, a fresh `SpriteMaterial`, the entire mountain vertex build. **[measured]** heap oscillating ~10 MB per 5 rebuilds. | Reuse instance buffers keyed by capacity; write matrices directly into a persistent `Float32Array`; real pooling in `TilePoolManager`. |
| **Mountain mesh vertex build** | `mountainMesh.ts:195-316` | ~20k short-lived arrays per rebuild: `[number,number,number]` tuples from `getVertexPos()`/`getLowPolyMountainColor()`, spread-operator `push` calls, `` `${r},${c}` `` strings in the BFS. | Pre-sized `Float32Array` + out-params + integer keys. |
| **Pointer raycast** | `TileRenderer.ts:275-278` | A `targets` array literal **plus** a fully-populated, sorted intersection array on **every pointer event** (60–120 Hz). **[measured]** GC observed firing during a 200-move sweep. | Hoist `targets`; use `firstHitOnly`; throttle to one per frame; ideally replace with analytic heightfield intersection. |
| **Emitter sort** | `TileRenderer.ts:893` | `this.lightEmitters.sort((a, b) => …)` allocates a fresh closure whenever the camera target moves >0.5 units. Sorts 77 emitters now, **1,206 @ 256²**. Also mutates `tileEngine.emitters` in place (aliasing). | Hoist the comparator to module scope. Better: per-chunk emitter lists + a fixed-size partial selection — you only need the nearest 6. |
| **React commits** | `App.tsx:315-317, 361-444` | ~20 closures + 1 `dayNightState` object literal, ≥2×/second, forever. | `useCallback`/`useMemo` + `React.memo`; move metrics state out of `App`. |
| **Settings persistence** | `App.tsx:248-291` | `JSON.stringify` + synchronous `localStorage.setItem` on every settings change — including `turnCount` and `timeOfDayMinutes`, which change on **every turn**. | Debounce; exclude per-turn state from the persisted object or persist it on a separate low-frequency path. |

### Correctly-done, worth preserving

- Module-scoped scratch objects in `TileRenderer.ts:11-29` and `FrustumCuller.ts:4-5` — textbook, keep it.
- `TileDataEngine`'s contiguous typed arrays (`TileData.ts:57-61`).
- `FrustumCuller.updateVisibility()` — genuinely zero-allocation.
- The atlas/material/tree-model caches in `TilePoolManager`.
- `FPSCounter.tsx` — pre-allocated glyph tables, `Int32Array` char buffer, pre-built title strings. **This file is more rigorously optimised than any file that actually matters.** It draws a 84×22 px counter. That effort belongs in `buildWorld()`.

---

## 5. Performance Roadmap

### Quick Wins — 1–2 days (highest ROI)

| # | Change | Effort | Measured / expected effect |
|---|---|---|---|
| 1 | `transparent: false` on the 4 sprite-tree materials (`treeModels.ts:151, 189, 229, 269`) | **5 min** | **[measured] −55 draw calls (−48%), −18,056 tris, −1.18 ms CPU/frame.** Plus early-Z and no blending on all foliage. |
| 2 | Bucket tree instances by type, not chunk×type (`TileRenderer.ts:363-368, 465-496`) | 2 h | **[measured] −51 more draw calls.** Combined with #1: **115 → 9**. |
| 3 | Remove `translucencyRatio` from the rebuild effect deps (`ASCIIMazeCanvas.tsx:486`) | **5 min** | Eliminates up to 41 × 14.5 ms rebuilds per slider drag, for a feature that renders nothing. |
| 4 | Throttle the pointer raycast to one per frame; hoist the `targets` array (`TileRenderer.ts:261-291`) | 1 h | **[measured] −0.9 ms per pointer event**, up to ~11% of a core recovered at 120 Hz, plus the GC churn. |
| 5 | Delete 3 unused PNGs; downscale `adventurer-2d.png` to 128×128 | 30 min | **−3.6 MB** download, **~6 MB VRAM**. |
| 6 | Give the terrain mesh its own geometry clone (`TileRenderer.ts:455`) | 15 min | Closes the **measured** 1-buffer-per-rebuild GL leak. |
| 7 | Decide on shadows: enable `receiveShadow` on terrain+floor, **or** disable the pass | 1 h | Either makes the −56-call/−20k-tri pass worth its cost, or reclaims it entirely. |
| 8 | Complete `dispose()`; make pool disposal reference-counted | 2 h | Closes remaining teardown leaks and the StrictMode double-mount hazard. |
| 9 | `React.memo` on `HUDControls`/`PauseScreen`/`FPSCounter`; `useMemo` `dayNightState` | 2 h | Stops ~2 full HUD reconciliations/second. |
| 10 | Drop 4 unused dependencies; add `manualChunks` for `three` | 30 min | Smaller install; app edits stop invalidating the 600 KB vendor chunk. |

> **Combined effect of #1–#4 alone, at the measured baseline: 115 → 9 draw calls, 1.34 ms → ~0.14 ms CPU in `updateFrame`, and 0.9 ms/event of input-path work removed.**

### Medium Effort — 1–2 weeks (structural)

1. **Remove the 64×64 hardcoding** (6 sites in `TileRenderer.ts`). Precondition for every scalability goal. Add a dev assertion on `mesh.count <= instanceMatrix.count`.
2. **Split `buildWorld()` by change type.** Theme → uniforms. Sprite pack → material swap. Only `worldGrid` → geometry. Removes the 14 ms hitch from most UI interactions.
3. **Per-chunk terrain batching** with real bounds and `frustumCulled = true`. Foundation for both culling and streaming.
4. **Flat-ground quad geometry** for low tiles (**−57% scene triangles, measured**).
5. **Render-on-demand.** Turn-based game, static world: render only when the camera moves, time changes, or an animation is active. Idle GPU cost → near zero; laptop battery and thermals improve, which on thermally-limited hardware *is* sustained frame rate.
6. **Fix or delete "fake" lighting.** As a per-instance colour attribute on the existing terrain batch it costs zero extra draw calls and zero overdraw.
7. **Fixed-timestep simulation.** Decouple day/night from frame rate (`TileRenderer.ts:811`).
8. **Prototype `MeshLambertMaterial`** for terrain and foliage. Likely the biggest un-measured GPU win on low-end hardware.
9. **Delete or implement** `isTranslucentFlags`/`isRuinFlags` and the whole translucency prop chain.

### Long-Term Investments (architectural)

1. **Chunk streaming.** Per-chunk build/destroy, load/unload by distance, amortised across frames. The prerequisite for "significantly larger levels" — without it, 256² is already a 248 ms freeze.
2. **Single source of truth for world data.** Retire `WorldCell[][]` after generation; build from `TileDataEngine`'s typed arrays with integer comparisons instead of `cell.type.startsWith(...)`. Removes >1 M objects at 1024².
3. **Move world generation and mesh building to a Worker.** `generateNaturalWorld` + `buildUnifiedMountainMeshGroup` + instance-matrix assembly are pure functions over typed arrays — ideal worker payloads, transferable back as `ArrayBuffer`s. Converts every freeze into a background task.
4. **Entity/component layer.** There are currently no entities — one hardcoded adventurer `Sprite` at `TileRenderer.ts:528-540`. Before adding thousands, define a data-oriented store (SoA typed arrays, integer handles) and a distance-banded update scheduler. **Retrofitting this later is far more expensive than building it now, and this is the right moment.**
5. **Automated performance regression gate.** The instrumentation used for this audit (GL call counters + manual `updateFrame` driving) is ~40 lines. Wire it into CI and fail the build on draw-call or triangle-count regressions. The `transparent: true` bug would have been caught the day it landed.

---

## 6. Best Practices Checklist

Legend: ✅ compliant · ⚠️ partial · ❌ violated · ➖ not applicable

### Three.js
- ✅ `InstancedMesh` used for the bulk of the world
- ✅ Shared geometry/material caches
- ✅ Index-buffer reordering to collapse `BoxGeometry`'s 6 material groups to 2 (`TilePoolManager.ts:44-76`) — genuinely clever
- ✅ `customProgramCacheKey` set alongside `onBeforeCompile` (`TilePoolManager.ts:165`) — commonly forgotten
- ✅ `shadow.autoUpdate = false` with explicit invalidation
- ❌ **`transparent: true` on alpha-tested cutout materials** — the single worst violation
- ❌ **`side: DoubleSide` + `transparent`** → silent two-pass rendering
- ❌ Per-instance mutation of a shared cached geometry (`setAttribute` on the pooled `BoxGeometry`)
- ❌ `frustumCulled = false` used as the default rather than the exception
- ⚠️ Disposal is thorough in `buildWorld()`, incomplete in `dispose()`
- ⚠️ Mipmaps disabled everywhere
- ⚠️ `MeshStandardMaterial` (full PBR) for flat-shaded pixel art

### React
- ✅ Refs used correctly to keep render state out of the animation loop
- ✅ StrictMode double-mount explicitly handled (`ASCIIMazeCanvas.tsx:314-318`) — thoughtful
- ✅ Renderer lifecycle owned by a single mount effect with a real cleanup
- ❌ **No `React.memo` anywhere**
- ❌ ~20 inline arrow props recreated per render on two large components
- ❌ `dayNightState` object literal recreated per render, defeating a ref-sync effect
- ❌ High-frequency render state (`renderMetrics`, `gameTimeSeconds`) held at the root
- ⚠️ `JSON.stringify` used for change detection (`ASCIIMazeCanvas.tsx:481`)

### React Three Fiber
- ➖ **Not used.** Raw Three.js with a manual `requestAnimationFrame` loop. This is a defensible choice for a renderer this imperative, and it sidesteps R3F's reconciliation overhead. No R3F guidance applies. *(The audit brief assumed R3F; it is not present.)*

### Rendering / GPU
- ✅ Adaptive pixel-ratio cap by viewport area (`TileRenderer.ts:976-982`)
- ✅ `powerPreference: 'high-performance'`, `stencil: false`
- ✅ Water animation folded into the existing terrain shader — zero extra draw calls. Exemplary.
- ❌ 115 draw calls for content that needs 9
- ❌ Shadow casters with essentially no receivers
- ❌ Full-map transparent overdraw layer in "fake" lighting mode
- ⚠️ MSAA enabled on nearest-filtered pixel art
- ⚠️ Camera `far = 3000` for a 64-unit world

### Memory management
- ✅ Typed arrays for tile state
- ✅ Module-scoped scratch math objects, used consistently
- ❌ Unbounded GL buffer leak per rebuild
- ❌ Incomplete `dispose()`; singleton disposed by an instance
- ⚠️ Two parallel representations of the same world data

### Object pooling
- ❌ **`TilePoolManager` does not pool.** `acquireInstancedMesh` always allocates; `releaseInstancedMesh` is never called; `instancedMeshPool` is permanently empty. The name and the docs claim otherwise.
- ✅ The light pool (`TileRenderer.ts:210-218`) is real, fixed-size, with sticky assignment and frustum-based retention — well designed.

### Asset pipeline
- ❌ 3.6 MB of unreferenced PNGs shipped to production
- ❌ 1254×1254 texture for a ~30 px billboard
- ❌ No compression (no WebP/KTX2/Basis), no Draco, no texture streaming
- ✅ Procedural sprite atlas generated at runtime — 128×128 for 28+ tile types, zero network cost. The best asset decision in the project.

### Culling
- ✅ Zero-allocation frustum culling implementation
- ❌ Applied to trees only
- ❌ Chunk AABBs are 350 units tall for ≤5-unit content
- ❌ No distance culling, no update culling

### LOD
- ❌ No LOD system of any kind
- ➖ Geometry LOD is genuinely not needed here (8-tri trees); **do not build it**. Batching is the real problem.
- ❌ No simulation LOD scaffolding for the entities to come

### World streaming
- ❌ None. Atomic all-or-nothing world construction.
- ❌ 248 ms synchronous freeze at 256×256

### Game architecture
- ✅ Clean module boundaries: data / rendering / pooling / culling / generation
- ✅ `TileDataEngine` has zero Three.js dependency — properly testable
- ❌ No entity system, no game loop separation, no fixed timestep
- ❌ Frame-rate-dependent simulation
- ❌ `Math.random()` in world loading breaks seed determinism
- ❌ Dead state (`isTranslucentFlags`) driving 14 ms of work per slider step
- ❌ Hardcoded world dimensions in the renderer contradicting the dynamic data engine

---

## 7. Closing assessment

This is a **well-intentioned codebase with real engineering discipline applied in the wrong places.** The evidence for both halves of that sentence is concrete:

The discipline is genuine — zero-allocation scratch objects, a legitimately clever index-buffer reordering to halve `BoxGeometry`'s draw calls, water animation folded into an existing shader for free, `customProgramCacheKey` correctly paired with `onBeforeCompile`, a sticky frustum-aware light pool, StrictMode handled deliberately. My leak testing over 20 world rebuilds found **zero** program, geometry or texture leaks. That is not an accident.

The misallocation is equally clear. `FPSCounter.tsx` — which draws an 84×22 pixel overlay — has a pre-allocated 1,000-entry string table and a reusable `Int32Array` glyph buffer. Meanwhile `buildWorld()` allocates ~2 MB of garbage and blocks for 14.5 ms, and four materials carry a `transparent: true` flag that costs **48% of all draw calls and 88% of measured CPU frame time**. The optimisation effort is real; it is aimed at the wrong file.

Against the stated targets:

- **Stable 60 FPS on low-end hardware** — plausible at 64×64 *after* the quick wins, particularly #1 and the `MeshLambertMaterial` prototype. The current overdraw and PBR fragment cost are the real risks on integrated GPUs, and they are exactly what my CPU-side instrumentation could not measure. **Profile on the actual target hardware before declaring this met.**
- **120+ FPS on modern hardware** — reachable at 64×64 after quick wins #1–#4.
- **No frame spikes** — **not met.** A 14.5 ms rebuild fires on a slider drag, and 0.9 ms of raycast fires on every pointer event.
- **Scale to significantly larger levels** — **blocked.** Not by performance, but by correctness: the renderer silently discards data and issues unbacked instanced draws at any size other than 64×64. Fix the hardcoding first; optimise second.
- **Long sessions without degradation** — one proven unbounded GL buffer leak, otherwise clean.

**The highest-value next action is a five-minute edit to four lines.** Start there, re-measure, then work down the Quick Wins table.

---

### Appendix: reproducing these measurements

```js
// Paste into the devtools console with the app running.
// 1. Count GL draw calls / buffers
const P = WebGL2RenderingContext.prototype, S = {calls:0, tris:0, bufNew:0, bufDel:0};
const w = (n, f) => { const o = P[n]; P[n] = function(...a){ f(a); return o.apply(this,a); }; };
w('drawElements', a => (S.calls++, S.tris += a[1]/3));
w('drawElementsInstanced', a => (S.calls++, S.tris += (a[1]/3)*a[4]));
w('createBuffer', () => S.bufNew++);  w('deleteBuffer', () => S.bufDel++);

// 2. Reach the renderer through the React fiber
const d = [...document.querySelectorAll('div')].find(x => x.querySelector('canvas') && x.className.includes('absolute inset-0'));
let f = d[Object.keys(d).find(k => k.startsWith('__reactFiber$'))], tr;
for (let i = 0; i < 20 && f; i++, f = f.return)
  for (let h = f.memoizedState; h; h = h.next)
    if (h.memoizedState?.current?.constructor?.name === 'TileRenderer') tr = h.memoizedState.current;

// 3. Drive frames directly (bypasses rAF throttling) and read renderer.info
const dn = {timeOfDayMinutes:720, isTimeLocked:true, manualTimeMinutes:720, turnIncrementMinutes:30, turnCount:1};
for (let i = 0; i < 8; i++) tr.updateFrame(1/60, false, false, dn, new Set());
const t0 = performance.now();
for (let i = 0; i < 100; i++) tr.updateFrame(1/60, false, false, dn, new Set());
console.log({
  msPerFrame: (performance.now() - t0) / 100,
  calls: tr.renderer.info.render.calls,
  tris: tr.renderer.info.render.triangles,
});
```

---

## 11. Implementation Results

Implemented on branch `perf-optimizations`. All numbers below were measured with the
**identical protocol** used for the baseline (median of 7 trials × 120 frames, driving
`updateFrame()` directly, 1280×720 @ DPR 1, default world, isometric ortho camera framing
the whole map). The "before" column was re-measured on the original code via `git stash`
in the same browser session, so the two are directly comparable.

### Default world (64×64)

| Metric | Before | After | Change |
|---|---|---|---|
| **Draw calls / frame** | 115 | **10** | **−91%** |
| **Triangles / frame** | 81,984 | **33,838** | **−59%** |
| **CPU / frame** (median of 7) | 1.178 ms | **0.096 ms** | **−92%** |
| **Cost per pointer event** | 1.26 ms | **~0 ms** | raycast moved to 1×/frame |
| `buildWorld()` (median of 7) | 14.8 ms | **11.9 ms** | −20% |
| GL buffers leaked per rebuild | 1 | **0** | leak closed |
| Tree meshes | 55 | **4** | — |
| Shipped image payload | 4.1 MB | **44 KB** | −99% |
| Bundle (largest chunk) | 921 KB | 531 KB (`three`) + 380 KB app | vendor split |

`buildWorld()` improved only 20% — and that is with it now *also* doing the fake-lighting
tint bake that used to run every third frame. The remaining cost is instance-matrix
composition and mountain vertex generation, which need the chunked/worker rework listed as
a long-term item.

### Scalability (256×256, 16× the default world)

| Metric | Before | After |
|---|---|---|
| Draw calls | 591 | **42** |
| Triangles | 925,156 | **393,296** |
| CPU / frame | 0.997 ms | **0.200 ms** |
| Tree meshes | 880 | **64** |
| `loadWorldGrid()` | 21.1 ms | **10.0 ms** |
| **Tile heights silently discarded** | **61,440** | **0** |
| **Instances drawn with no backing matrix** | **61,440** | **0** |
| Fake lighting coverage | top-left 6.25% only | whole map |

### Bugs fixed along the way

Two were pre-existing defects the audit surfaced rather than performance items:

1. **Fake lighting rendered pure black.** Both fake-light materials set `vertexColors: true`
   on geometry with no `color` vertex attribute, so the shader multiplied by (0,0,0). Verified
   present in the original code. Per-instance colour comes from `instanceColor`, which Three.js
   wires up independently — removing the flag makes the mode work for the first time.
2. **`Math.random()` in `loadWorldGrid`** broke seed reproducibility on every rebuild.

### Deliberately not done

| Item | Why |
|---|---|
| **Render-on-demand** | The water shader animates continuously, so nearly every frame is genuinely dirty. Worth revisiting only after gating water animation. |
| **`MeshLambertMaterial` for terrain** | Likely the largest remaining GPU win on low-end hardware, but it changes how the scene is lit — an art-direction call, not a perf one. |
| **Mipmaps on the tile atlas** | The atlas packs 16×16 cells of 8×8 px; higher mip levels would bleed neighbouring tile types into each other. Enabled on the adventurer texture only (single sprite, nothing to bleed into). |
| **Disabling MSAA** | Smooths the blocky geometry edges, not the pixel-art textures. Visual call for the owner. |
| **Chunk streaming / worker world-gen** | The real fix for the 226 ms rebuild at 256². Genuine architecture work, out of scope for an optimisation pass. |
| **Wall translucency** | The slider still has no visual effect — `isTranslucentFlags` was written and never read, so the flags and the per-rebuild `Math.random()` were removed. The setting and its plumbing were left in place: implementing or removing the feature is a design decision. **This needs an owner decision.** |

### Regression guard

The default world should render in **~10 draw calls**. Any change that pushes
`renderer.info.render.calls` substantially above that has almost certainly reintroduced
either alpha blending on foliage or a per-chunk mesh split. The console snippet in the
appendix reproduces every measurement in this report in about ten seconds.
