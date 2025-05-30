import { defineConfig } from 'vite';
import { resolve } from 'path';
// CRXプラグインが必要になったら以下のコメントを外してください
// import { crx } from '@crxjs/vite-plugin';
// import manifest from './public/manifest.json' assert { type: 'json' };

// https://vitejs.dev/config/
export default defineConfig({
  // CRXプラグインを使用する場合は以下のコメントを外してください
  // plugins: [crx({ manifest })],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        newtab: resolve(__dirname, 'src/pages/newtab/index.html'),
        background: resolve(__dirname, 'src/pages/background/index.ts'),
      },
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks: {
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/lang-markdown',
            '@codemirror/theme-one-dark',
          ],
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
    },
    emptyOutDir: true,
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
  },
});
