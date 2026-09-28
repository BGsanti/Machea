import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      // index.html es la landing estática (película, demo 3D y botón al formulario);
      // anterior.html conserva la landing React de GO FEST en /anterior.html.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        anterior: fileURLToPath(new URL('./anterior.html', import.meta.url)),
      },
    },
  },
})
