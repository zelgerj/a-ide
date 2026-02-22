import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
      rollupOptions: {
        external: ['node-pty']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      sourcemap: true
    }
  }
})
