import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 2048,
    rollupOptions: {
      // 2 entry, dùng chung 1 bundle JS/CSS: bản VI không tải lại three
      input: { main: 'index.html', vi: 'index.vi.html' },
      output: {
        // three nằm ở chunk riêng -> cache lâu dài, không bị invalidate khi sửa site code
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
