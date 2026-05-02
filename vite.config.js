import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
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
});
