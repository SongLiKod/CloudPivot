import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 全局配置
 * Android 端打包 webDir 指向 vite 构建产物 dist
 */
const config: CapacitorConfig = {
  appId: 'com.cloudpivot.app',
  appName: '云枢 CloudPivot',
  webDir: 'dist',
  backgroundColor: '#111827',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#111827'
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#111827'
    },
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#111827',
      showSpinner: true,
      spinnerColor: '#22C55E'
    }
  },
  server: {
    androidScheme: 'https',
    cleartext: false
  }
}

export default config
