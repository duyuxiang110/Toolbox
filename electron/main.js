const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const path = require("path");
const si = require("systeminformation");
const { startServer, stopServer } = require("./server");

const isDev = !app.isPackaged;

let mainWindow;

// 单实例锁：必须在 whenReady 之前获取。未拿到锁说明已有实例在跑，直接退出。
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // 第二实例启动时，将焦点回到已有窗口
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    // frame: false, // 隐藏标题栏
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  // 注册协议，可以通过协议唤醒 myapp:// 打开应用
  app.setAsDefaultProtocolClient("myapp");

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // 启动内置 SSO API 服务器
  try {
    await startServer();
    console.log('[Main] SSO 后端服务已就绪');
  } catch (err) {
    console.error('[Main] SSO 后端启动失败:', err.message);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 应用退出前关闭服务器
app.on('before-quit', async () => {
  try {
    await stopServer();
  } catch (e) {
    // 忽略关闭时的错误
  }
});

const CPU_OVERLOAD_THRESHOLD = 50; // CPU 过载阈值 %

ipcMain.handle("get-system-stats", async () => {
  try {
    const [load, mem, temp] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpuTemperature(),
    ]);
    console.log(si, "si");
    const cpuLoad = Math.round(load.currentLoad);
    const usedMem = Math.round(mem.used / 1024 / 1024);
    const totalMem = Math.round(mem.total / 1024 / 1024);
    const memPercent = Math.round((mem.used / mem.total) * 100);
    const cpuTemp =
      temp.main !== null && temp.main !== -1 ? Math.round(temp.main) : null;
    console.log(
      cpuLoad,
      CPU_OVERLOAD_THRESHOLD,
      "cpuLoad > CPU_OVERLOAD_THRESHOLD",
    );
    // CPU 过载时弹窗通知
    if (cpuLoad > CPU_OVERLOAD_THRESHOLD) {
      new Notification({
        title: "⚠️ CPU 负载过高",
        body: `当前 CPU 使用率: ${cpuLoad}%
请检查是否有异常进程。`,
        urgency: "critical",
      }).show();
    }

    return {
      cpu: cpuLoad,
      memory: { used: usedMem, total: totalMem, percent: memPercent },
      temperature: cpuTemp,
      cpuCores: load.cpus.length,
    };
  } catch (error) {
    console.error("get-system-stats error:", error);
    return { error: error.message };
  }
});

// IPC handlers
ipcMain.handle("get-app-info", () => {
  return {
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
  };
});

//保存文件到桌面
ipcMain.handle(
  "save-file-to-desktop",
  async (event, content, fileName = "hello.txt") => {
    const fs = require("fs");
    console.log(fs, "fs");
    // const os = require("os");
    // const desktopPath = path.join(os.homedir(), "Desktop", fileName);

    // try {
    //   await fs.promises.writeFile(desktopPath, content, "utf-8");
    //   return { success: true, path: desktopPath };
    // } catch (error) {
    //   return { success: false, error: error.message };
    // }
  },
);
