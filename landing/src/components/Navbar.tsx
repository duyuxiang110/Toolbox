import { useEffect, useState } from 'react'

const links = [
  { href: '#tools', label: '功能' },
  { href: '#highlights', label: '亮点' },
  { href: '#download', label: '下载' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`navbar ${scrolled ? 'navbar-solid' : ''}`}>
      <div className="container navbar-inner">
        <a className="brand" href="#top">
          <span className="brand-mark">灵</span>
          <span>灵光</span>
        </a>
        <nav className="nav-links">
          {links.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </nav>
        <a className="btn btn-primary btn-sm" href="#download">下载客户端</a>
      </div>
    </header>
  )
}
