import { lazy } from 'react'
import Navbar from './components/Navbar'
import SectionGate from './components/SectionGate'

const Hero = lazy(() => import('./components/Hero'))

export default function App() {
  return (
    <main className="page" id="top">
      <Navbar />
      <SectionGate minHeight={640}>
        <Hero />
      </SectionGate>
    </main>
  )
}
