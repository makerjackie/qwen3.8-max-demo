import './styles/FireflySync.css'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowCounterClockwise, Play, Pause, Question, X, Trophy } from '@phosphor-icons/react'

import type { ExperienceControls } from '~/components/ExperienceShell'
import { GuideTour, type GuideStep } from '~/components/experiences/GuideTour'
import { GhostHint } from '~/components/experiences/GhostHint'
import { useExperienceI18n } from '~/i18n/experience'

const CYAN = '#4dd0e1'
const YELLOW = '#ffd166'
const PURPLE = '#b15cff'
const RED = '#ff6b6b'
const FLASH_COLOR = '#ccff00'

const N = 400
const BASE_FREQ = 1.0 // cycles per second

type Firefly = { x: number; y: number; phase: number; freq: number; vx: number; vy: number }

function initFireflies(w: number, h: number, freqVar: number): Firefly[] {
  const arr: Firefly[] = []
  for (let i = 0; i < N; i++) {
    arr.push({
      x: Math.random() * w,
      y: Math.random() * h * 0.85,
      phase: Math.random(),
      freq: BASE_FREQ + (Math.random() - 0.5) * freqVar,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
    })
  }
  return arr
}

function orderParameter(flies: Firefly[]): number {
  let re = 0
  let im = 0
  for (const f of flies) {
    const a = 2 * Math.PI * f.phase
    re += Math.cos(a)
    im += Math.sin(a)
  }
  return Math.sqrt(re * re + im * im) / flies.length
}

export function FireflySync({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [running, setRunning] = useState(true)
  const [whyOpen, setWhyOpen] = useState(false)
  const [hud, setHud] = useState({ R: 0, count: N, syncPct: 0 })
  const [coupling, setCoupling] = useState(0.04)
  const [radius, setRadius] = useState(80)
  const [freqVar, setFreqVar] = useState(0.15)
  const finishedRef = useRef(false)
  const aboveSinceRef = useRef<number | null>(null)
  const interactedRef = useRef(false)

  const st = useRef({
    flies: null as Firefly[] | null,
    running: true,
    coupling: 0.04,
    radius: 80,
    freqVar: 0.15,
    lastNow: 0,
    hoverX: -1,
    hoverY: -1,
  })
  st.current.running = running
  st.current.coupling = coupling
  st.current.radius = radius
  st.current.freqVar = freqVar

  const markInteraction = useCallback(() => {
    if (!interactedRef.current) {
      interactedRef.current = true
      controls.registerInteraction()
    }
  }, [controls])

  useEffect(() => {
    controls.completeOnboarding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls])

  const resetSim = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    st.current.flies = initFireflies(w, h, st.current.freqVar)
    finishedRef.current = false
    aboveSinceRef.current = null
    setHud({ R: 0, count: N, syncPct: 0 })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let hudTick = 0

    const frame = (now: number) => {
      const s = st.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (!s.flies) s.flies = initFireflies(w, h, s.freqVar)
      const flies = s.flies
      const dt = s.lastNow ? Math.min((now - s.lastNow) / 1000, 0.05) : 0
      s.lastNow = now

      // Physics
      if (s.running && dt > 0) {
        const eps = s.coupling
        const r2 = s.radius * s.radius
        for (let i = 0; i < flies.length; i++) {
          const f = flies[i]
          f.phase += f.freq * dt
          // Drift
          f.x += f.vx * dt
          f.y += f.vy * dt
          if (f.x < 0 || f.x > w) f.vx *= -1
          if (f.y < 0 || f.y > h * 0.88) f.vy *= -1
          f.x = Math.max(0, Math.min(w, f.x))
          f.y = Math.max(0, Math.min(h * 0.88, f.y))
          if (Math.random() < 0.01) { f.vx += (Math.random() - 0.5) * 2; f.vy += (Math.random() - 0.5) * 2 }

          if (f.phase >= 1) {
            f.phase -= 1
            // Pulse coupling: nudge neighbors
            for (let j = 0; j < flies.length; j++) {
              if (i === j) continue
              const dx = flies[j].x - f.x
              const dy = flies[j].y - f.y
              if (dx * dx + dy * dy < r2) {
                flies[j].phase = Math.min(flies[j].phase + eps, 0.999)
              }
            }
          }
        }
      }

      const R = orderParameter(flies)

      // Challenge: R > 0.9 for 2 seconds
      if (R > 0.9) {
        if (aboveSinceRef.current === null) aboveSinceRef.current = now
        else if (now - aboveSinceRef.current > 2000 && !finishedRef.current) {
          finishedRef.current = true
          markInteraction()
          controls.finish()
        }
      } else {
        aboveSinceRef.current = null
      }

      // HUD update (throttled)
      hudTick += dt
      if (hudTick > 0.15) {
        hudTick = 0
        setHud({ R, count: N, syncPct: Math.round(R * 100) })
      }

      // ---- Draw ----
      ctx.fillStyle = '#0a1a0a'
      ctx.fillRect(0, 0, w, h)

      // Tree silhouettes
      ctx.fillStyle = 'rgba(5,20,5,0.9)'
      const treeW = w / 7
      for (let i = 0; i < 8; i++) {
        const tx2 = i * treeW - treeW * 0.3
        const th = h * (0.12 + (i % 3) * 0.05)
        ctx.beginPath()
        ctx.moveTo(tx2, h)
        ctx.lineTo(tx2 + treeW * 0.5, h - th)
        ctx.lineTo(tx2 + treeW, h)
        ctx.closePath()
        ctx.fill()
      }

      // Coupling radius on hover
      if (s.hoverX >= 0) {
        ctx.strokeStyle = 'rgba(177,92,255,0.25)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.arc(s.hoverX, s.hoverY, s.radius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Fireflies
      for (const f of flies) {
        let brightness = 0
        if (f.phase >= 0.88) brightness = 1
        else if (f.phase >= 0.6) brightness = (f.phase - 0.6) / 0.28 * 0.5

        if (brightness > 0.8) {
          // Full flash: outer glow + bright core
          ctx.shadowColor = FLASH_COLOR
          ctx.shadowBlur = 24
          ctx.fillStyle = 'rgba(204,255,0,0.25)'
          ctx.beginPath()
          ctx.arc(f.x, f.y, 9, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = FLASH_COLOR
          ctx.beginPath()
          ctx.arc(f.x, f.y, 4.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,240,0.9)'
          ctx.beginPath()
          ctx.arc(f.x, f.y, 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        } else if (brightness > 0.05) {
          ctx.fillStyle = `rgba(204,255,0,${(brightness * 0.8).toFixed(2)})`
          ctx.beginPath()
          ctx.arc(f.x, f.y, 3.5, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillStyle = 'rgba(100,150,70,0.5)'
          ctx.beginPath()
          ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Order parameter bar (top center)
      const barW = Math.min(220, w * 0.4)
      const barX = w / 2 - barW / 2
      const barY = 18
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath(); ctx.roundRect(barX, barY, barW, 7, 3.5); ctx.fill()
      ctx.fillStyle = R > 0.9 ? CYAN : R < 0.3 ? RED : CYAN
      ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(5, barW * R), 7, 3.5); ctx.fill()
      ctx.fillStyle = R > 0.9 ? CYAN : 'rgba(203,213,225,0.8)'
      ctx.font = '700 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`R = ${R.toFixed(3)}`, w / 2, barY + 22)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    markInteraction()
    const canvas = canvasRef.current
    if (!canvas || !st.current.flies) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const r2 = 100 * 100
    for (const f of st.current.flies) {
      const dx = f.x - px
      const dy = f.y - py
      if (dx * dx + dy * dy < r2) {
        f.phase = Math.random()
      }
    }
  }, [markInteraction])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    st.current.hoverX = e.clientX - rect.left
    st.current.hoverY = e.clientY - rect.top
  }, [])

  const onPointerLeave = useCallback(() => {
    st.current.hoverX = -1
    st.current.hoverY = -1
  }, [])

  const guideSteps: Array<GuideStep> = [
    {
      title: tx('观察同步涌现'),
      body: tx('数百只萤火虫各自闪烁，但通过「看到邻居闪光就微调自己的时钟」这一简单规则，它们会自发同步成一个整体脉冲。'),
    },
    {
      target: '.firefly-canvas',
      title: tx('点击制造干扰'),
      body: tx('点击画面任意位置，像天敌惊扰一样打散附近萤火虫的相位——然后看同步如何重新涌现。'),
      awaitInteraction: true,
    },
    {
      target: '.firefly-controls',
      title: tx('调节耦合参数'),
      body: tx('增大耦合强度或感知半径可加速同步；增大频率差异则让同步更困难。试试让 R 突破 0.9！'),
    },
  ]

  return (
    <div className="oss-experience firefly-experience">
      <canvas
        ref={canvasRef}
        className="firefly-canvas"
        onClick={onCanvasClick}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={{ cursor: 'crosshair', touchAction: 'none' }}
      />

      <header className="firefly-question">
        <h1>{tx('为什么千百只萤火虫能同时闪烁？')}</h1>
        <p>{tx('没有指挥者，没有乐谱——每只萤火虫只做一件事：看到邻居闪光，就把自己的时钟往前拨一点点。')}</p>
        <button type="button" className="firefly-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}</button>
      </header>

      <aside className="firefly-readout">
        <div className="firefly-readout-row">
          <small>{tx('同步指数 R')}</small>
          <strong className={hud.R > 0.9 ? 'is-cyan' : hud.R < 0.3 ? 'is-red' : 'is-cyan'}>{hud.R.toFixed(3)}</strong>
        </div>
        <div className="firefly-readout-row">
          <small>{tx('萤火虫数量')}</small>
          <strong>{hud.count}</strong>
        </div>
        <div className="firefly-readout-row">
          <small>{tx('同步率')}</small>
          <strong className="is-cyan">{hud.syncPct}%</strong>
        </div>
        {finishedRef.current && (
          <div className="firefly-trophy">
            <Trophy weight="fill" /> {tx('同步达成！R > 0.9 持续 2 秒——挑战完成')}
          </div>
        )}
      </aside>

      <footer className="firefly-controls">
        <div className="firefly-slider-group">
          <label>
            <span className="firefly-slider-label">{tx('耦合强度 ε')}</span>
            <input
              type="range" min="0" max="0.1" step="0.005" value={coupling}
              onChange={(e) => { markInteraction(); setCoupling(Number(e.target.value)) }}
            />
            <span className="firefly-slider-val">{coupling.toFixed(3)}</span>
          </label>
          <label>
            <span className="firefly-slider-label">{tx('感知半径')}</span>
            <input
              type="range" min="20" max="200" step="5" value={radius}
              onChange={(e) => { markInteraction(); setRadius(Number(e.target.value)) }}
            />
            <span className="firefly-slider-val">{radius}px</span>
          </label>
          <label>
            <span className="firefly-slider-label">{tx('频率差异')}</span>
            <input
              type="range" min="0" max="0.5" step="0.01" value={freqVar}
              onChange={(e) => { markInteraction(); setFreqVar(Number(e.target.value)) }}
            />
            <span className="firefly-slider-val">{freqVar.toFixed(2)}</span>
          </label>
        </div>
        <div className="firefly-btn-row">
          <button type="button" className="firefly-btn" onClick={() => { markInteraction(); setRunning(!running) }}>
            {running ? <Pause weight="fill" /> : <Play weight="fill" />}
            {running ? tx('暂停') : tx('继续')}
          </button>
          <button type="button" className="firefly-btn" onClick={() => { markInteraction(); resetSim() }}>
            <ArrowCounterClockwise weight="bold" /> {tx('重置')}
          </button>
        </div>
        <div className="firefly-hint">{tx('点击画面可打散局部同步 · R > 0.9 持续 2 秒即完成挑战')}</div>
      </footer>

      {whyOpen && (
        <div className="firefly-why" role="dialog" aria-label={tx('萤火虫同步原理解释')}>
          <div className="firefly-why-card">
            <button type="button" className="firefly-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('没有指挥者，为什么能同步？')}</h2>
            <p>
              {tx('东南亚的')}<strong>{tx('Pteroptyx malaccae')}</strong>{tx(' 萤火虫成千上万聚集在红树林中，以精确到毫秒级的同步节律集体闪烁。每只萤火虫并没有「全局视野」，它只做一件事：')}<span className="is-purple">{tx('看到邻居闪光，就把自己的内部时钟往前拨一点点')}</span>{tx('。')}
            </p>
            <p>
              {tx('这就是')}<strong>{tx('脉冲耦合振荡器')}</strong>{tx('（pulse-coupled oscillator）模型。数学上，它等价于 Kuramoto 模型的离散版本：每个振荡器有相位 θ，以固有频率前进；当相位到达 1 时「放电」并重置，同时给感知半径内的邻居一个 ε 的相位推进。当耦合强度超过频率差异的临界值时，')}<span className="is-purple">{tx('同步态自发涌现')}</span>{tx('。')}
            </p>
            <p>
              {tx('同步指数 R = |1/N × Σ e^(2πiθⱼ)| 衡量集体一致性：R=0 是完全随机，R=1 是完美同步。这个「序参量」来自统计物理，也是理解')}<strong>{tx('涌现')}</strong>{tx('——整体展现出个体不具备的性质——的经典范例。')}
            </p>
            <p>
              <span className="is-red">{tx('边界条件：')}</span>{tx('本模拟使用 400 个二维平面上的脉冲耦合振荡器，忽略光传播延迟、遮挡和生物噪声。真实萤火虫的耦合是非对称的（只对前方邻居响应），且存在不应期。')}
            </p>
            <small>{tx('延伸阅读：Strogatz《Sync》· Kuramoto 模型 · Mirollo & Strogatz 1990 · 涌现现象')}</small>
          </div>
        </div>
      )}

      <div className="oss-engine-credit firefly-credit">{tx('Canvas 2D · 脉冲耦合振荡器 · 本地构建')}</div>

      <GuideTour worldId="firefly-sync" steps={guideSteps} />
      <GhostHint worldId="firefly-sync" gesture={{ type: 'tap', target: '.firefly-canvas', label: tx('点击打散一群萤火虫') }} />
    </div>
  )
}
