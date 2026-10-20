import { resolve } from 'node:path'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

// The regulations guide imports Markdown from docs/drzavne-integracije, outside this app.
const regulationDocsDir = resolve(__dirname, '../../docs/drzavne-integracije')

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@renderer': resolve(__dirname, 'src'),
      '@regulation-docs': regulationDocsDir,
    },
  },
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), regulationDocsDir],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'pwa/**/*.test.ts'],
  },
})
