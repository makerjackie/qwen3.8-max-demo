import './styles/PendulumWave.css'

import { useEffect, useRef, useState } from 'react'
import { ArrowCounterClockwise, Pause, Play, Question, Trophy, X } from '@phosphor-icons/react'

import type { ExperienceControls } from '~/components/ExperienceShell'
import { GuideTour, type GuideStep } from '~/components/experiences/GuideTour'
import { GhostHint } from '~/components/experiences/GhostHint'
import { useExperienceI18n } from '~/i18n/experience'

const CYAN = '#4dd0e1'
const PURPLE = '#b15cff'
const RED = '#ff6b6b'
const G = 9.81
const TRAIL = 5

export function PendulumWave({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [count, setCount] = useState(15)
  const [angleDeg, setAngleDeg] = useState(28)
  const [timeScale, setTimeScale] = useState(3)
  const [playing, setPlaying] = useState(true)
  const [whyOpen, setWhyOpen] = useState(false)
  const [hud, setHud] = useState({ t: 0, cycles: 0, syncFlash: 0 })
  const finishedRef = useRef(false)

  const st = useRef({
    t: 7,
    period: 60,
    base: 30,
    count: 15,
    angle: (28 * Math.PI) / 180,
    timeScale: 3,
    playing: true,
    custom: new Map<number, number>(), // per-pendulum release angle override
    frozen: new Set<number>(),
    dragIndex: -1,
    trails: [] as Array<Array<{ x: number; y: number }>>,
    lastNow: 0,
    syncFlashAt: -1e9,
    cycles: 0,
    hudAt: 0,
  })
  st.current.count = count
  st.current.angle = (angleDeg * Math.PI) / 180
  st.current.timeScale = timeScale
  st.current.playing = playing

  useEffect(() => {
    controls.completeOnboarding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls])

  const reset = () => {
    const s = st.current
    s.t = 0
    s.cycles = 0
    s.trails = []
    s.custom.clear()
    s.frozen.clear()
    finishedRef.current = false
    setPlaying(true)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0

    const geom = (w: number, h: number) => {
      const mobile = w < 720
      const beamY = mobile ? h * 0.2 : h * 0.16
      const marginX = mobile ? 26 : 64
      const L = mobile ? h * 0.42 : h * 0.54
      const bobR = Math.max(7, Math.min(14, w / 80))
      return { mobile, beamY, marginX, L, bobR }
    }
    const pivotX = (i: number, w: number, marginX: number, n: number) =>
      marginX + (i * (w - 2 * marginX)) / Math.max(1, n - 1)

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
      const dt = s.lastNow ? Math.min((now - s.lastNow) / 1000, 0.05) : 0
      s.lastNow = now
      const { mobile, beamY, marginX, L, bobR } = geom(w, h)
      const n = s.count

      if (s.playing) {
        const prev = s.t
        s.t += dt * s.timeScale
        if (Math.floor(prev / s.period) < Math.floor(s.t / s.period)) {
          s.syncFlashAt = now
          s.cycles += 1
          if (!finishedRef.current) {
            finishedRef.current = true
            controls.finish()
          }
        }
      }
      const phase = s.t % s.period

      const bobAt = (i: number, t: number) => {
        const a = s.custom.has(i) ? s.custom.get(i)! : s.angle
        const osc = s.base + i
        const ang = a * Math.cos((2 * Math.PI * osc * t) / s.period)
        const px = pivotX(i, w, marginX, n)
        return { x: px + L * Math.sin(ang), y: beamY + L * Math.cos(ang), px }
      }

      if (now - s.hudAt > 120) {
        s.hudAt = now
        setHud({ t: s.t, cycles: s.cycles, syncFlash: Math.max(0, 1 - (now - s.syncFlashAt) / 1400) })
      }

      // ---- draw ----
      ctx.fillStyle = '#0a0a14'
      ctx.fillRect(0, 0, w, h)

      // top rail (metallic bar)
      const grad = ctx.createLinearGradient(0, beamY - 5, 0, beamY + 5)
      grad.addColorStop(0, 'rgba(180,195,215,0.85)')
      grad.addColorStop(0.5, 'rgba(120,135,160,0.7)')
      grad.addColorStop(1, 'rgba(60,70,90,0.6)')
      ctx.fillStyle = grad
      ctx.fillRect(marginX - 26, beamY - 4, w - 2 * marginX + 52, 8)

      // trails (motion blur)
      if (s.playing) {
        if (s.trails.length !== n) s.trails = Array.from({ length: n }, () => [])
        for (let i = 0; i < n; i += 1) {
          const tr = s.trails[i]
          tr.push(bobAt(i, s.t))
          while (tr.length > TRAIL) tr.shift()
        }
      }
      for (let i = 0; i < n; i += 1) {
        const tr = s.trails[i]
        if (!tr) continue
        const hue = (i / n) * 360
        for (let k = 0; k < tr.length - 1; k += 1) {
          const a = (k / tr.length) * 0.3
          ctx.fillStyle = `hsla(${hue},85%,62%,${a.toFixed(3)})`
          ctx.beginPath()
          ctx.arc(tr[k].x, tr[k].y, bobR * 0.55, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // strings
      ctx.lineWidth = 1
      for (let i = 0; i < n; i += 1) {
        const b = bobAt(i, s.t)
        ctx.strokeStyle = s.frozen.has(i) ? 'rgba(255,107,107,0.45)' : 'rgba(210,220,235,0.28)'
        ctx.beginPath()
        ctx.moveTo(b.px, beamY)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      // wave envelope (purple smooth curve through bob centers)
      ctx.strokeStyle = 'rgba(177,92,255,0.55)'
      ctx.lineWidth = 2.5
      ctx.shadowColor = PURPLE
      ctx.shadowBlur = 10
      ctx.beginPath()
      for (let i = 0; i < n; i += 1) {
        const b = bobAt(i, s.t)
        if (i === 0) ctx.moveTo(b.x, b.y)
        else {
          const prevB = bobAt(i - 1, s.t)
          const mx = (prevB.x + b.x) / 2
          const my = (prevB.y + b.y) / 2
          ctx.quadraticCurveTo(prevB.x, prevB.y, mx, my)
        }
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      // bobs (rainbow hue)
      const nearSync = phase < 0.7 || s.period - phase < 0.7
      for (let i = 0; i < n; i += 1) {
        const b = bobAt(i, s.t)
        const hue = (i / n) * 360
        const frozen = s.frozen.has(i)
        ctx.shadowColor = frozen ? RED : `hsl(${hue},85%,60%)`
        ctx.shadowBlur = nearSync ? 22 : 14
        ctx.fillStyle = frozen ? RED : `hsl(${hue},85%,60%)`
        ctx.beginPath()
        ctx.arc(b.x, b.y, bobR, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.arc(b.x - bobR * 0.3, b.y - bobR * 0.3, bobR * 0.25, 0, Math.PI * 2)
        ctx.fill()
      }

      // re-sync flash (red magical moment)
      const flashAge = (now - s.syncFlashAt) / 1600
      if (flashAge >= 0 && flashAge < 1) {
        const a = 1 - flashAge
        const rg = ctx.createRadialGradient(w / 2, beamY + L * 0.5, 10, w / 2, beamY + L * 0.5, Math.max(w, h) * 0.6)
        rg.addColorStop(0, `rgba(255,107,107,${(0.3 * a).toFixed(3)})`)
        rg.addColorStop(1, 'rgba(255,107,107,0)')
        ctx.fillStyle = rg
        ctx.fillRect(0, 0, w, h)
        ctx.textAlign = 'center'
        ctx.fillStyle = `rgba(255,107,107,${Math.min(1, 1.6 * a).toFixed(3)})`
        ctx.font = `800 ${mobile ? 28 : 44}px system-ui, sans-serif`
        ctx.fillText(tx('完美再同步！'), w / 2, beamY + L * 0.52)
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- pointer interaction: drag bob to set custom angle, click to freeze ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let downAt = 0
    let moved = false

    const locate = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const mobile = w < 720
      const beamY = mobile ? h * 0.2 : h * 0.16
      const marginX = mobile ? 26 : 64
      const L = mobile ? h * 0.42 : h * 0.54
      const bobR = Math.max(7, Math.min(14, w / 80))
      const n = st.current.count
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      for (let i = 0; i < n; i += 1) {
        const pivot = marginX + (i * (w - 2 * marginX)) / Math.max(1, n - 1)
        const a = st.current.custom.has(i) ? st.current.custom.get(i)! : st.current.angle
        const osc = st.current.base + i
        const ang = a * Math.cos((2 * Math.PI * osc * st.current.t) / st.current.period)
        const bx = pivot + L * Math.sin(ang)
        const by = beamY + L * Math.cos(ang)
        if (Math.hypot(px - bx, py - by) < bobR + 8) return { i, pivot, beamY, L }
      }
      return null
    }

    const onDown = (e: PointerEvent) => {
      const hit = locate(e)
      if (!hit) return
      controls.registerInteraction()
      st.current.dragIndex = hit.i
      downAt = performance.now()
      moved = false
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const s = st.current
      if (s.dragIndex < 0) return
      moved = true
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const dx = px - hit_pivot(s.dragIndex, rect.width)
      const dy = py - (rect.height < 720 ? rect.height * 0.2 : rect.height * 0.16)
      const ang = Math.atan2(dx, dy)
      s.custom.set(s.dragIndex, Math.max(-0.9, Math.min(0.9, ang)))
    }
    const onUp = (e: PointerEvent) => {
      const s = st.current
      if (s.dragIndex >= 0 && !moved && performance.now() - downAt < 250) {
        const i = s.dragIndex
        if (s.frozen.has(i)) s.frozen.delete(i)
        else s.frozen.add(i)
      }
      s.dragIndex = -1
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    const hit_pivot = (i: number, w: number) => {
      const mobile = w < 720
      const marginX = mobile ? 26 : 64
      const n = st.current.count
      return marginX + (i * (w - 2 * marginX)) / Math.max(1, n - 1)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const guideSteps: Array<GuideStep> = [
    {
      title: tx('看彩虹波浪浮现'),
      body: tx('15 个摆长各不相同，频率依次递增。同时释放后，相位差排出一条流动的彩虹丝带——蛇形波。'),
      action: () => {
        reset()
        setTimeScale(2)
      },
    },
    {
      title: tx('拖动一个摆球'),
      body: tx('抓住任意彩色摆球往上拖，给它一个专属释放角度；轻点一下则冻结/解冻它。'),
      awaitInteraction: true,
    },
    {
      title: tx('等待再同步'),
      body: tx('把时间流速拨快。每过 60 秒，所有摆恰好完成整数次摆动，同时回到起点——红色闪光的魔法时刻。'),
      action: () => setTimeScale(4),
    },
  ]

  return (
    <div className="oss-experience pwave-experience">
      <canvas ref={canvasRef} className="pwave-canvas" />

      <header className="pwave-question">
        <h1>{tx('一排摆球，为什么会织出彩虹波浪又准时归队？')}</h1>
        <p>{tx('每个摆的频率精心递增，同时释放后相位差铺开成波浪，60 秒后又全部再同步。')}</p>
        <button type="button" className="pwave-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}
        </button>
      </header>

      <aside className="pwave-readout">
        <div className="pwave-readout-row">
          <small>{tx('模拟时间')}</small>
          <strong className="is-cyan">{hud.t.toFixed(1)} s</strong>
        </div>
        <div className="pwave-readout-row">
          <small>{tx('再同步次数')}</small>
          <strong className="is-cyan">{hud.cycles}</strong>
        </div>
        <div className="pwave-progress" aria-hidden>
          <div className="pwave-progress-fill" style={{ width: `${((hud.t % 60) / 60) * 100}%` }} />
        </div>
        {hud.cycles > 0 && (
          <div className="pwave-success">
            <Trophy weight="fill" /> {tx('观察到完整再同步时刻')}
          </div>
        )}
      </aside>

      <footer className="pwave-controls">
        <div className="pwave-transport">
          <button
            type="button"
            className="pwave-icon-btn"
            aria-label={playing ? tx('暂停') : tx('播放')}
            onClick={() => {
              controls.registerInteraction()
              setPlaying((p) => !p)
            }}
          >
            {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
          </button>
          <button
            type="button"
            className="pwave-icon-btn"
            aria-label={tx('重置')}
            onClick={() => {
              controls.registerInteraction()
              reset()
            }}
          >
            <ArrowCounterClockwise weight="bold" />
          </button>
          <button
            type="button"
            className="pwave-release-btn"
            onClick={() => {
              controls.registerInteraction()
              st.current.custom.clear()
              st.current.frozen.clear()
              st.current.t = 0
              st.current.trails = []
              setPlaying(true)
            }}
          >
            {tx('释放')}
          </button>
        </div>
        <div className="pwave-param">
          <label>
            {tx('摆数')}
            <strong>{count}</strong>
          </label>
          <input
            type="range"
            min={8}
            max={25}
            step={1}
            value={count}
            onChange={(e) => {
              controls.registerInteraction()
              setCount(Number(e.target.value))
              st.current.trails = []
            }}
            aria-label={tx('摆数')}
          />
        </div>
        <div className="pwave-param">
          <label>
            {tx('释放角度')}
            <strong>{angleDeg}°</strong>
          </label>
          <input
            type="range"
            min={10}
            max={45}
            step={1}
            value={angleDeg}
            onChange={(e) => {
              controls.registerInteraction()
              setAngleDeg(Number(e.target.value))
            }}
            aria-label={tx('释放角度')}
          />
        </div>
        <div className="pwave-param">
          <label>
            {tx('时间流速')}
            <strong>×{timeScale}</strong>
          </label>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={timeScale}
            onChange={(e) => {
              controls.registerInteraction()
              setTimeScale(Number(e.target.value))
            }}
            aria-label={tx('时间流速')}
          />
        </div>
      </footer>

      {whyOpen && (
        <div className="pwave-why" role="dialog" aria-label={tx('单摆波原理解释')}>
          <div className="pwave-why-card">
            <button type="button" className="pwave-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('频率比如何织出波浪，又准时归队')}</h2>
            <p>
              {tx('第 n 个摆的摆长被精心选取，使它在时间 T 内恰好完成 (N₀+n) 次完整摆动：')}
              <strong>Lₙ = g·(T / 2π(N₀+n))²</strong>
              {tx('。于是每个摆的频率是 (N₀+n)/T，相邻摆频率差恒为 1/T。')}
            </p>
            <p>
              {tx('正是这个恒定的频率差，让相邻摆的相位差随时间均匀铺开，')}
              <span className="is-purple">{tx('视觉上排成行波、驻波，再到混乱')}</span>
              {tx('。这其实是傅里叶合成的直观演示——波浪是众多等差频率模式叠加的结果。')}
            </p>
            <p>
              {tx('到了 t = T，每个摆都完成了整数次摆动，')}
              <span className="is-red">{tx('全部同时回到起点——再同步')}</span>
              {tx('。这是频率比的最小公倍数效应，与拍频同源。')}
            </p>
            <p>
              <span className="is-red">{tx('边界条件：')}</span>
              {tx('理想模型假设小角度（sinθ≈θ）、无空气阻力、摆长精确。真实装置中频率误差会累积，再同步逐渐模糊；摆角过大时单摆周期本身会随摆幅漂移。')}
            </p>
            <small>{tx('延伸阅读：Wikipedia Pendulum wave · 傅里叶合成 · 拍频 · Harvard 自然历史博物馆单摆波装置')}</small>
          </div>
        </div>
      )}

      <div className="oss-engine-credit pwave-credit">{tx('Canvas 2D · 等差频率叠加 · 本地构建')}</div>

      <GuideTour worldId="pendulum-wave" steps={guideSteps} />
      <GhostHint
        worldId="pendulum-wave"
        gesture={{ type: 'drag', target: '.pwave-canvas', dx: 0, dy: -40, label: tx('拖动摆球，定制释放角度') }}
      />
    </div>
  )
}
