const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const si = require("systeminformation");

const isDev = !app.isPackaged;

let mainWindow;
let tray = null;

// 解析随包资源路径：开发环境取项目 build/，打包后取 resources/build/
function getAssetPath(...paths) {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "build")
    : path.join(__dirname, "..", "build");
  return path.join(base, ...paths);
}

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
    title: "灵光",
    icon: getAssetPath("icon.png"),
    // titleBarStyle: 'hidden',
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

// 创建系统托盘
function createTray() {
  if (tray) return;
  const trayImg = nativeImage.createFromPath(getAssetPath("tray.png"));
  tray = new Tray(trayImg);
  tray.setToolTip("灵光");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示主界面",
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "退出灵光",
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  // 单击托盘图标切换主窗口显隐
  tray.on("click", () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
}

app.whenReady().then(async () => {
  createWindow();
  createTray();

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
