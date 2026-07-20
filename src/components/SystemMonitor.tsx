import { useEffect, useState, useCallback, useRef } from "react"

const CPU_THRESHOLD = 50

interface SystemStats {
  cpu: number
  memory: { used: number; total: number; percent: number }
  temperature: number | null
  cpuCores: number
}

function Gauge({ label, value, unit, color }: { label: string; value: number; unit: string; color?: string }) {
  const barColor =
    color || (value > 80 ? "#ef4444" : value > 50 ? "#f59e0b" : "#22c55e")

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {value}{unit}
        </span>
      </div>
      <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.min(value, 100)}%`,
            height: "100%",
            background: barColor,
            borderRadius: 4,
            transition: "width 0.5s ease, background 0.5s ease",
          }}
        />
      </div>
    </div>
  )
}

/** 右上角滑动弹出式通知，3.5 秒后自动消失 */
function ToastNotification({
  message,
  visible,
  onClose,
}: {
  message: string
  visible: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onClose, 3500)
      return () => clearTimeout(timer)
    }
  }, [visible, onClose])

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        borderRadius: 10,
        padding: "14px 18px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        maxWidth: 360,
        transition: "all 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(120%)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#dc2626", marginBottom: 2 }}>
          CPU 负载过高
        </div>
        <div style={{ fontSize: 13, color: "#b91c1c", lineHeight: 1.4 }}>
          {message}
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 16,
          color: "#9ca3af",
          padding: 0,
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  )
}

export default function SystemMonitor() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string>("")
  const [overloaded, setOverloaded] = useState(false)
  const [toastMsg, setToastMsg] = useState<string>("")
  const [toastVisible, setToastVisible] = useState(false)
  const notifiedRef = useRef(false)

  const fetchStats = useCallback(async () => {
    if (!window.electronAPI) {
      setError("非 Electron 环境")
      return
    }
    try {
      const data = await window.electronAPI.getSystemStats()
      if ("error" in data) {
        setError((data as { error: string }).error)
        return
      }
      const s = data as SystemStats
      setStats(s)
      setError(null)
      setLastUpdated(new Date().toLocaleTimeString())

      if (s.cpu > CPU_THRESHOLD) {
        setOverloaded(true)
        if (!notifiedRef.current) {
          notifiedRef.current = true
          setToastMsg(`当前 CPU 使用率: ${s.cpu}%`)
          setToastVisible(true)
        }
      } else {
        setOverloaded(false)
        notifiedRef.current = false
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const timer = setInterval(fetchStats, 2000)
    return () => clearInterval(timer)
  }, [fetchStats])

  if (error) {
    return (
      <div style={{ padding: 12, color: "#6b7280", fontSize: 13 }}>
        系统监控: {error}
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={{ padding: 12, color: "#6b7280", fontSize: 13 }}>
        系统监控: 加载中...
      </div>
    )
  }

  return (
    <>
      {/* 滑动弹出的 toast 通知 */}
      <ToastNotification
        message={toastMsg}
        visible={toastVisible}
        onClose={() => setToastVisible(false)}
      />

      <div style={{ position: "relative" }}>
        {/* 常驻红色横幅 */}
        {overloaded && (
          <div
            style={{
              background: "#fef2f2",
              border: "2px solid #ef4444",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          >
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, color: "#dc2626", fontSize: 14 }}>
                CPU 负载过高
              </div>
              <div style={{ color: "#b91c1c", fontSize: 13 }}>
                当前 CPU 使用率: {stats.cpu}% (阈值: {CPU_THRESHOLD}%)
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            background: "#f9fafb",
            borderRadius: 8,
            padding: "16px 20px",
            border: overloaded ? "2px solid #ef4444" : "1px solid #e5e7eb",
            transition: "border-color 0.3s ease",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            minWidth: 280,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>
              系统监控
            </h3>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {lastUpdated}
            </span>
          </div>

          <Gauge label="CPU 使用率" value={stats.cpu} unit="%" />
          <Gauge
            label="内存使用"
            value={stats.memory.percent}
            unit={`% (${stats.memory.used}MB / ${stats.memory.total}MB)`}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>CPU 温度</span>
            <span style={{ fontWeight: 600 }}>
              {stats.temperature !== null ? `${stats.temperature}°C` : "N/A"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
            CPU 核心数: {stats.cpuCores}
          </div>
        </div>
      </div>
    </>
  )
}
