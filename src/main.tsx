/* src/main.tsx */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate><App /></AuthGate>
  </StrictMode>,
)

if (import.meta.env.DEV) {
  import("./dev/demoData").then(({ loadDemoData, clearDemoData }) => {
    (window as any).loadDemoData = loadDemoData;
    (window as any).clearDemoData = clearDemoData;
  });
}
