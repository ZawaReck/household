/* src/main.tsx */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { SyncManager } from './components/SyncManager.tsx'
import { hydrateOfflineStorage } from './data/offlineStore.ts'
import { backupKeys } from './utils/backup.ts'

const renderApp = () => createRoot(document.getElementById('root')!).render(
  <StrictMode><AuthGate><SyncManager><App /></SyncManager></AuthGate></StrictMode>,
)

void hydrateOfflineStorage(backupKeys).finally(renderApp)

if (import.meta.env.DEV) {
  import("./dev/demoData").then(({ loadDemoData, clearDemoData }) => {
    (window as any).loadDemoData = loadDemoData;
    (window as any).clearDemoData = clearDemoData;
  });
}
