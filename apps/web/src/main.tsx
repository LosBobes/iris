import './assets/main.css'
import './lib/web-api'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FontScaleProvider } from '@/components/providers/FontScaleProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FontScaleProvider>
      <App />
    </FontScaleProvider>
  </StrictMode>
)
