import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const BUILD_ID = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return String(Date.now()) }
})()
const VERSION_URL = '/assets/vernon_project/frontend_web/version.json'

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
          path.resolve(__dirname, '../vernon_project/public/frontend_web/version.json'),
          JSON.stringify({ buildId: BUILD_ID, version: pkg.version }),
        )
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../frontend/src'),
      '@web': path.resolve(__dirname, 'src'),
    },
    // Shared files under `@` (../frontend/src) resolve bare deps from
    // frontend/node_modules while web's own code resolves from
    // frontend-web/node_modules. Without dedupe that yields TWO copies of these
    // singletons — fatal for context-based libs (React Query provider in one
    // copy, hooks reading the other => "No QueryClient set"). Force one copy.
    dedupe: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@tanstack/react-query-persist-client',
      '@tanstack/query-sync-storage-persister',
      '@tanstack/query-core',
    ],
  },
  build: {
    outDir: '../vernon_project/public/frontend_web',
    emptyOutDir: true,
    target: 'es2018',
    sourcemap: false,
  },
})
