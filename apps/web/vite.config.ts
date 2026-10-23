import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
    include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'motion/react'],
  },
  server: {
    port: 5173,
    strictPort: true,
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
