import { defineConfig } from 'vite';

export default defineConfig({
  // 相对基础路径，方便把 dist 直接丢到任意静态目录下打开
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});
