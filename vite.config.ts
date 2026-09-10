import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const appVersion = `0.1.${execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim()}`

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { importScripts: ['push-sw.js'] },
      manifest: {
        name: '家計簿',
        short_name: '家計簿',
        description: '個人用の家計・資産管理アプリ',
        lang: 'ja',
        start_url: '/',
        display: 'standalone',
        background_color: '#F9FFFB',
        theme_color: '#245E2D',
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
