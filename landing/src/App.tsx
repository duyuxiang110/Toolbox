import { lazy } from 'react'
import { Liquid } from '@/components/canvasui/Liquid'
import { ParticleScroll } from '@/components/canvasui/ParticleScroll'
import Navbar from './components/Navbar'
import SectionGate from './components/SectionGate'
import { useHashScroll } from '@/hooks/useHashScroll'

const Hero = lazy(() => import('./components/Hero'))
const Marquee = lazy(() => import('./components/Marquee'))
const ToolGrid = lazy(() => import('./components/ToolGrid'))
const Highlights = lazy(() => import('./components/Highlights'))
const DownloadSection = lazy(() => import('./components/DownloadSection'))
const Footer = lazy(() => import('./components/Footer'))

export default function App() {
  useHashScroll();
  // radius	0.3	0.15	拖尾光斑半径减半
  // force	1.1	0.55	划动力度减半
  // distortion	0.4	0.22	内容扭曲强度减半
  // blend	5	2.4	颜色覆盖强度减半
  // intensity	2	1.5	拖尾亮度减弱
  return (
    <Liquid
      radius={0.15}
      force={0.55}
      distortion={0.22}
      blend={2.4}
      intensity={1.5}
      style={{ height: "100dvh" }}
    >
      <ParticleScroll style={{ height: "100%" }}>
        <main className="page" id="top">
          <Navbar />
          <SectionGate minHeight={640}>
            <Hero />
          </SectionGate>
          <SectionGate minHeight={80}>
            <Marquee />
          </SectionGate>
          <SectionGate id="tools" minHeight={720}>
            <ToolGrid />
          </SectionGate>
          <SectionGate id="highlights" minHeight={640}>
            <Highlights />
          </SectionGate>
          <SectionGate id="download" minHeight={560}>
            <DownloadSection />
          </SectionGate>
          <SectionGate minHeight={100}>
            <Footer />
          </SectionGate>
        </main>
      </ParticleScroll>
    </Liquid>
  );
}
