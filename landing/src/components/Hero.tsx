import { useEffect, useState } from 'react'
import { ParticleScroll } from '@/components/canvasui/ParticleScroll'
import { useAppMeta } from '@/hooks/useAppMeta'

export default function Hero() {
  const { version } = useAppMeta()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const content = (
    <section className="hero">
      <div className={`hero-glow ${mounted ? 'on' : ''}`} />
      <div className="container hero-inner">
        <p className={`hero-badge reveal ${mounted ? 'in-view' : ''}`}>v{version} · macOS 客户端</p>
        <h1 className="hero-title">
          <span className={`hero-line ${mounted ? 'in-view' : ''}`}>把繁琐的文件处理，</span>
          <span className={`hero-line hero-line-2 ${mounted ? 'in-view' : ''}`}>交给<em>灵光</em></span>
        </h1>
        <p className={`hero-sub reveal ${mounted ? 'in-view' : ''}`}>
          PDF、Word、图片、OCR、视频 —— 十款高频工具集于一身的桌面工具箱，全程本地处理，快且安心。
        </p>
        <div className={`hero-actions reveal ${mounted ? 'in-view' : ''}`}>
          <a className="btn btn-primary btn-lg" href="#download">立即下载</a>
          <a className="btn btn-ghost btn-lg" href="#tools">了解功能</a>
        </div>
      </div>
    </section>
  )

  return <ParticleScroll>{content}</ParticleScroll>
}
