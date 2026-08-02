// Split out of sprites.ts and loaded on demand. It is a ~130-line HTML template
// carrying a second, self-contained copy of the renderer; it only runs when the
// user clicks Export, so it has no business in the entry chunk.
// Standalone Single-File HTML Generator with procedural 8x8 Sprite Atlas
export function generateStandaloneHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SPRITEDUNG - 64x64 8x8 Sprite World</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: #22c55e; font-family: 'Courier New', monospace; }
    #canvas-container { width: 100vw; height: 100vh; display: block; position: absolute; top: 0; left: 0; z-index: 1; }
    .crt { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 10;
      background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.3) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03));
      background-size: 100% 4px, 6px 100%; }
    .panel { position: fixed; z-index: 20; background: rgba(5, 12, 20, 0.92); border: 1px solid #22c55e; box-shadow: 0 0 15px rgba(34, 197, 94, 0.25); padding: 12px 16px; border-radius: 6px; backdrop-filter: blur(6px); }
    .header { top: 16px; left: 16px; max-width: 380px; }
    .title { font-size: 15px; font-weight: bold; letter-spacing: 2px; color: #22c55e; text-shadow: 0 0 8px #22c55e; }
    .sub { font-size: 11px; color: #94a3b8; margin-top: 4px; }
    .controls { bottom: 16px; left: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
    .btn { background: #062612; color: #22c55e; border: 1px solid #22c55e; padding: 8px 12px; font-family: inherit; font-size: 12px; font-weight: bold; cursor: pointer; border-radius: 4px; transition: all 0.2s; }
    .btn:hover { background: #22c55e; color: #000; box-shadow: 0 0 10px #22c55e; }
    .help { top: 16px; right: 16px; font-size: 11px; color: #94a3b8; text-align: right; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
  <div class="crt"></div>
  <div id="canvas-container"></div>
  <div class="panel header">
    <div class="title">[SPRITEDUNG // 8x8 TILE ATLAS]</div>
    <div class="sub">3D Black Blocks with 8x8 Pixel Nature & Dungeon Sprites</div>
  </div>
  <div class="panel controls">
    <button class="btn" id="b-gen">⚡ New World</button>
    <button class="btn" id="b-rot">🔄 Auto Rotate</button>
    <button class="btn" id="b-reset">🎥 Center Camera</button>
  </div>
  <div class="panel help">
    🎮 WASD / ◄▲▼►: Pan Camera<br/>
    🖱️ Left-Click: Orbit<br/>
    📜 Scroll: Zoom
  </div>
  <script>
    let scene, camera, renderer, controls, worldGroup, autoRot = true;
    const pressedKeys = new Set();
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (['arrowleft','arrowright','arrowup','arrowdown','a','d','w','s'].includes(k)) {
        pressedKeys.add(k); if (k.startsWith('arrow')) e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => pressedKeys.delete(e.key.toLowerCase()));

    function createAtlasTexture() {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#000000'; x.fillRect(0,0,128,128);
      
      // Draw procedural 8x8 pixel tiles on 16x16 grid
      const pal = ['#000000','#22c55e','#15803d','#4ade80','#166534','#854d0e','#a16207','#64748b','#334155','#94a3b8','#0284c7','#38bdf8','#eab308','#ef4444','#a855f7'];
      
      for(let sy=0; sy<16; sy++) {
        for(let sx=0; sx<16; sx++) {
          const idx = sy*16 + sx;
          for(let py=0; py<8; py++) {
            for(let px=0; px<8; px++) {
              const colorIdx = ((px + py + idx) % 14) + 1;
              x.fillStyle = pal[colorIdx];
              x.fillRect(sx*8 + px, sy*8 + py, 1, 1);
            }
          }
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    }

    function init() {
      const cont = document.getElementById('canvas-container');
      scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
      camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      cont.appendChild(renderer.domElement);
      const Orbit = THREE.OrbitControls || OrbitControls;
      controls = new Orbit(camera, renderer.domElement); controls.enableDamping = true;
      scene.add(new THREE.AmbientLight(0xffffff, 1.5));
      const dl = new THREE.DirectionalLight(0xffffff, 2.0); dl.position.set(40, 60, 40); scene.add(dl);
      worldGroup = new THREE.Group(); scene.add(worldGroup);
      build();
      window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
      document.getElementById('b-gen').onclick = () => build();
      document.getElementById('b-rot').onclick = () => autoRot = !autoRot;
      document.getElementById('b-reset').onclick = () => { worldGroup.rotation.y = 0; controls.target.set(0,0,0); camera.position.set(60, 50, 60); controls.update(); };
      (function loop() {
        requestAnimationFrame(loop);
        if (autoRot) worldGroup.rotation.y += 0.002;
        controls.update(); renderer.render(scene, camera);
      })();
    }

    function build() {
      while(worldGroup.children.length > 0) worldGroup.remove(worldGroup.children[0]);
      const atlasTex = createAtlasTexture();
      const sideMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const topMat = new THREE.MeshBasicMaterial({ map: atlasTex });

      for(let r = 0; r < 64; r++) {
        for(let c = 0; c < 64; c++) {
          const h = (Math.sin(r*0.1) + Math.cos(c*0.1)) * 0.8 + 1.0;
          const bGeo = new THREE.BoxGeometry(0.96, h, 0.96);
          const mesh = new THREE.Mesh(bGeo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
          mesh.position.set(c - 31.5, h/2 - 0.5, r - 31.5);
          worldGroup.add(mesh);
        }
      }
      controls.target.set(0, 0, 0); camera.position.set(65, 50, 65); controls.update();
    }
    window.onload = init;
  </script>
</body>
</html>`;
}
