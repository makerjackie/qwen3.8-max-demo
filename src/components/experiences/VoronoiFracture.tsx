import './styles/VoronoiFracture.css'

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

type Seed = { x: number; y: number }
type Cell = {
  seed: Seed
  hue: number
  cx: number; cy: number
  vx: number; vy: number
  angle: number; angVel: number
  opacity: number
  homeX: number; homeY: number
}

function computeVoronoiCells(seeds: Array<Seed>, w: number, h: number): Array<{ seed: Seed; cx: number; cy: number; hue: number }> {
  return seeds.map((seed, i) => ({
    seed,
    cx: seed.x,
    cy: seed.y,
    hue: (i * 137.508) % 360,
  }))
}

function randomSeeds(count: number, w: number, h: number): Array<Seed> {
  const seeds: Array<Seed> = []
  const margin = 40
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: margin + Math.random() * (w - margin * 2),
      y: margin + Math.random() * (h - margin * 2),
    })
  }
  return seeds
}

export function VoronoiFracture({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [seedCount, setSeedCount] = useState(18)
  const [force, setForce] = useState(6)
  const [gravity, setGravity] = useState(4)
  const [whyOpen, setWhyOpen] = useState(false)
  const [fractured, setFractured] = useState(false)
  const [cellCount, setCellCount] = useState(0)
  const [challengeDone, setChallengeDone] = useState(false)
  const finishedRef = useRef(false)
  const interactedRef = useRef(false)

  const st = useRef({
    seeds: [] as Array<Seed>,
    cells: [] as Array<Cell>,
    phase: 'intact' as 'intact' | 'fracturing' | 'scattered' | 'reassembling',
    impact: null as Seed | null,
    impactFlash: 0,
    lastNow: 0,
    w: 0,
    h: 0,
  })

  const registerOnce = useCallback(() => {
    if (!interactedRef.current) {
      interactedRef.current = true
      controls.registerInteraction()
    }
  }, [controls])

  const initSeeds = useCallback((count: number) => {
    const s = st.current
    const w = s.w || 800
    const h = s.h || 500
    s.seeds = randomSeeds(count, w, h)
    s.cells = s.seeds.map((seed, i) => ({
      seed,
      hue: (i * 137.508) % 360,
      cx: seed.x, cy: seed.y,
      vx: 0, vy: 0,
      angle: 0, angVel: 0,
      opacity: 1,
      homeX: seed.x, homeY: seed.y,
    }))
    s.phase = 'intact'
    s.impact = null
    setFractured(false)
    setCellCount(count)
  }, [])

  const triggerFracture = useCallback((impact: Seed) => {
    const s = st.current
    s.impact = impact
    s.impactFlash = 1
    const forceMag = force * 30
    s.cells = s.cells.map((cell) => {
      const dx = cell.cx - impact.x
      const dy = cell.cy - impact.y
      const dist = Math.max(30, Math.sqrt(dx * dx + dy * dy))
      const nx = dx / dist
      const ny = dy / dist
      const impulse = forceMag * (1 - Math.min(dist / 400, 0.7))
      return {
        ...cell,
        vx: nx * impulse * (0.6 + Math.random() * 0.8),
        vy: ny * impulse * (0.6 + Math.random() * 0.8) - Math.random() * 2,
        angVel: (Math.random() - 0.5) * impulse * 0.04,
        opacity: 1,
      }
    })
    s.phase = 'fracturing'
    setFractured(true)
    if (s.cells.length > 30 && !finishedRef.current) {
      finishedRef.current = true
      setChallengeDone(true)
      controls.finish()
    }
  }, [force, controls])

  const reassemble = useCallback(() => {
    const s = st.current
    s.phase = 'reassembling'
    setFractured(false)
  }, [])

  useEffect(() => {
    controls.completeOnboarding()
    const s = st.current
    s.w = 800; s.h = 500
    initSeeds(seedCount)
    const timer = setTimeout(() => {
      const cx = (s.w || 800) / 2
      const cy = (s.h || 500) / 2
      triggerFracture({ x: cx, y: cy })
    }, 3000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0

    const frame = (now: number) => {
      const s = st.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        const firstRealSize = s.w === 800 && w > 0 && Math.abs(w - 800) > 50
        s.w = w; s.h = h
        if (firstRealSize && s.phase === 'intact') {
          initSeeds(s.cells.length || seedCount)
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const dt = s.lastNow ? Math.min((now - s.lastNow) / 1000, 0.05) : 0.016
      s.lastNow = now
      const grav = gravity * 30

      // Physics update
      if (s.phase === 'fracturing' || s.phase === 'scattered') {
        let allSlow = true
        for (const cell of s.cells) {
          cell.vy += grav * dt
          cell.cx += cell.vx * dt
          cell.cy += cell.vy * dt
          cell.angle += cell.angVel * dt
          cell.vx *= 0.992
          cell.angVel *= 0.985
          // Floor bounce
          if (cell.cy > h - 30) {
            cell.cy = h - 30
            cell.vy *= -0.35
            cell.vx *= 0.8
            cell.angVel *= 0.7
          }
          // Wall bounce
          if (cell.cx < 20 || cell.cx > w - 20) {
            cell.cx = Math.max(20, Math.min(w - 20, cell.cx))
            cell.vx *= -0.5
          }
          if (Math.abs(cell.vx) > 0.5 || Math.abs(cell.vy) > 0.5) allSlow = false
        }
        if (allSlow && s.phase === 'fracturing') s.phase = 'scattered'
      }

      if (s.phase === 'reassembling') {
        let allHome = true
        for (const cell of s.cells) {
          const dx = cell.homeX - cell.cx
          const dy = cell.homeY - cell.cy
          cell.cx += dx * 0.08
          cell.cy += dy * 0.08
          cell.angle *= 0.9
          cell.vx = 0; cell.vy = 0; cell.angVel = 0
          cell.opacity = Math.min(1, cell.opacity + dt * 3)
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) allHome = false
        }
        if (allHome) s.phase = 'intact'
      }

      if (s.impactFlash > 0) s.impactFlash = Math.max(0, s.impactFlash - dt * 3)

      // ---- Draw ----
      // Dark background with subtle warm gradient (like light through glass)
      const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7)
      bgGrad.addColorStop(0, '#12141e')
      bgGrad.addColorStop(1, '#080a10')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)

      // Draw Voronoi cells (large, overlapping, filling the canvas like stained glass)
      const cellSize = Math.max(12, Math.min(w, h) / Math.sqrt(s.cells.length) * 2.2)
      for (const cell of s.cells) {
        if (cell.opacity <= 0) continue
        ctx.save()
        ctx.translate(cell.cx, cell.cy)
        ctx.rotate(cell.angle)
        ctx.globalAlpha = cell.opacity

        const r = cellSize * 0.52
        const lightness = 50 + (cell.hue % 15)
        const sat = s.phase === 'intact' ? 70 : 62

        // Cell body — rich stained glass color
        ctx.fillStyle = `hsla(${cell.hue}, ${sat}%, ${lightness}%, 0.82)`
        ctx.strokeStyle = '#1a1c24'
        ctx.lineWidth = 3
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6
          const px = Math.cos(a) * r * (0.88 + 0.12 * Math.sin(cell.hue + i * 1.3))
          const py = Math.sin(a) * r * (0.88 + 0.12 * Math.cos(cell.hue + i * 0.9))
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Inner glow (light passing through glass)
        const innerGrad = ctx.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r * 0.8)
        innerGrad.addColorStop(0, `hsla(${cell.hue}, 80%, ${lightness + 20}%, 0.3)`)
        innerGrad.addColorStop(1, 'transparent')
        ctx.fillStyle = innerGrad
        ctx.fill()

        // Bright edge highlight (leading catch light)
        ctx.strokeStyle = `hsla(${cell.hue}, 50%, 75%, 0.2)`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(-r * 0.15, -r * 0.15, r * 0.4, Math.PI * 0.7, Math.PI * 1.7)
        ctx.stroke()

        ctx.restore()
      }
      ctx.globalAlpha = 1

      // Impact flash (dramatic)
      if (s.impactFlash > 0 && s.impact) {
        const flashR = 120 + (1 - s.impactFlash) * 60
        const grad = ctx.createRadialGradient(s.impact.x, s.impact.y, 0, s.impact.x, s.impact.y, flashR)
        grad.addColorStop(0, `rgba(255,240,200,${s.impactFlash * 0.9})`)
        grad.addColorStop(0.3, `rgba(255,209,102,${s.impactFlash * 0.6})`)
        grad.addColorStop(0.7, `rgba(255,107,107,${s.impactFlash * 0.3})`)
        grad.addColorStop(1, 'rgba(255,107,107,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(s.impact.x, s.impact.y, flashR, 0, Math.PI * 2)
        ctx.fill()
        // Radial cracks
        ctx.strokeStyle = `rgba(255,240,200,${s.impactFlash})`
        ctx.lineWidth = 2
        for (let i = 0; i < 12; i++) {
          const a = (Math.PI / 6) * i + s.impactFlash * 0.3
          const len = 40 + s.impactFlash * 80
          ctx.beginPath()
          ctx.moveTo(s.impact.x + Math.cos(a) * 10, s.impact.y + Math.sin(a) * 10)
          ctx.lineTo(s.impact.x + Math.cos(a) * len, s.impact.y + Math.sin(a) * len)
          ctx.stroke()
        }
      }

      // Seed points (yellow dots, only in intact state)
      if (s.phase === 'intact') {
        for (const cell of s.cells) {
          ctx.fillStyle = YELLOW
          ctx.shadowColor = YELLOW
          ctx.shadowBlur = 6
          ctx.beginPath()
          ctx.arc(cell.seed.x, cell.seed.y, 3.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravity])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    registerOnce()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const s = st.current
    // Add seed at click and re-fracture
    s.seeds.push({ x, y })
    s.cells.push({
      seed: { x, y },
      hue: (s.cells.length * 137.508) % 360,
      cx: x, cy: y,
      vx: 0, vy: 0,
      angle: 0, angVel: 0,
      opacity: 1,
      homeX: x, homeY: y,
    })
    setCellCount(s.cells.length)
    triggerFracture({ x, y })
  }, [registerOnce, triggerFracture])

  const handleDoubleClick = useCallback(() => {
    registerOnce()
    reassemble()
  }, [registerOnce, reassemble])

  const handleSeedChange = useCallback((val: number) => {
    registerOnce()
    setSeedCount(val)
    initSeeds(val)
  }, [registerOnce, initSeeds])

  const handleReset = useCallback(() => {
    registerOnce()
    initSeeds(seedCount)
  }, [registerOnce, initSeeds, seedCount])

  const guideSteps: Array<GuideStep> = [
    {
      title: tx('点击碎裂'),
      body: tx('点击玻璃表面添加冲击点，Voronoi 碎片会从撞击处向外飞散。'),
      target: '.voronoi-canvas',
      awaitInteraction: true,
    },
    {
      title: tx('调整种子数'),
      body: tx('拖动「种子数」滑块增加碎片数量——更多种子意味着更细碎的玻璃。'),
      target: '.voronoi-slider-seeds',
    },
    {
      title: tx('挑战：30 块碎片'),
      body: tx('让一次碎裂产生超过 30 块碎片。把种子数调到 31 以上，然后点击触发碎裂！'),
      target: '.voronoi-slider-seeds',
    },
  ]

  return (
    <div className="oss-experience voronoi-experience">
      <canvas
        ref={canvasRef}
        className="voronoi-canvas"
        onClick={handleCanvasClick}
        onDoubleClick={handleDoubleClick}
      />

      <header className="voronoi-question">
        <h1>{tx('玻璃碎裂的裂纹为什么是这个形状？')}</h1>
        <p>{tx('Voronoi 图把平面按「最近种子」划分——碎裂、细胞、流域都用同一套数学。')}</p>
        <button type="button" className="voronoi-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}
        </button>
      </header>

      <aside className="voronoi-readout">
        <div className="voronoi-readout-row">
          <small>{tx('碎片数')}</small>
          <strong className="is-cyan">{cellCount}</strong>
        </div>
        <div className="voronoi-readout-row">
          <small>{tx('状态')}</small>
          <strong className={fractured ? 'is-red' : 'is-cyan'}>
            {fractured ? tx('已碎裂') : tx('完整')}
          </strong>
        </div>
        {challengeDone && (
          <div className="voronoi-success">
            <Trophy weight="fill" /> {tx('30+ 碎片挑战达成！')}
          </div>
        )}
      </aside>

      <footer className="voronoi-controls">
        <div className="voronoi-slider-group voronoi-slider-seeds">
          <label>{tx('种子数')} <strong>{seedCount}</strong></label>
          <input
            type="range" min={3} max={50} value={seedCount}
            onChange={(e) => handleSeedChange(Number(e.target.value))}
          />
        </div>
        <div className="voronoi-slider-group">
          <label>{tx('碎裂力度')} <strong>{force}</strong></label>
          <input
            type="range" min={1} max={12} value={force}
            onChange={(e) => setForce(Number(e.target.value))}
          />
        </div>
        <div className="voronoi-slider-group">
          <label>{tx('重力')} <strong>{gravity}</strong></label>
          <input
            type="range" min={0} max={10} value={gravity}
            onChange={(e) => setGravity(Number(e.target.value))}
          />
        </div>
        <button type="button" className="voronoi-reset-btn" onClick={handleReset}>
          <ArrowCounterClockwise weight="bold" /> {tx('重置')}
        </button>
      </footer>

      <GhostHint
        worldId="voronoi-fracture"
        gesture={{ type: 'tap', target: '.voronoi-canvas', label: '点击碎裂玻璃' }}
      />
      <GuideTour worldId="voronoi-fracture" steps={guideSteps} />

      {whyOpen && (
        <div className="voronoi-why" role="dialog" aria-label={tx('Voronoi 图的原理')}>
          <div className="voronoi-why-card">
            <button type="button" className="voronoi-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('为什么碎裂像 Voronoi？')}</h2>
            <p>
              {tx('Voronoi 图把平面按「离哪个种子最近」划分成多边形区域。')}
              <strong>{tx('每个区域内的所有点，到该种子的距离都比到其他种子近。')}</strong>
              {tx('这正是脆性材料断裂时的能量最小化路径——裂纹沿等距线扩展。')}
            </p>
            <p>
              {tx('Voronoi 图的对偶是')} <span className="is-purple">{tx('Delaunay 三角剖分')}</span>
              {tx('：连接相邻种子形成三角形，其外接圆内不含其他种子。')}
              {tx('两者互为镜像，共同描述了「最近邻」的完整几何结构。')}
            </p>
            <p>
              <span className="is-red">{tx('真实应用：')}</span>
              {tx('材料科学用 Voronoi 模拟金属晶粒与断裂纹；生物学中细胞排列（如蜻蜓翅膀）近似 Voronoi；')}
              {tx('地理学中流域划分本质上是地形上的 Voronoi 分区。')}
            </p>
            <small>{tx('延伸：Fortune\'s algorithm (1986) 可在 O(n log n) 内计算完整 Voronoi 图。')}</small>
          </div>
        </div>
      )}
    </div>
  )
}
