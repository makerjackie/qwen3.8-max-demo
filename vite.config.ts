import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/qwen3.8-max-demo/',
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
})
