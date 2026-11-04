import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import problemIndex from './scripts/problem-index-plugin.js'

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), problemIndex()],
  build: {
    // the Firebase sync chunk (~560 kB, ~170 kB gzipped) loads in the background only when sync is configured
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // React and the router change rarely, so they get their own long-cached chunk.
        codeSplitting: {
          groups: [{ name: 'vendor', test: /node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler)[\/]/ }],
        },
      },
    },
  },
})
