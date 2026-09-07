/**
 * 云枢 CloudPivot preload：暴露 window.cloudpivot 桥接层
 * 仅暴露白名单 IPC 通道，不暴露 Node 能力
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cloudpivot', {
  platform: 'electron',
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    hideToTray: () => ipcRenderer.invoke('window:hideToTray')
  },
  fs: {
    saveFile: (opts) => ipcRenderer.invoke('fs:saveFile', opts),
    openFile: (opts) => ipcRenderer.invoke('fs:openFile', opts),
    pickDirectory: () => ipcRenderer.invoke('fs:pickDirectory'),
    readFileBuffer: (filePath) => ipcRenderer.invoke('fs:readFileBuffer', filePath),
    writeFileBuffer: (filePath, data) => ipcRenderer.invoke('fs:writeFileBuffer', filePath, data),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath)
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo')
  },
  setNativeTheme: (theme) => ipcRenderer.invoke('theme:setNativeTheme', theme)
})