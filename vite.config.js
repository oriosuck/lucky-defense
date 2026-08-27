import { defineConfig } from 'vite';

// 정적 SPA 빌드: 서버/DB 없음, base는 정적 호스팅 루트 기준
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
});
