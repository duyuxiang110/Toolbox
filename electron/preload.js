const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  onPlatformInfo: (callback) =>
    ipcRenderer.on("platform-info", (_event, data) => callback(data)),
  saveFileToDesktop: (content) =>
    ipcRenderer.invoke("save-file-to-desktop", content),
  getSystemStats: () => ipcRenderer.invoke("get-system-stats"),
});
