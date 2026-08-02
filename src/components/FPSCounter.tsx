import React, { useEffect, useRef } from 'react';
import { renderMetricsStore } from '../utils/renderMetricsStore';

interface FPSCounterProps {
  themeColor?: string;
}

// Pre-allocated title string lookup table (0 to 999) to prevent string allocation
const PREALLOCATED_TITLE_STRINGS = new Array<string>(1000);
for (let i = 0; i < 1000; i++) {
  PREALLOCATED_TITLE_STRINGS[i] = i + ' FPS';
}

// 5x7 Pixel Font Bitmaps for 0-9, F, P, S, Space
// Each glyph is 7 rows of 5-bit integers
const GLYPHS: ReadonlyArray<ReadonlyArray<number>> = [
  // 0
  [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  // 1
  [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  // 2
  [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  // 3
  [0b11110, 0b00001, 0b00001, 0b00110, 0b00001, 0b00001, 0b11110],
  // 4
  [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  // 5
  [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  // 6
  [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  // 7
  [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  // 8
  [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  // 9
  [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  // 10: 'F'
  [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  // 11: 'P'
  [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  // 12: 'S'
  [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  // 13: ' ' (Space)
  [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
];

// Reusable integer buffer for glyph indices to prevent garbage collection
const CHAR_BUFFER = new Int32Array(8);

const FPSCounterComponent: React.FC<FPSCounterProps> = ({ themeColor = '#22c55e' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Subscribed directly to the metrics store and painted imperatively. Routing
  // the frame counter through React state re-rendered every ancestor twice a
  // second to change a handful of pixels.
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const clampedFps = Math.min(999, Math.max(0, renderMetricsStore.get().fps | 0));

      // Fill integer char buffer with glyph indices: e.g. [6, 0, 13, 10, 11, 12] for "60 FPS"
      let len = 0;
      if (clampedFps >= 100) {
        CHAR_BUFFER[len++] = (clampedFps / 100) | 0;
        CHAR_BUFFER[len++] = ((clampedFps % 100) / 10) | 0;
        CHAR_BUFFER[len++] = (clampedFps % 10) | 0;
      } else if (clampedFps >= 10) {
        CHAR_BUFFER[len++] = (clampedFps / 10) | 0;
        CHAR_BUFFER[len++] = (clampedFps % 10) | 0;
      } else {
        CHAR_BUFFER[len++] = clampedFps;
      }
      CHAR_BUFFER[len++] = 13; // ' '
      CHAR_BUFFER[len++] = 10; // 'F'
      CHAR_BUFFER[len++] = 11; // 'P'
      CHAR_BUFFER[len++] = 12; // 'S'

      const dpr = window.devicePixelRatio || 1;
      const cssWidth = 84;
      const cssHeight = 22;

      if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
        canvas.width = cssWidth * dpr;
        canvas.height = cssHeight * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Select color based on performance thresholds
      let color = themeColor;
      if (clampedFps >= 50) {
        color = '#22c55e'; // Emerald green
      } else if (clampedFps >= 30) {
        color = '#f59e0b'; // Amber
      } else {
        color = '#ef4444'; // Red
      }

      ctx.fillStyle = color;

      // Draw pixel font characters
      const pixelSize = 2;
      const charWidth = 5 * pixelSize; // 10px per char
      const charHeight = 7 * pixelSize; // 14px high
      const charGap = 2; // 2px spacing between chars

      const totalWidth = len * charWidth + (len - 1) * charGap;
      const startX = Math.floor((cssWidth - totalWidth) / 2);
      const startY = Math.floor((cssHeight - charHeight) / 2);

      for (let i = 0; i < len; i++) {
        const glyphIdx = CHAR_BUFFER[i];
        const glyph = GLYPHS[glyphIdx];
        const charX = startX + i * (charWidth + charGap);

        for (let row = 0; row < 7; row++) {
          const bits = glyph[row];
          for (let col = 0; col < 5; col++) {
            if ((bits & (1 << (4 - col))) !== 0) {
              ctx.fillRect(charX + col * pixelSize, startY + row * pixelSize, pixelSize, pixelSize);
            }
          }
        }
      }

      ctx.restore();

      const dot = dotRef.current;
      if (dot) {
        dot.style.backgroundColor = color;
        dot.style.boxShadow = `0 0 6px ${color}`;
      }
      if (rootRef.current) {
        rootRef.current.title = PREALLOCATED_TITLE_STRINGS[clampedFps];
      }
    };

    draw();
    return renderMetricsStore.subscribe(draw);
  }, [themeColor]);

  return (
    <div
      ref={rootRef}
      className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/80 border border-zinc-800 shadow-inner"
      title={PREALLOCATED_TITLE_STRINGS[60]}
    >
      <span ref={dotRef} className="w-2 h-2 rounded-full animate-pulse" />
      <canvas ref={canvasRef} style={{ width: '84px', height: '22px' }} className="block" />
    </div>
  );
};

export const FPSCounter = React.memo(FPSCounterComponent);
