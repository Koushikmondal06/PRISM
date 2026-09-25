import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'events'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'buffer': 'buffer',
    },
  },
  server: {
    proxy: {
      '/rpc': {
        target: 'https://api.devnet.solana.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/rpc/, ''),
      },
    },
  },
  optimizeDeps: {
    include: [
      '@solana/web3.js',
      '@solana/spl-token',
      'buffer',
    ],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
})

