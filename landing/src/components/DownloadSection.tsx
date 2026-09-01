import { useState } from 'react'
import { useAppMeta, type Arch } from '@/hooks/useAppMeta'
import { useInView } from '@/hooks/useInView'

const archs: { arch: Arch; label: string; sub: string }[] = [
  { arch: 'arm64', label: 'Apple 芯片', sub: 'M1 / M2 / M3 / M4 系列' },
  { arch: 'x64', label: 'Intel 芯片', sub: '2020 年前的 Mac' },
]

export default function DownloadSection() {
  const { version, isMac, recommendedArch } = useAppMeta()
  const { ref, inView } = useInView<HTMLElement>('0px 0px -10% 0px')
  const [downloading, setDownloading] = useState<Arch | null>(null)

  const url = (arch: Arch) => `/downloads/LingGuang-${version}-${arch}.dmg`
  const onDownload = (arch: Arch) => {
    setDownloading(arch)
    window.setTimeout(() => setDownloading(null), 2400)
  }

  return (
    <section className="section download" id="download" ref={ref}>
      <div className="container">
        <h2 className={`section-title reveal ${inView ? 'in-view' : ''}`}>下载灵光</h2>
        <p className={`section-sub reveal ${inView ? 'in-view' : ''}`}>
          v{version} · macOS{!isMac && '（当前仅提供 macOS 版）'}
        </p>
        <div className="dl-grid">
          {archs.map(({ arch, label, sub }, i) => {
            const recommended = isMac && arch === recommendedArch
            return (
              <div
                key={arch}
                className={`dl-card reveal ${inView ? 'in-view' : ''} ${recommended ? 'dl-recommended' : ''}`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                {recommended && <span className="dl-badge">为你推荐</span>}
                <h3>macOS · {label}</h3>
                <p>{sub}</p>
                <a className="btn btn-primary btn-lg" href={url(arch)} download onClick={() => onDownload(arch)}>
                  {downloading === arch ? '开始下载…' : '下载 dmg'}
                </a>
              </div>
            )
          })}
        </div>
        <p className="dl-tip">
          未签名应用提示处理：安装后首次打开如被拦截，请在访达中对该应用「右键 → 打开」，
          或在「系统设置 → 隐私与安全性」中点击「仍要打开」。
        </p>
      </div>
    </section>
  )
}
