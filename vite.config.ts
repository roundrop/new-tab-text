import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  
  return {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    define: {
      // 開発環境判定用のグローバル変数
      __DEV__: isDev,
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
          assetFileNames: (assetInfo) => {
            // manifest.jsonはスクリプトで処理するので、除外
            if (assetInfo.name === 'manifest.json') {
              return '[name].[ext]';
            }
            return 'assets/[name].[hash].[ext]';
          },
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
      // 環境別設定
      minify: isDev ? false : 'terser',
      terserOptions: isDev ? undefined : {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      emptyOutDir: true,
      outDir: 'dist',
      sourcemap: isDev, // 開発時のみ
      watch: isDev ? {} : undefined, // 開発時のみファイル監視
    },
    server: {
      hmr: false, // HMRを無効（拡張機能では不要）
    },
  };
});
