import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Resolve `react-space-router` to the built dist of the parent package so the
// demo always exercises real router code without symlink quirks.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-space-router': path.resolve(__dirname, '../dist/index.js'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
  },
})
