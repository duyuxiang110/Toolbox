import { lazy } from 'react'
import Navbar from './components/Navbar'
import SectionGate from './components/SectionGate'

const Hero = lazy(() => import('./components/Hero'))
const ToolGrid = lazy(() => import('./components/ToolGrid'))
const Highlights = lazy(() => import('./components/Highlights'))
const DownloadSection = lazy(() => import('./components/DownloadSection'))
const Footer = lazy(() => import('./components/Footer'))

export default function App() {
  return (
    <main className="page" id="top">
      <Navbar />
      <SectionGate minHeight={640}><Hero /></SectionGate>
      <SectionGate minHeight={720}><ToolGrid /></SectionGate>
      <SectionGate minHeight={640}><Highlights /></SectionGate>
      <SectionGate minHeight={560}><DownloadSection /></SectionGate>
      <SectionGate minHeight={100}><Footer /></SectionGate>
    </main>
  )
}
