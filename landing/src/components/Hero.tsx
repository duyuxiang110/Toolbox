import { useEffect, useState } from 'react'
import { useAppMeta } from '@/hooks/useAppMeta'
import { tools } from '@/data/tools'
import ToolIcon from './ToolIcon'

export default function Hero() {
  const { version } = useAppMeta()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const cls = (base: string) => `${base} ${mounted ? 'in-view' : ''}`

  return (
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <p className={`eyebrow reveal ${mounted ? 'in-view' : ''}`}>Lingguang · macOS Toolbox</p>
          <h1 className="hero-title">
            <span className={cls('hero-line')}>把繁琐的文件处理，</span>
            <span className={cls('hero-line hero-line-2')}>交给<em>灵光</em></span>
          </h1>
          <p className={`hero-sub reveal ${mounted ? 'in-view' : ''}`}>
            PDF、Word、图片、OCR、视频 —— 十款高频工具集于一身的桌面工具箱。
            文件全程留在你的电脑上，快，且安心。
          </p>
          <div className={`hero-actions reveal ${mounted ? 'in-view' : ''}`}>
            <a className="btn btn-primary btn-lg" href="#download">立即下载</a>
            <a className="btn btn-ghost btn-lg" href="#tools">了解功能</a>
          </div>
          <ul className={`hero-stats reveal ${mounted ? 'in-view' : ''}`}>
            <li><strong>10</strong><span>款高频工具</span></li>
            <li><strong>100%</strong><span>本地处理</span></li>
            <li><strong>2</strong><span>种 Mac 架构</span></li>
          </ul>
        </div>

        <div className={`hero-visual reveal ${mounted ? 'in-view' : ''}`}>
          <div className="app-window">
            <div className="app-titlebar">
              <span className="dot dot-r" />
              <span className="dot dot-y" />
              <span className="dot dot-g" />
              <span className="app-name">LINGGUANG — v{version}</span>
            </div>
            <div className="app-body">
              {tools.slice(0, 6).map((t) => (
                <span className="app-chip" key={t.key}>
                  <i><ToolIcon name={t.icon} /></i>
                  {t.title}
                </span>
              ))}
            </div>
          </div>
          <span className="float-chip chip-a">● 全程本地</span>
          <span className="float-chip chip-b">v{version} · arm64 / x64</span>
        </div>
      </div>
      <div className="hero-beam" />
    </section>
  )
}
