/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/*
 * Development: `npm run dev` serves the SPA on http://localhost:5173 and
 * proxies API / auth / broadcasting calls to Laravel, so the browser sees ONE
 * origin and HTTP-only session cookies + CSRF work exactly as in production.
 *
 * Production, same origin (default): `npm run build` emits into
 * ../backend/public/spa, served by Laravel/Apache from the API's origin.
 *
 * Production on Vercel (or whenever VITE_API_URL is set): standalone build -
 * base "/", output "dist/", Firebase service worker copied to the site root.
 *   - VITE_API_URL unset ("proxy mode", default on Vercel): the SPA calls
 *     /api on its own origin and vercel.json rewrites forward to Laravel.
 *   - VITE_API_URL set ("direct mode"): the SPA calls that origin directly;
 *     requires both hosts on one parent domain + CORS (see docs).
 */

const BACKEND_SW = fileURLToPath(new URL('../backend/public/firebase-messaging-sw.js', import.meta.url))
// Vercel builds only the frontend/ directory, so ../backend is absent there; keep a mirror here.
const FRONTEND_SW = fileURLToPath(new URL('./firebase-messaging-sw.js', import.meta.url))

/** Copy the SW for standalone builds. backend/public is canonical; the frontend mirror must match it. */
function copyServiceWorker(): Plugin {
  return {
    name: 'copy-firebase-service-worker',
    apply: 'build',
    generateBundle() {
      const mirror = readFileSync(FRONTEND_SW, 'utf8')
      if (existsSync(BACKEND_SW) && readFileSync(BACKEND_SW, 'utf8').replace(/\r\n/g, '\n') !== mirror.replace(/\r\n/g, '\n')) {
        this.error('frontend/firebase-messaging-sw.js is out of sync with backend/public/firebase-messaging-sw.js - copy it over.')
      }
      this.emitFile({ type: 'asset', fileName: 'firebase-messaging-sw.js', source: mirror })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_BACKEND_URL || 'http://localhost:8000'
  // Vercel always gets the standalone output in dist/. With VITE_API_URL unset
  // the SPA calls the API on its own origin and vercel.json rewrites proxy
  // those paths to Laravel ("proxy mode", works with any backend hostname).
  const standalone = command === 'build' && (!!env.VITE_API_URL || !!process.env.VERCEL)
  const proxied = { target: backend, changeOrigin: false, xfwd: true }

  return {
    base: command === 'build' && !standalone ? '/spa/' : '/',
    plugins: [vue(), ...(standalone ? [copyServiceWorker()] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': proxied,
        '/sanctum': proxied,
        '/broadcasting': proxied,
        '/email': proxied,
        '/firebase-messaging-sw.js': proxied,
      },
    },
    build: {
      outDir: standalone ? 'dist' : '../backend/public/spa',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 700,
    },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.spec.ts'],
    },
  }
})
