import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'react-hooks/incompatible-library': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // The service worker template runs in the worker scope, not a page; the
    // two constants are prepended at build time by pwa/vite-plugin.ts.
    files: ['pwa/service-worker.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        PRECACHE_VERSION: 'readonly',
        PRECACHE_URLS: 'readonly',
      },
    },
  },
])
