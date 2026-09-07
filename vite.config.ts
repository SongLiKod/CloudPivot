import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// CloudPivot 构建配置
// base 使用相对路径，保证 Electron(file://) 与 Capacitor(android://) 均可正确加载资源
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler'
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Blocked request. This host ("cp.pnt.cc.cd") is not allowed to be accessed  allowedHosts: ['cp.pnt.cc.cd']，allowedHosts: true 所有都可以访问
    allowedHosts: true,
    // Web 形态下浏览器直连 Cloudflare 会触发 CORS 拦截，统一走本地代理转发
    proxy: {
      '/cf-api': {
        target: 'https://api.cloudflare.com/client/v4',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cf-api/, '')
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          element: ['element-plus', '@element-plus/icons-vue'],
          vant: ['vant'],
          echarts: ['echarts'],
          editor: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/lint',
            '@codemirror/lang-javascript',
            '@codemirror/lang-json',
            '@codemirror/theme-one-dark'
          ]
        }
      }
    }
  }
})
