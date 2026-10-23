import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'motion/react',
      'lucide-react',
      'better-auth/react',
      'sonner',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre'
          if (id.includes('node_modules/recharts')) return 'recharts'
          if (id.includes('node_modules/motion')) return 'motion'
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/AuthedApp.tsx',
        './src/components/explorer/HotspotsView.tsx',
        './src/components/explorer/Map.tsx',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
