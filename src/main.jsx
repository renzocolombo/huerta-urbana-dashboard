import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import { GoogleSheetsProvider } from './context/GoogleSheetsContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleSheetsProvider>
      <App />
    </GoogleSheetsProvider>
  </StrictMode>,
)
