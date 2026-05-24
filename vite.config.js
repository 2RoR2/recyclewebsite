import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const localApiPlugin = () => ({
  name: 'local-api-routes',
  configureServer(server) {
    server.middlewares.use('/api/detect-waste', async (request, response, next) => {
      if (request.method !== 'POST') {
        next();
        return;
      }

      const { default: handler } = await import('./api/detect-waste.js');
      handler(request, response);
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), localApiPlugin()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
      hmr: {
        host: '127.0.0.1',
        protocol: 'ws',
      },
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@tensorflow')) return 'ai-vendor';
            if (id.includes('react')) return 'react-vendor';
            if (id.includes('bootstrap') || id.includes('sweetalert2')) return 'ui-vendor';
            if (id.includes('leaflet')) return 'map-vendor';
            if (id.includes('chart.js')) return 'chart-vendor';
            if (id.includes('html5-qrcode')) return 'scan-vendor';
            if (id.includes('three')) return 'three-vendor';
            if (id.includes('gsap')) return 'motion-vendor';
            return 'vendor';
          },
        },
      },
    },
  };
});
