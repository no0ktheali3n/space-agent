const { contextBridge, ipcRenderer } = require("electron");

ipcRenderer.on("space-desktop:update-status", (_event, payload) => {
  window.dispatchEvent(new CustomEvent("space-desktop:update-status", {
    detail: payload
  }));
});

contextBridge.exposeInMainWorld("spaceDesktop", {
  platform: process.platform,
  getRuntimeInfo: () => ipcRenderer.invoke("space-desktop:get-runtime-info"),
  checkForUpdates: () => ipcRenderer.invoke("space-desktop:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("space-desktop:download-update"),
  installUpdate: () => ipcRenderer.invoke("space-desktop:install-update")
});
