import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {renderMetricsStore} from './utils/renderMetricsStore.ts';
import './index.css';

// Read-only diagnostics hook. The performance gate in scripts/perf-check.mjs
// reads draw calls and triangle counts from the production build through this,
// rather than reaching into React internals to find the renderer.
declare global {
  interface Window {
    __asciidungMetrics?: () => ReturnType<typeof renderMetricsStore.get>;
  }
}
window.__asciidungMetrics = () => renderMetricsStore.get();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
