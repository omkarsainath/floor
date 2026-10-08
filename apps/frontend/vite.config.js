import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The tracer is a separate entry point, so production must build it as well as
// the 3D viewer and bundle its measurement/geometry imports.
export default defineConfig({
  // Keep the saved-project origin stable instead of silently switching ports.
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  plugins: [{
    name: 'include-example-floorplan',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'precise_floorplan.json',
        source: readFileSync(new URL('./precise_floorplan.json', import.meta.url), 'utf8'),
      });
    },
  }],
  build: {
    rollupOptions: {
      input: {
        viewer: fileURLToPath(new URL('./index.html', import.meta.url)),
        tracer: fileURLToPath(new URL('./tracer.html', import.meta.url)),
      },
    },
  },
});
