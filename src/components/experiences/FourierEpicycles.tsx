import './styles/FourierEpicycles.css'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Question, X, Trophy, PaintBrush, CircleNotch } from '@phosphor-icons/react'

import type { ExperienceControls } from '~/components/ExperienceShell'
import { GuideTour, type GuideStep } from '~/components/experiences/GuideTour'
import { GhostHint } from '~/components/experiences/GhostHint'
import { useExperienceI18n } from '~/i18n/experience'

/* ─── Constants ─────────────────────────────────────────────── */
const CYAN = '#4dd0e1'
const YELLOW = '#ffd166'
const PURPLE = '#b15cff'
const BG = '#030508'

type Vec = { x: number; y: number }
type Harmonic = { freq: number; amp: number; phase: number }

/* ─── DFT ───────────────────────────────────────────────────── */
function dft(points: Array<Vec>): Array<Harmonic> {
  const N = points.length
  const result: Array<Harmonic> = []
  for (let k = 0; k < N; k++) {
    let re = 0
    let im = 0
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N
      re += points[n].x * Math.cos(angle) + points[n].y * Math.sin(angle)
      im += points[n].y * Math.cos(angle) - points[n].x * Math.sin(angle)
    }
    re /= N
    im /= N
    result.push({ freq: k, amp: Math.sqrt(re * re + im * im), phase: Math.atan2(im, re) })
  }
  result.sort((a, b) => b.amp - a.amp)
  return result
}

/* ─── Preset Shapes ─────────────────────────────────────────── */
function heartPoints(n = 128): Array<Vec> {
  const pts: Array<Vec> = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const x = 16 * Math.pow(Math.sin(t), 3)
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    pts.push({ x: x / 17, y: y / 17 })
  }
  return pts
}

function starPoints(n = 128): Array<Vec> {
  const pts: Array<Vec> = []
  const spikes = 5
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2
    // smooth star via interpolation between outer (1) and inner (0.4) radii
    const seg = (i / n) * spikes * 2
    const idx = Math.floor(seg)
    const frac = seg - idx
    const r1 = idx % 2 === 0 ? 1 : 0.4
    const r2 = (idx + 1) % 2 === 0 ? 1 : 0.4
    const rr = r1 + (r2 - r1) * frac
    pts.push({ x: rr * Math.cos(t), y: rr * Math.sin(t) })
  }
  return pts
}

function infinityPoints(n = 128): Array<Vec> {
  const pts: Array<Vec> = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const denom = 1 + Math.sin(t) * Math.sin(t)
    pts.push({ x: Math.cos(t) / denom, y: (Math.sin(t) * Math.cos(t)) / denom })
  }
  return pts
}

function piPoints(n = 128): Array<Vec> {
  // π symbol as a path
  const raw: Array<[number, number]> = [
    [-0.8, -0.5], [-0.8, -0.6], [-0.6, -0.65], [-0.3, -0.65], [0.3, -0.65], [0.6, -0.65], [0.8, -0.6], [0.8, -0.5],
    [0.6, -0.5], [0.3, -0.55], [-0.3, -0.55], [-0.6, -0.55], [-0.8, -0.5],
    [-0.5, -0.55], [-0.5, -0.3], [-0.5, 0], [-0.5, 0.3], [-0.5, 0.6], [-0.45, 0.7], [-0.35, 0.65], [-0.35, 0.5],
    [-0.35, 0.3], [-0.35, 0], [-0.35, -0.3], [-0.35, -0.55],
    [0.35, -0.55], [0.35, -0.3], [0.35, 0], [0.35, 0.3], [0.35, 0.6], [0.4, 0.7], [0.5, 0.65], [0.5, 0.5],
    [0.5, 0.3], [0.5, 0], [0.5, -0.3], [0.5, -0.55],
  ]
  return resamplePath(raw, n)
}

function trebleClefPoints(n = 128): Array<Vec> {
  const raw: Array<[number, number]> = []
  // Approximate treble clef with parametric curves
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2
    raw.push([0.3 * Math.cos(t) * (1 + 0.3 * Math.sin(t)), -0.3 + 0.35 * Math.sin(t)])
  }
  // stem
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    raw.push([0.28 + 0.05 * Math.sin(t * Math.PI), -0.3 + t * 1.2])
  }
  // top curl
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * Math.PI * 1.5
    raw.push([0.28 + 0.15 * Math.cos(t), 0.9 + 0.15 * Math.sin(t)])
  }
  // bottom curl
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * Math.PI * 1.2
    raw.push([0.1 - 0.2 * Math.cos(t), -0.5 - 0.15 * Math.sin(t)])
  }
  return resamplePath(raw, n)
}

function lightningPoints(n = 128): Array<Vec> {
  const raw: Array<[number, number]> = [
    [0.1, -1], [-0.15, -0.3], [0.15, -0.3], [-0.2, 0.4], [0.05, 0.4], [-0.1, 1],
    [0.4, -0.1], [0.1, -0.1], [0.35, -0.7], [0.1, -1],
  ]
  return resamplePath(raw, n)
}

/** Resample a polyline to exactly n evenly-spaced points */
function resamplePath(raw: Array<[number, number]>, n: number): Array<Vec> {
  // compute cumulative lengths
  const cumLen: number[] = [0]
  for (let i = 1; i < raw.length; i++) {
    const dx = raw[i][0] - raw[i - 1][0]
    const dy = raw[i][1] - raw[i - 1][1]
    cumLen.push(cumLen[i - 1] + Math.sqrt(dx * dx + dy * dy))
  }
  const total = cumLen[cumLen.length - 1]
  if (total === 0) return Array.from({ length: n }, () => ({ x: 0, y: 0 }))
  const pts: Array<Vec> = []
  let seg = 0
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total
    while (seg < cumLen.length - 2 && cumLen[seg + 1] < target) seg++
    const segLen = cumLen[seg + 1] - cumLen[seg]
    const frac = segLen > 0 ? (target - cumLen[seg]) / segLen : 0
    pts.push({
      x: raw[seg][0] + (raw[seg + 1][0] - raw[seg][0]) * frac,
      y: raw[seg][1] + (raw[seg + 1][1] - raw[seg][1]) * frac,
    })
  }
  return pts
}

type PresetDef = { id: string; label: string; points: () => Array<Vec> }

const PRESETS: Array<PresetDef> = [
  { id: 'heart', label: '爱心', points: heartPoints },
  { id: 'star', label: '星星', points: starPoints },
  { id: 'infinity', label: '∞', points: infinityPoints },
  { id: 'pi', label: 'π', points: piPoints },
  { id: 'treble', label: '高音谱号', points: trebleClefPoints },
  { id: 'lightning', label: '闪电', points: lightningPoints },
]

/* ─── Component ─────────────────────────────────────────────── */
export function FourierEpicycles({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [numCircles, setNumCircles] = useState(30)
  const [speed, setSpeed] = useState(1)
  const [mode, setMode] = useState<'idle' | 'drawing' | 'animating'>('idle')
  const [activePreset, setActivePreset] = useState<string | null>('heart')
  const [whyOpen, setWhyOpen] = useState(false)
  const [finished, setFinished] = useState(false)
  const [progress, setProgress] = useState(0)
  const finishedRef = useRef(false)
  const interactedRef = useRef(false)

  const stateRef = useRef({
    numCircles,
    speed,
    mode: 'idle' as 'idle' | 'drawing' | 'animating',
    harmonics: [] as Array<Harmonic>,
    time: 0,
    lastNow: 0,
    tracedPath: [] as Array<Vec>,
    drawPoints: [] as Array<Vec>,
    isDrawing: false,
    cx: 0,
    cy: 0,
    scale: 1,
    loopComplete: false,
  })
  stateRef.current.numCircles = numCircles
  stateRef.current.speed = speed
  stateRef.current.mode = mode

  const registerOnce = useCallback(() => {
    if (!interactedRef.current) {
      interactedRef.current = true
      controls.registerInteraction()
    }
  }, [controls])

  /* ─── Start animation from points ─── */
  const startAnimation = useCallback((points: Array<Vec>) => {
    const s = stateRef.current
    // Normalize and scale points
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const maxRange = Math.max(rangeX, rangeY)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    const normalized = points.map((p) => ({
      x: (p.x - centerX) / maxRange,
      y: (p.y - centerY) / maxRange,
    }))

    s.harmonics = dft(normalized)
    s.time = 0
    s.tracedPath = []
    s.loopComplete = false
    setMode('animating')
    setProgress(0)
  }, [])

  /* ─── Select preset ─── */
  const selectPreset = useCallback((preset: PresetDef) => {
    registerOnce()
    setActivePreset(preset.id)
    const pts = preset.points()
    startAnimation(pts)
  }, [registerOnce, startAnimation])

  /* ─── Drawing handlers ─── */
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = stateRef.current
    if (s.mode !== 'drawing') return
    registerOnce()
    s.isDrawing = true
    s.drawPoints = []
    const rect = canvasRef.current!.getBoundingClientRect()
    s.drawPoints.push({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [registerOnce])

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = stateRef.current
    if (!s.isDrawing) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const last = s.drawPoints[s.drawPoints.length - 1]
    const dx = pt.x - last.x
    const dy = pt.y - last.y
    if (dx * dx + dy * dy > 9) {
      s.drawPoints.push(pt)
    }
  }, [])

  const onPointerUp = useCallback(() => {
    const s = stateRef.current
    if (!s.isDrawing) return
    s.isDrawing = false
    if (s.drawPoints.length > 10) {
      // Resample to 128 points for consistent DFT
      const resampled = resamplePath(
        s.drawPoints.map((p) => [p.x, p.y] as [number, number]),
        128,
      )
      setActivePreset(null)
      startAnimation(resampled)
    }
  }, [startAnimation])

  /* ─── Enter drawing mode ─── */
  const enterDrawMode = useCallback(() => {
    registerOnce()
    const s = stateRef.current
    s.mode = 'drawing'
    s.drawPoints = []
    s.tracedPath = []
    s.harmonics = []
    s.time = 0
    s.loopComplete = false
    setMode('drawing')
    setActivePreset(null)
    setProgress(0)
  }, [registerOnce])

  /* ─── On mount ─── */
  useEffect(() => {
    controls.completeOnboarding()
    // Auto-start with heart preset
    const timer = setTimeout(() => {
      const pts = heartPoints()
      startAnimation(pts)
    }, 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls])

  /* ─── Challenge check ─── */
  useEffect(() => {
    if (progress >= 0.99 && numCircles >= 25 && !finishedRef.current) {
      finishedRef.current = true
      setFinished(true)
      controls.finish()
    }
  }, [progress, numCircles, controls])

  /* ─── Main render loop ─── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0

    const frame = (now: number) => {
      const s = stateRef.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const dt = s.lastNow ? Math.min((now - s.lastNow) / 1000, 0.05) : 0
      s.lastNow = now

      const mobile = w < 720
      s.cx = w * (mobile ? 0.5 : 0.42)
      s.cy = h * (mobile ? 0.42 : 0.5)
      s.scale = Math.min(w, h) * (mobile ? 0.32 : 0.34)

      // ─── Background ───
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)

      // Subtle radial glow
      const grad = ctx.createRadialGradient(s.cx, s.cy, 10, s.cx, s.cy, s.scale * 2)
      grad.addColorStop(0, 'rgba(177, 92, 255, 0.04)')
      grad.addColorStop(0.5, 'rgba(77, 208, 225, 0.02)')
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // ─── Drawing mode ───
      if (s.mode === 'drawing') {
        // Draw the current path with cyan glow
        if (s.drawPoints.length > 1) {
          ctx.save()
          ctx.shadowColor = CYAN
          ctx.shadowBlur = 12
          ctx.strokeStyle = CYAN
          ctx.lineWidth = 3
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(s.drawPoints[0].x, s.drawPoints[0].y)
          for (let i = 1; i < s.drawPoints.length; i++) {
            ctx.lineTo(s.drawPoints[i].x, s.drawPoints[i].y)
          }
          ctx.stroke()
          ctx.restore()

          // Glow dot at tip
          const tip = s.drawPoints[s.drawPoints.length - 1]
          ctx.beginPath()
          ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2)
          ctx.fillStyle = CYAN
          ctx.shadowColor = CYAN
          ctx.shadowBlur = 16
          ctx.fill()
          ctx.shadowBlur = 0
        }

        // Draw hint text
        ctx.font = `${mobile ? 14 : 16}px system-ui, sans-serif`
        ctx.fillStyle = 'rgba(203, 213, 225, 0.6)'
        ctx.textAlign = 'center'
        ctx.fillText(
          tx('在画布上画出你想要的形状'),
          s.cx,
          s.cy + s.scale + 50,
        )
      }

      // ─── Animation mode ───
      if (s.mode === 'animating' && s.harmonics.length > 0) {
        const activeCount = Math.min(s.numCircles, s.harmonics.length)

        // Advance time
        if (!s.loopComplete) {
          s.time += dt * s.speed * 0.8
          if (s.time >= Math.PI * 2) {
            s.time = Math.PI * 2
            s.loopComplete = true
          }
        }

        const progressRatio = s.time / (Math.PI * 2)
        if (Math.abs(progressRatio - progress) > 0.005) {
          setProgress(progressRatio)
        }

        // Compute epicycle chain
        let x = s.cx
        let y = s.cy
        const circles: Array<{ x: number; y: number; r: number }> = []

        for (let i = 0; i < activeCount; i++) {
          const h = s.harmonics[i]
          const prevX = x
          const prevY = y
          const angle = h.freq * s.time + h.phase
          const r = h.amp * s.scale
          x += r * Math.cos(angle)
          y += r * Math.sin(angle)
          circles.push({ x: prevX, y: prevY, r })
        }

        // Record traced point
        if (!s.loopComplete) {
          s.tracedPath.push({ x, y })
        }

        // ─── Draw circles (purple, opacity by radius) ───
        const maxAmp = s.harmonics[0]?.amp || 1
        for (let i = 0; i < circles.length; i++) {
          const c = circles[i]
          if (c.r < 0.5) continue
          const opacity = 0.12 + 0.35 * (c.r / (maxAmp * s.scale))
          ctx.beginPath()
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(177, 92, 255, ${Math.min(opacity, 0.5)})`
          ctx.lineWidth = 1
          ctx.stroke()

          // Connecting line
          if (i < circles.length - 1) {
            const next = circles[i + 1]
            ctx.beginPath()
            ctx.moveTo(c.x, c.y)
            ctx.lineTo(next.x + (next.r > 0.5 ? 0 : 0), next.y)
            ctx.strokeStyle = `rgba(177, 92, 255, ${Math.min(opacity * 0.6, 0.3)})`
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }

        // Line from last circle center to tracing point
        if (circles.length > 0) {
          const lastC = circles[circles.length - 1]
          ctx.beginPath()
          ctx.moveTo(lastC.x, lastC.y)
          ctx.lineTo(x, y)
          ctx.strokeStyle = 'rgba(177, 92, 255, 0.4)'
          ctx.lineWidth = 1
          ctx.stroke()
        }

        // ─── Draw traced path (rainbow gradient) ───
        if (s.tracedPath.length > 1) {
          const pathLen = s.tracedPath.length
          for (let i = 1; i < pathLen; i++) {
            const hue = ((i / pathLen) * 360 + now * 0.02) % 360
            const alpha = 0.5 + 0.5 * (i / pathLen)
            ctx.beginPath()
            ctx.moveTo(s.tracedPath[i - 1].x, s.tracedPath[i - 1].y)
            ctx.lineTo(s.tracedPath[i].x, s.tracedPath[i].y)
            ctx.strokeStyle = `hsla(${hue}, 85%, 65%, ${alpha})`
            ctx.lineWidth = 2.5
            ctx.lineCap = 'round'
            ctx.stroke()
          }

          // Glow on the traced path
          ctx.save()
          ctx.shadowColor = 'rgba(255, 200, 100, 0.4)'
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.moveTo(s.tracedPath[0].x, s.tracedPath[0].y)
          for (let i = 1; i < pathLen; i++) {
            ctx.lineTo(s.tracedPath[i].x, s.tracedPath[i].y)
          }
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
          ctx.lineWidth = 4
          ctx.stroke()
          ctx.restore()
        }

        // ─── Tracing point (bright dot) ───
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = 14
        ctx.fill()
        ctx.shadowBlur = 0

        // Outer glow ring
        ctx.beginPath()
        ctx.arc(x, y, 8, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ─── Guide steps ─── */
  const guideSteps: Array<GuideStep> = [
    {
      target: '.fe-presets',
      title: tx('选一个形状'),
      body: tx('点击底部的预设形状，看旋转圆环如何把它画出来。'),
      action: () => selectPreset(PRESETS[0]),
    },
    {
      target: '.fe-slider-circles input',
      title: tx('调节圆环数'),
      body: tx('拖动「圆环数」滑块——圆环越多，复现越精确；只剩一个圆时只能画椭圆。'),
      awaitInteraction: true,
    },
    {
      target: '.fe-draw-btn',
      title: tx('画你自己的'),
      body: tx('点「画一个」进入手绘模式，在画布上画任何形状，松手后看圆环复现它。挑战：画一颗心，用 30 个圆环复现！'),
    },
  ]

  return (
    <div className="oss-experience fe-experience">
      <canvas
        ref={canvasRef}
        className="fe-canvas"
        style={{
          touchAction: mode === 'drawing' ? 'none' : 'pan-y',
          cursor: mode === 'drawing' ? 'crosshair' : 'default',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* Header */}
      <header className="fe-header">
        <h1>{tx('为什么任何曲线都能用旋转的圆环画出来？')}</h1>
        <p>{tx('傅里叶变换把复杂路径拆解成简单圆周运动的叠加——圆环越多，复现越精确。')}</p>
        <button type="button" className="fe-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}
        </button>
      </header>

      {/* Progress + status */}
      {mode === 'animating' && (
        <aside className="fe-status">
          <div className="fe-status-row">
            <small>{tx('圆环数')}</small>
            <strong className="is-yellow">{Math.min(numCircles, stateRef.current.harmonics.length)}</strong>
          </div>
          <div className="fe-status-row">
            <small>{tx('进度')}</small>
            <strong className="is-cyan">{Math.round(progress * 100)}%</strong>
          </div>
          <div className="fe-progress-bar">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
          {finished && (
            <div className="fe-success">
              <Trophy weight="fill" /> {tx('挑战完成！圆环完美复现了你的曲线')}
            </div>
          )}
        </aside>
      )}

      {/* Right panel: sliders */}
      {mode === 'animating' && (
        <div className="fe-panel">
          <div className="fe-slider-group fe-slider-circles">
            <label>
              {tx('圆环数')}
              <strong className="is-yellow">{numCircles}</strong>
            </label>
            <input
              type="range"
              min={1}
              max={Math.max(64, stateRef.current.harmonics.length)}
              step={1}
              value={numCircles}
              onChange={(e) => {
                registerOnce()
                setNumCircles(Number(e.target.value))
              }}
              aria-label={tx('圆环数')}
            />
          </div>
          <div className="fe-slider-group">
            <label>
              {tx('速度')}
              <strong className="is-cyan">{speed.toFixed(1)}×</strong>
            </label>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={speed}
              onChange={(e) => {
                registerOnce()
                setSpeed(Number(e.target.value))
              }}
              aria-label={tx('速度')}
            />
          </div>
        </div>
      )}

      {/* Bottom bar: presets + draw button */}
      <footer className="fe-footer">
        <div className="fe-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`fe-preset-btn${activePreset === p.id ? ' is-active' : ''}`}
              onClick={() => selectPreset(p)}
            >
              {tx(p.label)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`fe-draw-btn${mode === 'drawing' ? ' is-active' : ''}`}
          onClick={enterDrawMode}
        >
          {mode === 'drawing' ? <CircleNotch weight="bold" className="fe-spin" /> : <PaintBrush weight="bold" />}
          {tx(mode === 'drawing' ? '画布已就绪，开始画吧' : '画一个')}
        </button>
      </footer>

      {/* Challenge hint */}
      {!finished && mode === 'animating' && (
        <div className="fe-challenge">
          {tx('挑战：画一颗心，用 30 个圆环复现它')}
        </div>
      )}

      {/* Why modal */}
      {whyOpen && (
        <div className="fe-why" role="dialog" aria-label={tx('傅里叶圆环解释')}>
          <div className="fe-why-card">
            <button type="button" className="fe-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('圆环为什么能画出任何曲线？')}</h2>
            <p>
              {tx('每个匀速旋转的圆环，末端在 x 和 y 方向各画出一个正弦。把多个不同频率、不同半径的圆环首尾相接，末端的轨迹就是这些正弦的叠加：')}
              <strong> z(t) = Σ Aₖ · e^(i·(k·t + φₖ))</strong>
            </p>
            <p>
              {tx('离散傅里叶变换（DFT）对任意闭合路径采样 N 个点，计算出 N 个圆环的频率、半径和初始相位。')}
              <span className="is-purple">{tx('紫色圆环')}</span>
              {tx('按半径从大到小排列——前几个大圆搭出轮廓，后面的小圆修正细节。')}
            </p>
            <p>
              {tx('圆环数 = N 时，复现是精确的（通过所有采样点）；减少圆环数相当于低通滤波，只保留主要形状，丢弃高频细节。这不是近似——')}
              <strong>{tx('是数学上的精确分解')}</strong>
              {tx('，只是你选择只看前几项。')}
            </p>
            <small>{tx('假设：闭合路径等距采样 128 点；DFT 复杂度 O(N²)，实时计算无压力。圆环数 k 对应频率 k，即每转一圈该圆环转 k 圈。')}</small>
          </div>
        </div>
      )}

      {/* Engine credit */}
      <div className="oss-engine-credit fe-credit">
        {tx('Canvas 2D · 离散傅里叶变换 · 旋转圆环')}
      </div>

      <GuideTour worldId="fourier-epicycles" steps={guideSteps} />
      <GhostHint
        worldId="fourier-epicycles"
        gesture={{ type: 'drag', target: '.fe-canvas', dx: 80, dy: -60, label: tx('画一个形状') }}
      />
    </div>
  )
}
