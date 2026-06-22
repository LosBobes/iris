import './assets/main.css'
import './lib/web-api'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FontScaleProvider } from '@/components/providers/FontScaleProvider'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { ListPreferencesProvider } from '@/components/providers/ListPreferencesProvider'
import { ColumnVisibilityProvider } from '@/components/providers/ColumnVisibilityProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ListPreferencesProvider>
        <ColumnVisibilityProvider>
          <FontScaleProvider>
            <App />
          </FontScaleProvider>
        </ColumnVisibilityProvider>
      </ListPreferencesProvider>
    </ThemeProvider>
  </StrictMode>
)
