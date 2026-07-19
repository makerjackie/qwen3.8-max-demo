import './styles/Spirograph.css'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowCounterClockwise, Play, Pause, Question, X, Trophy } from '@phosphor-icons/react'

import type { ExperienceControls } from '~/components/ExperienceShell'
import { GuideTour, type GuideStep } from '~/components/experiences/GuideTour'
import { GhostHint } from '~/components/experiences/GhostHint'
import { useExperienceI18n } from '~/i18n/experience'

const YELLOW = '#ffd166'
const CYAN = '#4dd0e1'
const PURPLE = '#b15cff'
const RED = '#ff6b6b'

function gcd(a: number, b: number): number {
  a = Math.round(a); b = Math.round(b)
  while (b) { [a, b] = [b, a % b] }
  return a
}

type Layer = { R: number; r: number; d: number; hueOffset: number; progress: number; done: boolean }

export function Spirograph({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ratio, setRatio] = useState(0.6)
  const [penDist, setPenDist] = useState(1.0)
  const [speed, setSpeed] = useState(1.0)
  const [whyOpen, setWhyOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const [finished, setFinished] = useState(false)
  const finishedRef = useRef(false)
  const interactedRef = useRef(false)

  const R_FIXED = 5
  const rVal = Math.max(1, Math.round(ratio * R_FIXED * 10) / 10)
  const dVal = penDist * rVal
  const g = gcd(Math.round(R_FIXED * 10), Math.round(rVal * 10))
  const cusps = Math.round(R_FIXED * 10) / g
  const tEnd = 2 * Math.PI * (Math.round(rVal * 10) / g)
  const period = (tEnd / (2 * Math.PI)).toFixed(1)

  const layersRef = useRef<Layer[]>([])
  const st = useRef({ ratio, penDist, speed, paused, rVal, dVal, tEnd })
  st.current = { ratio, penDist, speed, paused, rVal, dVal, tEnd }

  const registerOnce = useCallback(() => {
    if (!interactedRef.current) {
      interactedRef.current = true
      controls.registerInteraction()
    }
  }, [controls])

  useEffect(() => { controls.completeOnboarding() }, [controls])

  // Auto-demo: 5-cusped rose on load
  useEffect(() => {
    layersRef.current = [{ R: 5, r: 3, d: 5, hueOffset: 0, progress: 0, done: false }]
  }, [])

  // Reset active layer when params change
  useEffect(() => {
    const layers = layersRef.current
    if (layers.length > 0) {
      const last = layers[layers.length - 1]
      last.r = rVal; last.d = dVal; last.progress = 0; last.done = false
    }
  }, [rVal, dVal])

  // Challenge: 7 cusps
  useEffect(() => {
    if (cusps === 7 && !finishedRef.current) {
      const layers = layersRef.current
      const active = layers[layers.length - 1]
      if (active && active.done) {
        finishedRef.current = true
        setFinished(true)
        registerOnce()
        controls.finish()
      }
    }
  }, [cusps, controls, registerOnce])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let lastNow = 0

    const frame = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0
      lastNow = now

      const s = st.current
      const cx = w / 2
      const cy = h * 0.46
      const scale = Math.min(w, h) * 0.32 / (s.rVal + s.dVal + 1)
      const layers = layersRef.current

      // Background
      ctx.fillStyle = '#0a0a1a'
      ctx.fillRect(0, 0, w, h)

      // Draw each layer
      for (let li = 0; li < layers.length; li++) {
        const layer = layers[li]
        const { R, r, d, hueOffset } = layer
        const layerTEnd = 2 * Math.PI * (Math.round(r * 10) / gcd(Math.round(R * 10), Math.round(r * 10)))

        if (!s.paused && !layer.done) {
          layer.progress += dt * s.speed * 2.2
          if (layer.progress >= layerTEnd) {
            layer.progress = layerTEnd
            layer.done = true
            // Check challenge on completion
            if (cusps === 7 && !finishedRef.current) {
              finishedRef.current = true
              setFinished(true)
              registerOnce()
              controls.finish()
            }
          }
        }

        const steps = Math.min(2000, Math.max(200, Math.floor(layer.progress * 80)))
        const tStep = layer.progress / steps

        // Draw curve with rainbow gradient
        ctx.lineWidth = 2
        ctx.shadowBlur = 6
        for (let i = 1; i <= steps; i++) {
          const t0 = (i - 1) * tStep
          const t1 = i * tStep
          const x0 = ((R - r) * Math.cos(t0) + d * Math.cos(((R - r) / r) * t0)) * scale + cx
          const y0 = ((R - r) * Math.sin(t0) - d * Math.sin(((R - r) / r) * t0)) * scale + cy
          const x1 = ((R - r) * Math.cos(t1) + d * Math.cos(((R - r) / r) * t1)) * scale + cx
          const y1 = ((R - r) * Math.sin(t1) - d * Math.sin(((R - r) / r) * t1)) * scale + cy
          const hue = ((t1 / layerTEnd) * 360 + hueOffset) % 360
          ctx.strokeStyle = `hsla(${hue}, 85%, 62%, 0.9)`
          ctx.shadowColor = `hsla(${hue}, 85%, 62%, 0.5)`
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
          ctx.stroke()
        }
        ctx.shadowBlur = 0

        // Construction geometry for active layer
        if (li === layers.length - 1 && !layer.done) {
          const t = layer.progress
          const innerCx = (R - r) * Math.cos(t) * scale + cx
          const innerCy = (R - r) * Math.sin(t) * scale + cy
          const penX = ((R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)) * scale + cx
          const penY = ((R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)) * scale + cy

          // Outer circle (purple dashed)
          ctx.setLineDash([6, 6])
          ctx.strokeStyle = 'rgba(177, 92, 255, 0.35)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(cx, cy, R * scale, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])

          // Inner rolling circle (purple)
          ctx.strokeStyle = 'rgba(177, 92, 255, 0.55)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(innerCx, innerCy, r * scale, 0, Math.PI * 2)
          ctx.stroke()

          // Pen arm (yellow)
          ctx.strokeStyle = YELLOW
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(innerCx, innerCy)
          ctx.lineTo(penX, penY)
          ctx.stroke()

          // Pen point glow (yellow)
          ctx.fillStyle = YELLOW
          ctx.shadowColor = YELLOW
          ctx.shadowBlur = 14
          ctx.beginPath()
          ctx.arc(penX, penY, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }

        // Closure flash (red)
        if (layer.done && li === layers.length - 1) {
          const x0 = ((R - r) + d) * scale + cx
          const y0 = cy
          ctx.fillStyle = RED
          ctx.shadowColor = RED
          ctx.shadowBlur = 18
          ctx.beginPath()
          ctx.arc(x0, y0, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addLayer = useCallback(() => {
    registerOnce()
    const layers = layersRef.current
    if (layers.length >= 5) layers.shift()
    layers.push({ R: R_FIXED, r: rVal, d: dVal, hueOffset: layers.length * 72, progress: 0, done: false })
  }, [rVal, dVal, registerOnce])

  const resetAll = useCallback(() => {
    registerOnce()
    layersRef.current = [{ R: R_FIXED, r: rVal, d: dVal, hueOffset: 0, progress: 0, done: false }]
    setFinished(false)
    finishedRef.current = false
  }, [rVal, dVal, registerOnce])

  const guideSteps: Array<GuideStep> = [
    {
      title: tx('调整齿轮比'),
      body: tx('拖动「齿轮比」滑块，改变内齿轮与外齿轮的半径比。不同的有理数比会产生不同瓣数的闭合曲线。'),
      target: '.spiro-slider-ratio',
      awaitInteraction: true,
    },
    {
      title: tx('调整笔距'),
      body: tx('「笔距」控制画笔到内齿轮中心的距离。d = r 时曲线有尖点，d > r 时产生内环。'),
      target: '.spiro-slider-pen',
      awaitInteraction: true,
    },
    {
      title: tx('挑战：7 个尖点'),
      body: tx('试着找到一条恰好有 7 个尖点的闭合曲线。提示：尖点数 = R / gcd(R, r)，当 d = r 时出现尖点。'),
    },
  ]

  return (
    <div className="oss-experience spiro-experience">
      <canvas
        ref={canvasRef}
        className="spiro-canvas"
        style={{ touchAction: 'none' }}
        onPointerDown={() => { registerOnce(); addLayer() }}
      />

      <header className="spiro-question">
        <h1>{tx('齿轮一转，万花绽放')}</h1>
        <p>{tx('调整齿轮比和笔距，看数学如何把简单的圆周运动变成令人着迷的对称花纹。')}</p>
        <button type="button" className="spiro-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}</button>
      </header>

      <aside className="spiro-readout">
        <div className="spiro-readout-row">
          <small>{tx('齿轮比 r/R')}</small>
          <strong className="is-yellow">{tx(ratio.toFixed(2))}</strong>
        </div>
        <div className="spiro-readout-row">
          <small>{tx('尖点数')}</small>
          <strong className="is-cyan">{tx(String(cusps))}</strong>
        </div>
        <div className="spiro-readout-row">
          <small>{tx('闭合周期')}</small>
          <strong className="is-cyan">{tx(period)}{tx('圈')}</strong>
        </div>
        {finished && (
          <div className="spiro-success">
            <Trophy weight="fill" /> {tx('7 尖点曲线达成！')}</div>
        )}
      </aside>

      <footer className="spiro-controls">
        <div className="spiro-transport">
          <button
            type="button"
            className="spiro-icon-btn"
            onClick={() => { registerOnce(); setPaused((v) => !v) }}
            aria-label={tx(paused ? '播放' : '暂停')}
          >
            {paused ? <Play weight="fill" /> : <Pause weight="fill" />}
          </button>
          <button
            type="button"
            className="spiro-icon-btn"
            onClick={resetAll}
            aria-label={tx('重置')}
          >
            <ArrowCounterClockwise weight="bold" />
          </button>
        </div>

        <div className="spiro-slider-group">
          <div className="spiro-param spiro-slider-ratio">
            <label>
              {tx('齿轮比 r/R')}<strong className="is-yellow">{tx(ratio.toFixed(2))}</strong>
            </label>
            <input
              type="range" min={10} max={90} step={1}
              value={Math.round(ratio * 100)}
              onChange={(e) => { registerOnce(); setRatio(Number(e.target.value) / 100) }}
              aria-label={tx('齿轮比')}
            />
          </div>
          <div className="spiro-param spiro-slider-pen">
            <label>
              {tx('笔距 d')}<strong className="is-yellow">{tx((penDist).toFixed(2))}r</strong>
            </label>
            <input
              type="range" min={10} max={150} step={1}
              value={Math.round(penDist * 100)}
              onChange={(e) => { registerOnce(); setPenDist(Number(e.target.value) / 100) }}
              aria-label={tx('笔距')}
            />
          </div>
          <div className="spiro-param spiro-slider-speed">
            <label>
              {tx('绘制速度')}<strong className="is-yellow">{tx(speed.toFixed(1))}x</strong>
            </label>
            <input
              type="range" min={2} max={30} step={1}
              value={Math.round(speed * 10)}
              onChange={(e) => { registerOnce(); setSpeed(Number(e.target.value) / 10) }}
              aria-label={tx('绘制速度')}
            />
          </div>
        </div>
        <div className="spiro-hint">{tx('点击画面叠加新曲线（最多 5 层）')}</div>
      </footer>

      {whyOpen && (
        <div className="spiro-why" role="dialog" aria-label={tx('万花尺原理解释')}>
          <div className="spiro-why-card">
            <button type="button" className="spiro-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('内旋轮线（Hypotrochoid）')}</h2>
            <p>
              {tx('小圆在大圆内侧无滑动滚动时，固定在小圆上的一支笔画出的轨迹就是内旋轮线：')}
            </p>
            <p className="spiro-formula">
              x(t) = (R−r)cos t + d·cos((R−r)t/r)<br />
              y(t) = (R−r)sin t − d·sin((R−r)t/r)
            </p>
            <p>
              {tx('当 r/R 是有理数时，曲线必然闭合。闭合所需圈数 = r / gcd(R,r)。尖点数 = R / gcd(R,r)（当 d = r 时出现尖点，因为笔恰好在齿轮边缘，速度瞬间为零）。')}
            </p>
            <p>
              <span className="is-purple">{tx('更深的联系：')}</span>
              {tx('内旋轮线本质上是两个不同频率的圆周运动的叠加——这正是傅里叶级数的几何直觉。任何闭合曲线都可以分解为一系列旋转的圆（epicycle），万花尺只是最简单的两层叠加。')}
            </p>
            <small>{tx('延伸阅读：Wikipedia Hypotrochoid · 3Blue1Brown 傅里叶级数可视化')}</small>
          </div>
        </div>
      )}

      <div className="oss-engine-credit spiro-credit">{tx('Canvas 2D · Hypotrochoid · 本地构建')}</div>

      <GuideTour worldId="spirograph" steps={guideSteps} />
      <GhostHint worldId="spirograph" gesture={{ type: 'drag', target: '.spiro-slider-ratio input', dx: 40, dy: 0, label: tx('拖动改变齿轮比') }} />
    </div>
  )
}
