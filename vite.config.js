import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If you deploy to a custom domain (e.g. yourdomain.com), set base: '/'
export default defineConfig({
  plugins: [react()],
  base: '/voltorb-flip-solver/',
})
