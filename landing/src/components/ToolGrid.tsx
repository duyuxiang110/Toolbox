import { tools } from '@/data/tools'
import { useInView } from '@/hooks/useInView'
import ToolIcon from './ToolIcon'

export default function ToolGrid() {
  const { ref, inView } = useInView<HTMLHeadingElement>()
  const listCls = inView ? 'in-view' : ''

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">01 · Capabilities</p>
          <h2 ref={ref} className={`section-title reveal-left ${listCls}`}>十款工具，一个入口</h2>
          <p className="section-sub">桌面端随时唤起，覆盖你最高频的文件处理场景。</p>
        </div>
        <div className="tool-grid">
          {tools.map((t, i) => (
            <article key={t.key} className={`tool-card ${listCls}`} style={{ transitionDelay: `${Math.min(i * 70, 500)}ms` }}>
              <span className="tool-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="tool-icon"><ToolIcon name={t.icon} /></span>
              <h3>{t.title}</h3>
              <p>{t.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
