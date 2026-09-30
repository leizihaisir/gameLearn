import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 核心逻辑不依赖 DOM，跑在 node 环境即可
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
