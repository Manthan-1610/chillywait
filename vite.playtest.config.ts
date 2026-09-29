import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

/** Lightweight Vite config for local game playtesting (no CRX). */
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5180,
    strictPort: true,
  },
});
