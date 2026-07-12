import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

// The app is served at /m by Frappe, but its static assets live under
// /assets/vernon_project/frontend/ (Frappe serves each app's public/ there).
// `base` is passed on the CLI (see package.json build script).
//
// PWA: we use a hand-written service worker (frontend/sw-custom.js) served from
// the site root at /vernon_sw.js and registered with scope "/m". It uses only
// absolute URLs + runtime caching, so it is robust to the SW being served from a
// different path than the assets (which trips up generated/precache workers).

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const BUILD_ID = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return String(Date.now()) }
})()
const VERSION_URL = '/assets/vernon_project/frontend/version.json'

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __VERSION_URL__: JSON.stringify(VERSION_URL),
  },
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      closeBundle() {
        writeFileSync(
          path.resolve(__dirname, '../vernon_project/public/frontend/version.json'),
          JSON.stringify({ buildId: BUILD_ID, version: pkg.version }),
        )
      },
    },
  ],
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
