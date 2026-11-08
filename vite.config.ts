import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/apex-racing/' : '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2400,
    rollupOptions: {
      output: {
        manualChunks: {
          physics: ['@react-three/rapier'],
          three: ['three'],
          react: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
}));


