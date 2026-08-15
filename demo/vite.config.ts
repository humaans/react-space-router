import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const hostedDemo = process.env.VITE_HOSTED_DEMO === 'true'

// Resolve `react-space-router` to the built dist of the parent package so the
// demo always exercises real router code without symlink quirks.
export default defineConfig({
  base: hostedDemo ? '/react-space-router/demo/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      'react-space-router': path.resolve(import.meta.dirname, '../dist/index.js'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
