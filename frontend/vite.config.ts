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
      // acceso/, acceso/nueva-clave/ e inicio/ son el login (src/auth/ + src/paginas/; ver design/login/).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        anterior: fileURLToPath(new URL('./anterior.html', import.meta.url)),
        acceso: fileURLToPath(new URL('./acceso/index.html', import.meta.url)),
        nuevaClave: fileURLToPath(new URL('./acceso/nueva-clave/index.html', import.meta.url)),
        inicio: fileURLToPath(new URL('./inicio/index.html', import.meta.url)),
      },
    },
  },
})
