#!/usr/bin/env node
/**
 * Rendering performance regression gate.
 *
 * Builds nothing itself: run `npm run build` first. Serves dist/ with vite
 * preview, loads the default world in headless Chromium, and asserts the
 * rendering budgets in perf-budgets.json.
 *
 * Deliberately checks counts (draw calls, triangles, bundle bytes) rather than
 * frame timings. Counts are deterministic and identical on any machine; timings
 * depend on the runner and would make this flaky enough to be ignored, which is
 * worse than not having it.
 *
 * The `transparent: true` regression that cost 48% of draw calls would have been
 * caught here the day it landed.
 */
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const budgets = JSON.parse(readFileSync(join(here, 'perf-budgets.json'), 'utf8'));
const PORT = 4173;
const URL = `http://localhost:${PORT}/`;

function startPreview() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite preview did not start within 30s')), 30000);
    const onData = (buf) => {
      if (buf.toString().includes(String(PORT))) {
        clearTimeout(timer);
        resolve(proc);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => reject(new Error(`vite preview exited with code ${code}`)));
  });
}

function measureEntryChunk() {
  const assets = join(root, 'dist', 'assets');
  const entry = readdirSync(assets).find((f) => /^index-.*\.js$/.test(f));
  if (!entry) throw new Error('No entry chunk found in dist/assets - run `npm run build` first');
  return { name: entry, bytes: statSync(join(assets, entry)).size };
}

async function measureRendering() {
  const browser = await chromium.launch({
    args: [
      // Software WebGL. CI runners have no GPU, and these are counts, not timings.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(URL, { waitUntil: 'load' });

    // Metrics publish every 500 ms once the render loop is running, and the world
    // has to finish generating on its worker first.
    await page.waitForFunction(
      () => {
        const m = window.__asciidungMetrics?.();
        return m && m.drawCalls > 0 && m.triangles > 0;
      },
      { timeout: 30000 }
    );
    // Let it settle so we read a steady-state frame rather than a partial build.
    await page.waitForTimeout(2500);

    const metrics = await page.evaluate(() => window.__asciidungMetrics());
    return { metrics, consoleErrors };
  } finally {
    await browser.close();
  }
}

const failures = [];
function check(name, actual, budget) {
  const ok = actual <= budget.max;
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  ${status}  ${name.padEnd(16)} ${String(actual).padStart(8)}  (budget ${budget.max})`);
  if (!ok) failures.push(`${name}: ${actual} exceeds budget ${budget.max}\n         ${budget.note}`);
}

let preview;
try {
  const entry = measureEntryChunk();
  preview = await startPreview();
  const { metrics, consoleErrors } = await measureRendering();

  console.log('\nasciidung rendering budgets (default 64x64 world, production build)\n');
  check('drawCalls', metrics.drawCalls, budgets.drawCalls);
  check('triangles', metrics.triangles, budgets.triangles);
  check('entryChunkBytes', entry.bytes, budgets.entryChunkBytes);

  if (consoleErrors.length > 0) {
    failures.push(`console errors during load:\n         ${consoleErrors.slice(0, 5).join('\n         ')}`);
    console.log(`  FAIL  console          ${consoleErrors.length} error(s)`);
  } else {
    console.log('  PASS  console                0  error(s)');
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} budget failure(s):\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll rendering budgets met.\n');
  }
} catch (err) {
  console.error(`\nperf-check failed to run: ${err.message}\n`);
  process.exitCode = 1;
} finally {
  preview?.kill();
}
