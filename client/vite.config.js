import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // 开发时把 /api 转发到后端，前端代码里不用写完整域名
    proxy: {
      '/api': {
        target: 'http://localhost:5178',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // 产物交给后端静态托管，后端用 fileURLToPath 解析相对路径
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    globals: true,
  },
});
