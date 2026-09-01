import { highlights } from '@/data/tools'
import { useInView } from '@/hooks/useInView'

function HighlightRow({ index, title, desc, glyph }: { index: number; title: string; desc: string; glyph: string }) {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -8% 0px')
  return (
    <div ref={ref} className="highlight-row">
      <span className={`highlight-index reveal-left ${inView ? 'in-view' : ''}`}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className={`highlight-copy reveal ${inView ? 'in-view' : ''}`}>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <div className={`highlight-panel reveal-right ${inView ? 'in-view' : ''}`}>
        <div className="highlight-orb" />
        <span className="highlight-glyph">{glyph}</span>
      </div>
    </div>
  )
}

export default function Highlights() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">02 · Why Lingguang</p>
          <h2 className="section-title">为什么选择灵光</h2>
          <p className="section-sub">不只是一个工具合集，而是一套更安心的工作方式。</p>
        </div>
        <div className="highlight-list">
          {highlights.map((h, i) => (
            <HighlightRow key={h.title} index={i} title={h.title} desc={h.desc} glyph={h.title.slice(0, 2)} />
          ))}
        </div>
      </div>
    </section>
  )
}
