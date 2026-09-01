import { useEffect, useState } from 'react'

export type Arch = 'arm64' | 'x64'
export interface AppMeta {
  version: string
  isMac: boolean
  recommendedArch: Arch
}

/** 拉取版本号；探测平台，默认推荐 Apple 芯片（当前主流） */
export function useAppMeta(): AppMeta {
  const [version, setVersion] = useState('1.0.1')
  const [arch, setArch] = useState<Arch>('arm64')

  useEffect(() => {
    fetch('/version.json')
      .then((r) => r.json())
      .then((d: { version: string }) => setVersion(d.version))
      .catch(() => undefined)

    const nav = navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues(hints: string[]): Promise<{ architecture?: string; platform?: string }>
      }
    }
    const uaData = nav.userAgentData
    if (uaData?.getHighEntropyValues) {
      uaData
        .getHighEntropyValues(['architecture', 'platform'])
        .then((v) => {
          if (v.architecture) setArch(v.architecture.toLowerCase().includes('arm') ? 'arm64' : 'x64')
        })
        .catch(() => undefined)
    }
  }, [])

  const isMac = /Mac/i.test(navigator.userAgent)
  return { version, isMac, recommendedArch: arch }
}
