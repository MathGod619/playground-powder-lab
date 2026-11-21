import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative paths work both on GitHub Pages (/playground-powder-lab/) and at a site root (chatgpt.site).
  base: './',
})
