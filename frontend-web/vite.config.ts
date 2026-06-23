import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../frontend/src'),
      '@web': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: '../vernon_project/public/frontend_web',
    emptyOutDir: true,
    target: 'es2018',
    sourcemap: false,
  },
})
