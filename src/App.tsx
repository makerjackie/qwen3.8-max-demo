import { lazy, Suspense, useState, useCallback, type CSSProperties } from 'react'
import type { ExperienceControls } from '~/components/ExperienceShell'

const experiences = [
  { id: 'magnetic-lines', title: '磁力线长什么样？', component: lazy(() => import('~/components/experiences/MagneticLines').then(m => ({ default: m.MagneticLines }))) },
  { id: 'lightning-lab', title: '闪电为什么是锯齿形的？', component: lazy(() => import('~/components/experiences/LightningLab').then(m => ({ default: m.LightningLab }))) },
  { id: 'pendulum-wave', title: '摆球为什么织出彩虹波浪？', component: lazy(() => import('~/components/experiences/PendulumWave').then(m => ({ default: m.PendulumWave }))) },
  { id: 'sandpile', title: '一粒沙如何引发雪崩？', component: lazy(() => import('~/components/experiences/Sandpile').then(m => ({ default: m.Sandpile }))) },
  { id: 'firefly-sync', title: '萤火虫为什么同时闪光？', component: lazy(() => import('~/components/experiences/FireflySync').then(m => ({ default: m.FireflySync }))) },
  { id: 'molecular-vibration', title: '分子为什么只在特定频率振动？', component: lazy(() => import('~/components/experiences/MolecularVibration').then(m => ({ default: m.MolecularVibration }))) },
  { id: 'voronoi-fracture', title: '玻璃裂纹为什么是这个形状？', component: lazy(() => import('~/components/experiences/VoronoiFracture').then(m => ({ default: m.VoronoiFracture }))) },
  { id: 'spirograph', title: '齿轮一转，万花绽放', component: lazy(() => import('~/components/experiences/Spirograph').then(m => ({ default: m.Spirograph }))) },
  { id: 'dendritic-crystal', title: '雪花为什么长成树枝状？', component: lazy(() => import('~/components/experiences/DendriticCrystal').then(m => ({ default: m.DendriticCrystal }))) },
  { id: 'fourier-epicycles', title: '任何曲线都能用旋转圆环画出？', component: lazy(() => import('~/components/experiences/FourierEpicycles').then(m => ({ default: m.FourierEpicycles }))) },
] as const

function useControls(): ExperienceControls {
  const [interacted, setInteracted] = useState(false)
  const [complete, setComplete] = useState(false)
  const registerInteraction = useCallback(() => setInteracted(true), [])
  const completeOnboarding = useCallback(() => setInteracted(true), [])
  const finish = useCallback(() => { setInteracted(true); setComplete(true) }, [])
  return { interacted, complete, registerInteraction, completeOnboarding, finish }
}

const navStyle: CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
  display: 'flex', gap: 4, padding: '8px 12px', overflowX: 'auto',
  background: 'rgba(8,10,16,0.92)', backdropFilter: 'blur(12px)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
}
const chipStyle = (active: boolean): CSSProperties => ({
  padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
  fontSize: 12, whiteSpace: 'nowrap', transition: 'all 0.15s',
  background: active ? '#ffd166' : 'rgba(255,255,255,0.08)',
  color: active ? '#0d1117' : 'rgba(255,255,255,0.7)',
  fontWeight: active ? 600 : 400,
})
const stageStyle: CSSProperties = {
  position: 'absolute', inset: 0, top: 44,
}

export function App() {
  const [activeIdx, setActiveIdx] = useState(0)
  const controls = useControls()
  const Active = experiences[activeIdx].component

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <nav style={navStyle}>
        {experiences.map((exp, i) => (
          <button key={exp.id} style={chipStyle(i === activeIdx)} onClick={() => setActiveIdx(i)}>
            {exp.title}
          </button>
        ))}
      </nav>
      <div style={stageStyle}>
        <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>加载中…</div>}>
          <Active controls={controls} />
        </Suspense>
      </div>
    </div>
  )
}
