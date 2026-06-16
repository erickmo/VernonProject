import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// The app is served at /m by Frappe, but its static assets live under
// /assets/vernon_project/frontend/ (Frappe serves each app's public/ there).
// `base` is passed on the CLI (see package.json build script).
//
// PWA: we use a hand-written service worker (frontend/sw-custom.js) served from
// the site root at /vernon_sw.js and registered with scope "/m". It uses only
// absolute URLs + runtime caching, so it is robust to the SW being served from a
// different path than the assets (which trips up generated/precache workers).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: '../vernon_project/public/frontend',
    emptyOutDir: true,
    target: 'es2018',
    sourcemap: false,
  },
})
