import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { offline } from './scripts/offlinePlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // offline(): the service worker for working offline, built with the app (build only).
  plugins: [react(), offline()],
})
