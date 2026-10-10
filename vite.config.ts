import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const appVersion = '1.1.0'
const deployEnvironment = process.env.VITE_DEPLOY_ENV === 'staging' ? 'staging' : 'production'
const isStaging = deployEnvironment === 'staging'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __DEPLOY_ENV__: JSON.stringify(deployEnvironment),
  },
  plugins: [react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { importScripts: ['push-sw.js'] },
      manifest: {
        name: isStaging ? '家計簿 STAGING' : '家計簿',
        short_name: isStaging ? '家計簿 STG' : '家計簿',
        description: '個人用の家計・資産管理アプリ',
        lang: 'ja',
        start_url: '/add',
        display: 'standalone',
        background_color: '#F9FFFB',
        theme_color: isStaging ? '#9A5A00' : '#245E2D',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    }),
    {
      name: 'exclude-local-fixtures',
      closeBundle() {
        rmSync(resolve(process.cwd(), 'dist/fixtures/demoData.local.json'), { force: true })
      },
    },
  ],
})
