import { useEffect, useRef, useState } from 'react'

/** 元素进入视口（提前 margin）后置 true；once=true 后不再回退 */
export function useInView<T extends HTMLElement>(
  rootMargin = '0px',
  once = true,
) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin, once])

  return { ref, inView }
}
