import { tools } from '@/data/tools'

const extras = ['全程本地处理', '双架构支持', '免费开源']

export default function Marquee() {
  const items = [...tools.map((t) => t.title), ...extras]
  return (
    <div className="marquee" aria-hidden>
      <div className="marquee-track">
        {[0, 1].map((k) => (
          <div className="marquee-group" key={k}>
            {items.map((s) => (
              <span className="marquee-item" key={s}>
                {s}
                <i>✦</i>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
