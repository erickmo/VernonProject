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
