import { useAppMeta } from '@/hooks/useAppMeta'
import { useInView } from '@/hooks/useInView'

function DlCard({ arch, hint, recommended, url, listCls }: {
  arch: string; hint: string; recommended: boolean; url: string; listCls: string
}) {
  return (
    <div className={`dl-card reveal ${listCls} ${recommended ? 'dl-recommended' : ''}`}>
      {recommended && <span className="dl-badge">推荐</span>}
      <h3>macOS · {arch}</h3>
      <p>{hint}</p>
      <a className="btn btn-primary" href={url}>下载安装包</a>
    </div>
  )
}

export default function DownloadSection() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -8% 0px')
  const listCls = inView ? 'in-view' : ''
  const { version, isMac, recommendedArch } = useAppMeta()

  const url = (arch: string) => `/downloads/LingGuang-${version}-${arch}.dmg`

  return (
    <section className="section">
      <div className="container">
        <div ref={ref} className="dl-panel">
          <p className={`eyebrow reveal ${listCls}`}>03 · Download</p>
          <h2 className={`section-title reveal ${listCls}`}>选择你的芯片架构</h2>
          <p className="section-sub">安装后从「启动台」打开即可使用，两种架构均提供。</p>
          <div className="dl-grid">
            <DlCard
              arch="Apple 芯片 (arm64)"
              hint="M1 / M2 / M3 / M4 系列"
              recommended={isMac && recommendedArch === 'arm64'}
              url={url('arm64')}
              listCls={listCls}
            />
            <DlCard
              arch="Intel (x64)"
              hint="2020 年前的旧款 Mac"
              recommended={isMac && recommendedArch === 'x64'}
              url={url('x64')}
              listCls={listCls}
            />
          </div>
          <p className="dl-tip">
            首次打开如提示「无法验证开发者」：右键点击应用图标 → 选择「打开」，或在
            「系统设置 → 隐私与安全性」中点击「仍要打开」。
          </p>
        </div>
      </div>
    </section>
  )
}
