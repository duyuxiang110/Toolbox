import { useEffect } from 'react'

/** 页面滚动发生在 ParticleScroll 内部容器而非 window，拦截 hash 锚点点击改用 scrollIntoView */
export function useHashScroll() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const a = target?.closest('a[href^="#"]')
      if (!a) return
      const id = a.getAttribute('href')!.slice(1)
      if (!id) return
      const el = document.getElementById(id)
      if (!el) return
      e.preventDefault()
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
}
