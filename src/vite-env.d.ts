/// <reference types="vite/client" />

interface ElectronAPI {
  getAppInfo: () => Promise<{
    electronVersion: string
    nodeVersion: string
    chromeVersion: string
    platform: string
    arch: string
  }>
  getSystemStats: () => Promise<{
    cpu: number
    memory: { used: number; total: number; percent: number }
    temperature: number | null
    cpuCores: number
  }>
  saveFileToDesktop: (content: string, fileName?: string) => Promise<{ success: boolean; path?: string; error?: string }>
  onPlatformInfo: (callback: (data: unknown) => void) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
