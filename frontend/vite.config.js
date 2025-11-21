import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy lets the browser talk to the HTTPS backend without trusting the self-signed cert.
const proxyTarget = process.env.VITE_PROXY_TARGET || 'https://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
