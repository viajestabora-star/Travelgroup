import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true, // Puerto fijo: Si 5174 está ocupado, dará error
    host: true, // Permite acceso desde la red local
  },
})
