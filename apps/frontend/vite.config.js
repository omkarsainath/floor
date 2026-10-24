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
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/apps/backend/private/**'],
    },
    // Browser requests stay on the page's origin. The Python server binds IPv4;
    // using its literal address also avoids localhost resolving to IPv6 first.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:5050',
        changeOrigin: true,
      },
    },
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
    target: 'es2022',
    rollupOptions: {
      input: {
        viewer: fileURLToPath(new URL('./index.html', import.meta.url)),
        login: fileURLToPath(new URL('./login.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
        builder: fileURLToPath(new URL('./builder.html', import.meta.url)),
        tracer: fileURLToPath(new URL('./tracer.html', import.meta.url)),
      },
    },
  },
});
