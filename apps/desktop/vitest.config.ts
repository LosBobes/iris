import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/renderer/src/test/setup.ts'],
    include: [
      'src/renderer/src/**/*.test.{ts,tsx}',
      'src/renderer/src/**/*.spec.{ts,tsx}',
      'src/main/**/*.test.ts',
      'src/main/**/*.spec.ts'
    ]
  }
})
