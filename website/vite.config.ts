import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/locX-geolocation-reactnative/',
  plugins: [
    react(),
    {
      name: 'emit-nojekyll',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
