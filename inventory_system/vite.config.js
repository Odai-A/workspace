import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5174,
    // Electron dev flow expects this exact port (desktop:dev / desktop:attach).
    strictPort: true,
    watch: {
      // Prevent HMR loops and terminal spam when desktop build outputs are written.
      ignored: ['**/release/**', '**/dist/**', '**/win-unpacked/**', '**/.cursor/**'],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || process.env.VITE_API_URL || 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
