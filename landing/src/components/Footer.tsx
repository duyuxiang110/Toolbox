import { useAppMeta } from '@/hooks/useAppMeta'
import { useInView } from '@/hooks/useInView'

export default function Footer() {
  const { version } = useAppMeta()
  const { ref, inView } = useInView<HTMLElement>()
  return (
    <footer className={`footer reveal ${inView ? 'in-view' : ''}`} ref={ref}>
      <div className="container footer-inner">
        <span>灵光 · 一站式桌面实用工具箱</span>
        <span>v{version} · © {new Date().getFullYear()} LingGuang</span>
      </div>
    </footer>
  )
}
