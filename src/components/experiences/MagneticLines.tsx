import './styles/MagneticLines.css'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowCounterClockwise, Question, X, Trophy, MagnetStraight } from '@phosphor-icons/react'

import type { ExperienceControls } from '~/components/ExperienceShell'
import { GuideTour, type GuideStep } from '~/components/experiences/GuideTour'
import { GhostHint } from '~/components/experiences/GhostHint'
import { useExperienceI18n } from '~/i18n/experience'

const CYAN = '#4dd0e1'
const YELLOW = '#ffd166'
const PURPLE = '#b15cff'
const RED = '#ff6b6b'

type Magnet = { x: number; y: number; angle: number }
type Filing = { x: number; y: number; angle: number; jitter: number }

const MU0_4PI = 1e-7

function dipoleField(magnets: Array<Magnet>, strength: number, px: number, py: number): [number, number] {
  let bx = 0
  let by = 0
  for (const m of magnets) {
    const dx = px - m.x
    const dy = py - m.y
    const r2 = dx * dx + dy * dy
    const r = Math.sqrt(r2)
    if (r < 12) continue
    const r3 = r2 * r
    const mx = Math.cos(m.angle) * strength
    const my = Math.sin(m.angle) * strength
    const mDotR = (mx * dx + my * dy) / r
    bx += MU0_4PI * (3 * mDotR * dx / r - mx) / r3
    by += MU0_4PI * (3 * mDotR * dy / r - my) / r3
  }
  return [bx, by]
}

function traceFieldLine(magnets: Array<Magnet>, strength: number, sx: number, sy: number, steps: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[sx, sy]]
  let x = sx
  let y = sy
  const h = 4
  for (let i = 0; i < steps; i++) {
    const [bx1, by1] = dipoleField(magnets, strength, x, y)
    const m1 = Math.hypot(bx1, by1)
    if (m1 < 1e-14) break
    const k1x = (bx1 / m1) * h
    const k1y = (by1 / m1) * h
    const [bx2, by2] = dipoleField(magnets, strength, x + k1x * 0.5, y + k1y * 0.5)
    const m2 = Math.hypot(bx2, by2)
    if (m2 < 1e-14) break
    const k2x = (bx2 / m2) * h
    const k2y = (by2 / m2) * h
    const [bx3, by3] = dipoleField(magnets, strength, x + k2x * 0.5, y + k2y * 0.5)
    const m3 = Math.hypot(bx3, by3)
    if (m3 < 1e-14) break
    const k3x = (bx3 / m3) * h
    const k3y = (by3 / m3) * h
    const [bx4, by4] = dipoleField(magnets, strength, x + k3x, y + k3y)
    const m4 = Math.hypot(bx4, by4)
    if (m4 < 1e-14) break
    const k4x = (bx4 / m4) * h
    const k4y = (by4 / m4) * h
    x += (k1x + 2 * k2x + 2 * k3x + k4x) / 6
    y += (k1y + 2 * k2y + 2 * k3y + k4y) / 6
    pts.push([x, y])
    for (const m of magnets) {
      const sx2 = m.x - Math.cos(m.angle) * 26
      const sy2 = m.y - Math.sin(m.angle) * 26
      if (Math.hypot(x - sx2, y - sy2) < 16) return pts
    }
  }
  return pts
}

export function MagneticLines({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [strength, setStrength] = useState(1)
  const [filingCount, setFilingCount] = useState(2000)
  const [showLines, setShowLines] = useState(true)
  const [whyOpen, setWhyOpen] = useState(false)
  const [fieldReading, setFieldReading] = useState(0)
  const [magnetCount, setMagnetCount] = useState(2)
  const [solved, setSolved] = useState(false)
  const finishedRef = useRef(false)

  const st = useRef({
    magnets: [
      { x: 0, y: 0, angle: 0 },
      { x: 0, y: 0, angle: Math.PI },
    ] as Array<Magnet>,
    filings: [] as Array<Filing>,
    strength: 1,
    filingCount: 2000,
    showLines: true,
    dragging: -1,
    rotating: -1,
    mouseX: 0,
    mouseY: 0,
    time: 0,
    lastNow: 0,
    uiAcc: 0,
    autoDemo: true,
  })
  st.current.strength = strength
  st.current.filingCount = filingCount
  st.current.showLines = showLines

  useEffect(() => {
    controls.completeOnboarding()
  }, [controls])

  const initFilings = useCallback((w: number, h: number) => {
    const s = st.current
    s.filings = []
    const magnets = s.magnets
    for (let i = 0; i < 4000; i++) {
      let x: number, y: number
      if (i < 2400 && magnets.length > 0) {
        // 60% concentrated near magnets (within ~200px radius)
        const m = magnets[i % magnets.length]
        const angle = Math.random() * Math.PI * 2
        const dist = 30 + Math.random() * Math.min(w, h) * 0.28
        x = m.x + Math.cos(angle) * dist
        y = m.y + Math.sin(angle) * dist
        x = Math.max(5, Math.min(w - 5, x))
        y = Math.max(5, Math.min(h - 5, y))
      } else {
        x = Math.random() * w
        y = Math.random() * h
      }
      s.filings.push({
        x,
        y,
        angle: Math.random() * Math.PI * 2,
        jitter: Math.random() * 0.3,
      })
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let w = 0
    let h = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (st.current.filings.length === 0) {
        st.current.magnets[0] = { x: w * 0.38, y: h * 0.45, angle: 0 }
        st.current.magnets[1] = { x: w * 0.62, y: h * 0.45, angle: Math.PI }
        initFilings(w, h)
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const frame = (now: number) => {
      const s = st.current
      const dt = s.lastNow ? Math.min((now - s.lastNow) / 1000, 0.05) : 0
      s.lastNow = now
      s.time += dt

      // Gradient background (dark navy, not pure black)
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.7)
      bg.addColorStop(0, '#141c2b')
      bg.addColorStop(0.6, '#0f1520')
      bg.addColorStop(1, '#0a0e16')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // Subtle dot grid for depth
      ctx.fillStyle = 'rgba(100,140,180,0.06)'
      const gridStep = 40
      for (let gx = gridStep; gx < w; gx += gridStep) {
        for (let gy = gridStep; gy < h; gy += gridStep) {
          ctx.fillRect(gx - 0.5, gy - 0.5, 1, 1)
        }
      }

      // Auto-demo: gentle orbit
      if (s.autoDemo && s.magnets.length === 2) {
        const cx = w * 0.5
        const cy = h * 0.45
        const orbitR = Math.min(w, h) * 0.16
        const t = s.time * 0.3
        s.magnets[0].x = cx + Math.cos(t) * orbitR
        s.magnets[0].y = cy + Math.sin(t) * orbitR * 0.5
        s.magnets[0].angle = t + Math.PI * 0.5
        s.magnets[1].x = cx - Math.cos(t) * orbitR
        s.magnets[1].y = cy - Math.sin(t) * orbitR * 0.5
        s.magnets[1].angle = t - Math.PI * 0.5
      }

      const str = s.strength * 5e6

      // Draw iron filings (bright, clearly visible)
      const count = Math.min(s.filingCount, s.filings.length)
      for (let i = 0; i < count; i++) {
        const f = s.filings[i]
        const [bx, by] = dipoleField(s.magnets, str, f.x, f.y)
        const mag = Math.hypot(bx, by)
        if (mag > 1e-12) {
          const target = Math.atan2(by, bx)
          let diff = target - f.angle
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          f.angle += diff * Math.min(1, dt * 8)
          f.angle += (Math.random() - 0.5) * f.jitter * dt * 2
          // Subtle drift toward stronger field (gradient following)
          const drift = Math.min(0.3, mag * 1e8) * dt * 60
          f.x += (bx / mag) * drift * 0.15
          f.y += (by / mag) * drift * 0.15
        }
        const intensity = Math.min(1, Math.log10(1 + mag * 1e10) / 3)
        // Bright cyan-white for strong field, soft steel for weak
        const r = Math.round(120 + (77 - 120) * intensity + intensity * 80)
        const g = Math.round(160 + (220 - 160) * intensity)
        const b = Math.round(190 + (255 - 190) * intensity)
        const alpha = 0.55 + intensity * 0.45
        const len = 8 + intensity * 6
        ctx.save()
        ctx.translate(f.x, f.y)
        ctx.rotate(f.angle)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`
        ctx.fillRect(-len / 2, -1.2, len, 2.4)
        // Glow for high-intensity filings
        if (intensity > 0.5) {
          ctx.shadowColor = CYAN
          ctx.shadowBlur = 4
          ctx.fillStyle = `rgba(77,208,225,${(intensity * 0.3).toFixed(2)})`
          ctx.fillRect(-len / 2, -0.8, len, 1.6)
          ctx.shadowBlur = 0
        }
        ctx.restore()
      }

      // Draw field lines (bright purple with glow)
      if (s.showLines) {
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (const m of s.magnets) {
          const nx = m.x + Math.cos(m.angle) * 28
          const ny = m.y + Math.sin(m.angle) * 28
          for (let a = -0.6; a <= 0.6; a += 0.3) {
            const sx = nx + Math.cos(m.angle + Math.PI / 2) * a * 20
            const sy = ny + Math.sin(m.angle + Math.PI / 2) * a * 20
            const pts = traceFieldLine(s.magnets, str, sx, sy, 140)
            if (pts.length < 3) continue
            // Outer glow
            ctx.shadowColor = PURPLE
            ctx.shadowBlur = 8
            ctx.lineWidth = 3
            ctx.strokeStyle = 'rgba(177,92,255,0.2)'
            ctx.beginPath()
            ctx.moveTo(pts[0][0], pts[0][1])
            for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1])
            ctx.stroke()
            // Core line
            ctx.shadowBlur = 3
            ctx.lineWidth = 1.6
            ctx.strokeStyle = 'rgba(177,92,255,0.75)'
            ctx.beginPath()
            ctx.moveTo(pts[0][0], pts[0][1])
            for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1])
            ctx.stroke()
            ctx.shadowBlur = 0
            // Arrow at midpoint
            const mid = Math.floor(pts.length / 2)
            if (mid > 1) {
              const dx = pts[mid][0] - pts[mid - 1][0]
              const dy = pts[mid][1] - pts[mid - 1][1]
              const ang = Math.atan2(dy, dx)
              ctx.save()
              ctx.translate(pts[mid][0], pts[mid][1])
              ctx.rotate(ang)
              ctx.fillStyle = 'rgba(200,140,255,0.9)'
              ctx.beginPath()
              ctx.moveTo(7, 0)
              ctx.lineTo(-4, -4)
              ctx.lineTo(-4, 4)
              ctx.closePath()
              ctx.fill()
              ctx.restore()
            }
          }
        }
      }

      // Draw magnets (large, bright, unmistakable)
      for (let i = 0; i < s.magnets.length; i++) {
        const m = s.magnets[i]
        ctx.save()
        ctx.translate(m.x, m.y)
        ctx.rotate(m.angle)
        const bw = 56
        const bh = 24
        // Ambient glow around magnet
        ctx.shadowColor = i === s.dragging ? YELLOW : 'rgba(180,200,255,0.6)'
        ctx.shadowBlur = i === s.dragging ? 18 : 12
        // Body
        ctx.beginPath()
        ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 6)
        ctx.fillStyle = '#3a4255'
        ctx.fill()
        ctx.strokeStyle = i === s.dragging ? YELLOW : 'rgba(200,220,255,0.5)'
        ctx.lineWidth = i === s.dragging ? 2.5 : 1.5
        ctx.stroke()
        ctx.shadowBlur = 0
        // N pole (bright red)
        ctx.beginPath()
        ctx.roundRect(bw / 2 - 18, -bh / 2 + 3, 15, bh - 6, 4)
        ctx.fillStyle = '#ff4444'
        ctx.fill()
        ctx.shadowColor = RED
        ctx.shadowBlur = 8
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = '#fff'
        ctx.font = '700 11px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('N', bw / 2 - 10, 0)
        // S pole (bright blue)
        ctx.beginPath()
        ctx.roundRect(-bw / 2 + 3, -bh / 2 + 3, 15, bh - 6, 4)
        ctx.fillStyle = '#2288ff'
        ctx.fill()
        ctx.shadowColor = '#2288ff'
        ctx.shadowBlur = 8
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = '#fff'
        ctx.fillText('S', -bw / 2 + 11, 0)
        ctx.restore()
      }

      // HUD reading throttle
      s.uiAcc += dt
      if (s.uiAcc > 0.15) {
        s.uiAcc = 0
        const [bx, by] = dipoleField(s.magnets, str, s.mouseX, s.mouseY)
        setFieldReading(Math.hypot(bx, by) * 1e7)
        setMagnetCount(s.magnets.length)
        // Challenge: check if field lines from magnet 0 N reach magnet 1 S
        if (!finishedRef.current && s.magnets.length >= 2 && !s.autoDemo) {
          const m0 = s.magnets[0]
          const nx = m0.x + Math.cos(m0.angle) * 28
          const ny = m0.y + Math.sin(m0.angle) * 28
          const pts = traceFieldLine(s.magnets, str, nx, ny, 150)
          if (pts.length > 10) {
            const last = pts[pts.length - 1]
            const m1 = s.magnets[1]
            const sx2 = m1.x - Math.cos(m1.angle) * 26
            const sy2 = m1.y - Math.sin(m1.angle) * 26
            if (Math.hypot(last[0] - sx2, last[1] - sy2) < 22) {
              finishedRef.current = true
              setSolved(true)
              controls.finish()
            }
          }
        }
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const s = st.current
    s.autoDemo = false
    controls.registerInteraction()

    for (let i = 0; i < s.magnets.length; i++) {
      const m = s.magnets[i]
      const dist = Math.hypot(px - m.x, py - m.y)
      if (dist < 36) {
        s.dragging = i
        return
      }
      // Rotate handle: beyond body
      const dx = px - m.x
      const dy = py - m.y
      const localX = dx * Math.cos(-m.angle) - dy * Math.sin(-m.angle)
      if (Math.abs(localX) > 28 && Math.abs(localX) < 48 && Math.hypot(dx, dy) < 52) {
        s.rotating = i
        return
      }
    }
  }, [controls])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const s = st.current
    s.mouseX = px
    s.mouseY = py

    if (s.dragging >= 0) {
      s.magnets[s.dragging].x = px
      s.magnets[s.dragging].y = py
    } else if (s.rotating >= 0) {
      const m = s.magnets[s.rotating]
      m.angle = Math.atan2(py - m.y, px - m.x)
    }
  }, [])

  const onPointerUp = useCallback(() => {
    st.current.dragging = -1
    st.current.rotating = -1
  }, [])

  const addMagnet = useCallback(() => {
    const s = st.current
    if (s.magnets.length >= 4) return
    controls.registerInteraction()
    s.autoDemo = false
    const canvas = canvasRef.current!
    s.magnets.push({
      x: canvas.clientWidth * (0.3 + Math.random() * 0.4),
      y: canvas.clientHeight * (0.3 + Math.random() * 0.4),
      angle: Math.random() * Math.PI * 2,
    })
    setMagnetCount(s.magnets.length)
  }, [controls])

  const resetAll = useCallback(() => {
    const s = st.current
    const canvas = canvasRef.current!
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    s.magnets = [
      { x: w * 0.38, y: h * 0.45, angle: 0 },
      { x: w * 0.62, y: h * 0.45, angle: Math.PI },
    ]
    s.autoDemo = true
    finishedRef.current = false
    setSolved(false)
    setMagnetCount(2)
    controls.registerInteraction()
  }, [controls])

  const guideSteps: Array<GuideStep> = [
    {
      target: '.magnetic-canvas',
      title: tx('拖动磁铁'),
      body: tx('按住磁铁拖动，观察铁屑如何实时重新排列，跟随磁场方向。'),
      awaitInteraction: true,
    },
    {
      target: '.magnetic-canvas',
      title: tx('旋转磁铁'),
      body: tx('拖拽磁铁两端外侧可旋转方向，改变磁极朝向，看磁力线如何重新编织。'),
      awaitInteraction: true,
    },
    {
      title: tx('挑战：闭合环路'),
      body: tx('让两枚磁铁异极相对（N 对 S），使磁力线从一枚的 N 极出发、到达另一枚的 S 极，形成完美闭合环路。'),
    },
  ]

  return (
    <div className="oss-experience magnetic-experience">
      <canvas
        ref={canvasRef}
        className="magnetic-canvas"
        style={{ cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      <header className="magnetic-question">
        <h1>{tx('磁力线长什么样？')}</h1>
        <p>{tx('拖动磁铁，看两千颗铁屑如何被看不见的场驯服。')}</p>
        <button type="button" className="magnetic-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}</button>
      </header>

      <aside className="magnetic-hud">
        <div className="magnetic-hud-row">
          <small>{tx('光标处场强')}</small>
          <strong className="is-cyan">{fieldReading.toFixed(2)} {tx('μT')}</strong>
        </div>
        <div className="magnetic-hud-row">
          <small>{tx('磁铁数量')}</small>
          <strong>{magnetCount}/4</strong>
        </div>
        {solved && (
          <div className="magnetic-success">
            <Trophy weight="fill" /> {tx('完美闭合环路！异极相吸，磁力线无始无终。')}
          </div>
        )}
      </aside>

      <footer className="magnetic-controls">
        <label className="magnetic-slider">
          <span>{tx('磁场强度')}</span>
          <input
            type="range"
            min="0.2"
            max="3"
            step="0.1"
            value={strength}
            onChange={(e) => { setStrength(Number(e.target.value)); st.current.autoDemo = false; controls.registerInteraction() }}
          />
        </label>
        <label className="magnetic-slider">
          <span>{tx('铁屑密度')}</span>
          <input
            type="range"
            min="500"
            max="4000"
            step="100"
            value={filingCount}
            onChange={(e) => { setFilingCount(Number(e.target.value)); controls.registerInteraction() }}
          />
        </label>
        <button
          type="button"
          className={`magnetic-toggle ${showLines ? 'is-on' : ''}`}
          onClick={() => { setShowLines((v) => !v); controls.registerInteraction() }}
        >
          {tx('磁力线')}
        </button>
        <button type="button" className="magnetic-add" onClick={addMagnet}>
          <MagnetStraight weight="bold" /> {tx('+磁铁')}
        </button>
        <button type="button" className="magnetic-reset" onClick={resetAll}>
          <ArrowCounterClockwise weight="bold" /> {tx('重置')}
        </button>
      </footer>

      {whyOpen && (
        <div className="magnetic-why" role="dialog" aria-label={tx('磁力线原理')}>
          <div className="magnetic-why-card">
            <button type="button" className="magnetic-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('看不见的场，看得见的线')}</h2>
            <p>
              <strong>{tx('磁偶极子')}</strong>{tx('：每枚条形磁铁都是一个偶极子。空间中任意一点的磁场由公式 B = (μ₀/4π)[3(m·r̂)r̂ − m]/r³ 决定——近处极强、远处急衰，方向沿磁矩与径矢的组合。')}</p>
            <p>
              <strong>{tx('闭合环路')}</strong>{tx('：磁力线永远没有起点也没有终点——它们从 N 极出发、进入 S 极、在磁铁内部再走回 N 极，形成闭合曲线。这是麦克斯韦方程 ∇·B = 0 的几何表达：自然界不存在磁单极子。')}</p>
            <p>
              <strong>{tx('铁屑的秘密')}</strong>{tx('：每一颗铁屑在磁场中被磁化成微小磁针，沿当地场方向排列。两千颗铁屑同时转向，就把不可见的矢量场「显影」成肉眼可读的图案——这正是法拉第当年用铁粉发现磁力线的方法。')}</p>
            <small>{tx('模型：二维偶极子叠加，铁屑角度以指数趋近局部场方向并附加微扰；磁力线由 RK4 积分追踪。')}</small>
          </div>
        </div>
      )}

      <div className="oss-engine-credit magnetic-credit">{tx('Canvas 2D · 偶极子场 + 铁屑粒子 + RK4 磁力线')}</div>

      <GuideTour worldId="magnetic-lines" steps={guideSteps} />
      <GhostHint worldId="magnetic-lines" gesture={{ type: 'drag', target: '.magnetic-canvas', dx: 60, dy: 20, label: tx('拖动磁铁') }} />
    </div>
  )
}
