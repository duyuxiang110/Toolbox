import { highlights, type Highlight } from '@/data/tools'
import { useInView } from '@/hooks/useInView'

function HighlightRow({ h, index }: { h: Highlight; index: number }) {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -10% 0px')
  const side = index % 2 === 0 ? 'reveal-left' : 'reveal-right'
  return (
    <div ref={ref} className={`highlight-row ${side} ${inView ? 'in-view' : ''}`}>
      <div className="highlight-copy">
        <span className="highlight-index">{String(index + 1).padStart(2, '0')}</span>
        <h3>{h.title}</h3>
        <p>{h.desc}</p>
      </div>
      <div className="highlight-panel">
        <div className="highlight-orb" />
        <span className="highlight-glyph">{h.title.slice(0, 2)}</span>
      </div>
    </div>
  )
}

export default function Highlights() {
  return (
    <section className="section" id="highlights">
      <div className="container">
        {highlights.map((h, i) => (
          <HighlightRow key={h.title} h={h} index={i} />
        ))}
      </div>
    </section>
  )
}
