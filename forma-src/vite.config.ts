import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), {
    name: 'forma-html', transformIndexHtml(html: string) {
      const web = mode === 'web';
      return html.replace('<!--GATE-->', web ? '<script src="/sotka/gate.js"></script>' : '')
        .replace('<!--HUB-->', web ? '<script src="/sotka/hub.js" defer></script>' : '');
    },
  }],
  build: { outDir: mode === 'web' ? 'dist-web' : 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 3000, target: 'es2020' },
  test: { environment: 'node' },
}));
