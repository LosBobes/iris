import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src'),
      '@renderer': resolve('src'),
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    // Recharts + its d3-*/victory-vendor dependencies alone dwarf the rest of
    // the vendor graph, so it gets its own chunk (loaded lazily, see
    // DashboardFinanceSection); react/react-dom/react-router/scheduler,
    // radix-ui, and i18next are split out too so route chunks share one
    // cached vendor chunk each instead of duplicating them.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id, { getModuleInfo }) {
          if (!id.includes('node_modules')) return undefined

          if (
            /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(
              id,
            )
          ) {
            return 'react-vendor'
          }

          if (/node_modules\/(recharts|d3-[^/]+|victory-vendor)\//.test(id)) {
            // Only bucket these into the dedicated "charts" chunk when they
            // are exclusively reached through a dynamic import (recharts is
            // only pulled in by the lazily-loaded DashboardCharts). If some
            // shared helper inside recharts/d3 is also reachable via a
            // static import chain, forcing it into "charts" would create a
            // static cross-chunk import from the entry into the whole
            // recharts bundle — defeating the point of splitting it out — so
            // fall through to Rollup's default chunking for that module
            // instead.
            const info = getModuleInfo(id)
            const onlyDynamic =
              !!info &&
              info.importers.length === 0 &&
              info.dynamicImporters.length > 0
            if (onlyDynamic) return 'charts'
            return undefined
          }

          if (/node_modules\/(radix-ui|@radix-ui\/[^/]+)\//.test(id)) {
            return 'radix'
          }

          if (
            /node_modules\/(i18next|react-i18next|i18next-browser-languagedetector)\//.test(
              id,
            )
          ) {
            return 'i18n-vendor'
          }

          return undefined
        },
      },
    },
  },
})
