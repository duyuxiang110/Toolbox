import { Grid } from '@/components/canvasui/Grid'
import { tools } from '@/data/tools'
import ToolIcon from './ToolIcon'
import { useInView } from '@/hooks/useInView'

export default function ToolGrid() {
  const { ref, inView } = useInView<HTMLElement>('0px 0px -8% 0px')

  return (
    <section className="section" ref={ref}>
      <div className="container">
        <h2 className={`section-title reveal ${inView ? 'in-view' : ''}`}>十大工具，一个客户端</h2>
        <p className={`section-sub reveal ${inView ? 'in-view' : ''}`}>覆盖文档、图片、识别与视频的日常高频操作</p>
        <div className="tool-grid-wrap">
          <Grid className="tool-grid-canvas">
            <div className="tool-grid">
              {tools.map((t, i) => (
                <article
                  key={t.key}
                  className={`tool-card reveal ${inView ? 'in-view' : ''}`}
                  style={{ transitionDelay: `${Math.min(i * 60, 480)}ms` }}
                >
                  <span className="tool-icon"><ToolIcon name={t.icon} /></span>
                  <h3>{t.title}</h3>
                  <p>{t.desc}</p>
                </article>
              ))}
            </div>
          </Grid>
        </div>
      </div>
    </section>
  )
}
