import { Suspense, type ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'

/** 滚动到视口附近（提前 200px）才挂载子组件，实现“滚到哪加载到哪” */
export default function SectionGate({
  children,
  minHeight = 320,
  id,
}: {
  children: ReactNode
  minHeight?: number
  id?: string
}) {
  const { ref, inView } = useInView<HTMLDivElement>('200px 0px')
  return (
    <div id={id} ref={ref} style={{ minHeight }}>
      {inView ? <Suspense fallback={null}>{children}</Suspense> : null}
    </div>
  )
}
