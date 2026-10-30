import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'zod/mini': path.resolve(__dirname, './node_modules/porto/node_modules/zod/mini/index.js'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      maxParallelFileOps: 2,
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react/') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-core'
            }
            if (id.includes('@tanstack')) {
              return 'tanstack-vendor'
            }
            if (id.includes('framer-motion')) {
              return 'motion-vendor'
            }
            if (
              id.includes('viem') ||
              id.includes('/ox/') ||
              id.includes('\\ox\\') ||
              id.includes('@coinbase') ||
              id.includes('@base-org') ||
              id.includes('porto') ||
              id.includes('wagmi') ||
              id.includes('@wagmi')
            ) {
              return 'web3-vendor'
            }
            if (id.includes('connectkit')) {
              return 'connectkit-vendor'
            }
            if (id.includes('@walletconnect')) {
              return 'wc-vendor'
            }
            if (id.includes('firebase')) {
              return 'firebase-vendor'
            }
            if (id.includes('lucide-react')) {
              return 'icons-vendor'
            }
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
    ],
  },
  server: {
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
