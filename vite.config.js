import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true, // Puerto fijo: Si 5174 está ocupado, dará error
    host: true, // Permite acceso desde la red local
    hmr: {
      // Configuración HMR para mantener la conexión en Cursor
      clientPort: 5174,
      protocol: 'ws',
    },
    watch: {
      // Evitar que se recargue completamente en cambios
      usePolling: false,
    },
  },
})
