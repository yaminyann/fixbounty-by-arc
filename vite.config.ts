import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const src = path.resolve(__dirname, './src')

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      // Browser test mode only: sign in with a local token service instead of Google.
      ...(mode === 'e2e' ? [{ find: /^@\/lib\/authAdapter$/, replacement: path.join(src, 'dev/authAdapter.e2e.ts') }] : []),
      { find: '@', replacement: src },
    ],
    dedupe: ['react', 'react-dom'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('firebase') || id.includes('@firebase')) return 'firebase'
          if (id.includes('connectkit') || id.includes('@walletconnect') || id.includes('@reown')) return 'wallet-ui'
          if (id.includes('wagmi') || id.includes('viem') || id.includes('abitype') || id.includes('@noble') || id.includes('@scure')) return 'web3'
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react'
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_PROXY ?? 'http://localhost:4000', changeOrigin: true },
    },
  },
}))
