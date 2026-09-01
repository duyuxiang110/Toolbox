import { useEffect, useState } from 'react'

export type Arch = 'arm64' | 'x64'
export interface AppMeta {
  version: string
  isMac: boolean
  recommendedArch: Arch
}

/** 模块级缓存：多处调用 useAppMeta 共享同一次 fetch 与探测结果 */
let metaPromise: Promise<{ version: string; arch: Arch }> | null = null

function loadMeta() {
  if (!metaPromise) {
    const versionP = fetch('/version.json')
      .then((r) => r.json())
      .then((d: { version: string }) => d.version)
      .catch(() => '1.0.1')

    const nav = navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues(hints: string[]): Promise<{ architecture?: string; platform?: string }>
      }
    }
    const archP = nav.userAgentData?.getHighEntropyValues
      ? nav.userAgentData
          .getHighEntropyValues(['architecture', 'platform'])
          .then((v) =>
            v.architecture && v.architecture.toLowerCase().includes('arm') ? ('arm64' as Arch) : ('x64' as Arch),
          )
          .catch(() => 'arm64' as Arch)
      : Promise.resolve('arm64' as Arch)

    metaPromise = Promise.all([versionP, archP]).then(([version, arch]) => ({ version, arch }))
  }
  return metaPromise
}

/** 拉取版本号；探测平台，默认推荐 Apple 芯片（当前主流） */
export function useAppMeta(): AppMeta {
  const [meta, setMeta] = useState<{ version: string; arch: Arch }>({ version: '1.0.1', arch: 'arm64' })

  useEffect(() => {
    let alive = true
    loadMeta().then((m) => {
      if (alive) setMeta(m)
    })
    return () => {
      alive = false
    }
  }, [])

  const isMac = /Mac/i.test(navigator.userAgent)
  return { version: meta.version, isMac, recommendedArch: meta.arch }
}
