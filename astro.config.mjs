import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';

const isDevCommand = process.argv.includes('dev');

export default defineConfig({
  integrations: [react(), ...(isDevCommand ? [keystatic()] : [])],
  output: 'static',
  devToolbar: { enabled: false },
  vite: {
    optimizeDeps: {
      include: ['maplibre-gl'],
      esbuildOptions: {
        target: 'esnext'
      }
    }
  }
});
