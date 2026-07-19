import './styles/DendriticCrystal.css'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowCounterClockwise, Play, Pause, Question, X, Trophy } from '@phosphor-icons/react'

import type { ExperienceControls } from '~/components/ExperienceShell'
import { GuideTour, type GuideStep } from '~/components/experiences/GuideTour'
import { GhostHint } from '~/components/experiences/GhostHint'
import { useExperienceI18n } from '~/i18n/experience'

const GRID = 400 // 400×400 晶格
const CENTER = GRID / 2
const CHALLENGE_TARGET = 5000
const MAX_WALKERS = 50 // 屏幕上同时显示的随机游走粒子数
const MAX_STEPS = 4000 // 单个游走粒子的最大步数

type Sym = 1 | 4 | 6

// 颜色语义：黄=生长前沿 青=读数 紫=扩散场/游走者 红=高密度核心
// 沉积时间配色：核心深紫 → 中段蓝 → 尖端青白（冰晶渐变）
function ageColor(t: number): [number, number, number] {
  // t ∈ [0,1]，0 = 最早沉积，1 = 最新
  if (t < 0.5) {
    const k = t / 0.5
    // 深紫 (90,40,140) → 蓝 (40,90,200)
    return [Math.round(90 + (40 - 90) * k), Math.round(40 + (90 - 40) * k), Math.round(140 + (200 - 140) * k)]
  }
  const k = (t - 0.5) / 0.5
  // 蓝 (40,90,200) → 青白 (150,235,245)
  return [Math.round(40 + (150 - 40) * k), Math.round(90 + (235 - 90) * k), Math.round(200 + (245 - 200) * k)]
}

export function DendriticCrystal({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [whyOpen, setWhyOpen] = useState(false)
  const [running, setRunning] = useState(true)
  const [temperature, setTemperature] = useState(0.5) // 0..1，影响步长/随机性
  const [stickProb, setStickProb] = useState(0.6) // 0.1..1.0
  const [symmetry, setSymmetry] = useState<Sym>(6)
  const [hud, setHud] = useState({ count: 0, rate: 0, radius: 0, finished: false })

  // 模拟状态（ref，避免每帧触发 React 重渲染）
  const sim = useRef({
    grid: new Uint8Array(GRID * GRID), // 0 空 / 1 晶体
    age: new Float32Array(GRID * GRID), // 沉积归一化时间
    density: new Uint16Array(GRID * GRID), // 邻域计数（用于核心红色）
    count: 0,
    maxRadius: 0,
    walkers: [] as Array<{ x: number; y: number }>,
    spawnRadius: 6,
    killRadius: 80,
    recentSticks: [] as Array<{ x: number; y: number; t: number }>, // 黄色闪光
    running: true,
    temperature: 0.5,
    stickProb: 0.6,
    symmetry: 6 as Sym,
    rateAccum: 0,
    rateTimer: 0,
    rate: 0,
    lastNow: 0,
    finished: false,
    img: null as ImageData | null,
  })

  useEffect(() => {
    controls.completeOnboarding()
  }, [controls])

  // 同步控件 → 模拟 ref
  useEffect(() => {
    sim.current.temperature = temperature
  }, [temperature])
  useEffect(() => {
    sim.current.stickProb = stickProb
  }, [stickProb])
  useEffect(() => {
    sim.current.symmetry = symmetry
  }, [symmetry])
  useEffect(() => {
    sim.current.running = running
  }, [running])

  const resetSim = useCallback(() => {
    const s = sim.current
    s.grid.fill(0)
    s.age.fill(0)
    s.density.fill(0)
    s.count = 0
    s.maxRadius = 0
    s.walkers = []
    s.spawnRadius = 6
    s.killRadius = 80
    s.recentSticks = []
    s.rateAccum = 0
    s.rateTimer = 0
    s.rate = 0
    s.finished = false
    // 中心种子
    const c = CENTER * GRID + CENTER
    s.grid[c] = 1
    s.age[c] = 0
    s.count = 1
    setHud({ count: 1, rate: 0, radius: 0, finished: false })
  }, [])

  useEffect(() => {
    resetSim()
  }, [resetSim])

  const addSeed = useCallback((gx: number, gy: number) => {
    const s = sim.current
    const ix = Math.round(gx)
    const iy = Math.round(gy)
    if (ix < 1 || ix >= GRID - 1 || iy < 1 || iy >= GRID - 1) return
    const idx = iy * GRID + ix
    if (s.grid[idx]) return
    s.grid[idx] = 1
    s.age[idx] = s.count > 0 ? 0.5 : 0
    s.count += 1
    s.recentSticks.push({ x: ix, y: iy, t: performance.now() })
  }, [])

  // 对称复制：把一个粘附点映射到所有对称位置
  const placeSymmetric = useCallback((x: number, y: number, sym: Sym, ageVal: number) => {
    const s = sim.current
    const dx = x - CENTER
    const dy = y - CENTER
    const place = (px: number, py: number) => {
      const ix = Math.round(px)
      const iy = Math.round(py)
      if (ix < 0 || ix >= GRID || iy < 0 || iy >= GRID) return
      const idx = iy * GRID + ix
      if (s.grid[idx]) return
      s.grid[idx] = 1
      s.age[idx] = ageVal
      s.count += 1
      const r = Math.hypot(ix - CENTER, iy - CENTER)
      if (r > s.maxRadius) s.maxRadius = r
      // 增加邻域密度
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = ix + ox
          const ny = iy + oy
          if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) s.density[ny * GRID + nx] += 1
        }
      }
      s.recentSticks.push({ x: ix, y: iy, t: performance.now() })
    }
    if (sym === 1) {
      place(x, y)
      return
    }
    const n = sym === 4 ? 4 : 6
    const base = Math.atan2(dy, dx)
    const rad = Math.hypot(dx, dy)
    for (let k = 0; k < n; k += 1) {
      const a = base + (k * 2 * Math.PI) / n
      place(CENTER + rad * Math.cos(a), CENTER + rad * Math.sin(a))
      // 镜像（雪花需要反射对称才漂亮）
      const am = -base + (k * 2 * Math.PI) / n
      place(CENTER + rad * Math.cos(am), CENTER + rad * Math.sin(am))
    }
  }, [])

  // 主循环
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0

    const frame = (now: number) => {
      const s = sim.current
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

      // ---- 模拟步进 ----
      if (s.running && s.count < 60000) {
        // 补充游走粒子
        const stepLen = 1 + s.temperature * 1.5 // 温度高 → 步长大、更随机
        while (s.walkers.length < MAX_WALKERS) {
          const a = Math.random() * Math.PI * 2
          const r = s.spawnRadius + 3
          s.walkers.push({
            x: CENTER + r * Math.cos(a),
            y: CENTER + r * Math.sin(a),
          })
        }
        // 每帧推进多步，让生长可见
        const iters = 6
        for (let it = 0; it < iters; it += 1) {
          for (let wi = s.walkers.length - 1; wi >= 0; wi -= 1) {
            const wk = s.walkers[wi]
            // 随机游走（温度影响步长抖动）
            const a = Math.random() * Math.PI * 2
            wk.x += Math.cos(a) * stepLen
            wk.y += Math.sin(a) * stepLen
            const ix = Math.round(wk.x)
            const iy = Math.round(wk.y)
            // 出界或太远 → 重生
            const dist = Math.hypot(wk.x - CENTER, wk.y - CENTER)
            if (ix < 1 || ix >= GRID - 1 || iy < 1 || iy >= GRID - 1 || dist > s.killRadius) {
              const na = Math.random() * Math.PI * 2
              const nr = s.spawnRadius + 3
              wk.x = CENTER + nr * Math.cos(na)
              wk.y = CENTER + nr * Math.sin(na)
              continue
            }
            // 检查邻域是否有晶体
            let adjacent = false
            for (let oy = -1; oy <= 1 && !adjacent; oy += 1) {
              for (let ox = -1; ox <= 1; ox += 1) {
                if (s.grid[(iy + oy) * GRID + (ix + ox)]) {
                  adjacent = true
                  break
                }
              }
            }
            if (adjacent && !s.grid[iy * GRID + ix] && Math.random() < s.stickProb) {
              const ageVal = Math.min(1, s.count / CHALLENGE_TARGET)
              placeSymmetric(wk.x, wk.y, s.symmetry, ageVal)
              s.rateAccum += 1
              // 重生该游走粒子
              const na = Math.random() * Math.PI * 2
              const nr = s.spawnRadius + 3
              wk.x = CENTER + nr * Math.cos(na)
              wk.y = CENTER + nr * Math.sin(na)
            }
          }
        }
        // 动态调整生成/击杀半径，跟随晶体长大
        s.spawnRadius = s.maxRadius + 5
        s.killRadius = s.maxRadius + 60
      }

      // 生长速率统计
      s.rateTimer += dt
      if (s.rateTimer >= 0.5) {
        s.rate = Math.round(s.rateAccum / s.rateTimer)
        s.rateAccum = 0
        s.rateTimer = 0
      }

      // 挑战判定
      if (!s.finished && s.count >= CHALLENGE_TARGET && s.symmetry === 6) {
        s.finished = true
        controls.registerInteraction()
        controls.finish()
      }

      // ---- 渲染到 ImageData ----
      const mobile = w < 720
      const size = mobile ? Math.min(w * 0.94, h * 0.62) : Math.min(w * 0.66, h * 0.78)
      const cx = w / 2
      const cy = mobile ? h * 0.55 : h * 0.52
      const left = cx - size / 2
      const top = cy - size / 2

      // 离屏像素缓冲（GRID×GRID），再缩放到画布
      if (!s.img) s.img = new ImageData(GRID, GRID)
      const img = s.img
      const data = img.data
      const nowMs = now
      for (let i = 0; i < GRID * GRID; i += 1) {
        const p = i * 4
        if (s.grid[i]) {
          const dens = s.density[i]
          if (dens >= 7) {
            // 高密度核心 → 偏红
            data[p] = 200
            data[p + 1] = 70
            data[p + 2] = 90
          } else {
            const c = ageColor(s.age[i])
            data[p] = c[0]
            data[p + 1] = c[1]
            data[p + 2] = c[2]
          }
          data[p + 3] = 255
        } else {
          data[p] = 5
          data[p + 1] = 5
          data[p + 2] = 16
          data[p + 3] = 255
        }
      }
      // 黄色闪光：新粘附的粒子
      for (let i = s.recentSticks.length - 1; i >= 0; i -= 1) {
        const rs = s.recentSticks[i]
        const life = nowMs - rs.t
        if (life > 700) {
          s.recentSticks.splice(i, 1)
          continue
        }
        const idx = rs.y * GRID + rs.x
        const p = idx * 4
        const k = 1 - life / 700
        data[p] = 255
        data[p + 1] = Math.round(209 * k + 200 * (1 - k))
        data[p + 2] = Math.round(102 * k + 220 * (1 - k))
      }

      // 把像素缓冲画到离屏 canvas 再缩放
      let off = (frame as unknown as { off?: HTMLCanvasElement }).off
      if (!off) {
        off = document.createElement('canvas')
        off.width = GRID
        off.height = GRID
        ;(frame as unknown as { off?: HTMLCanvasElement }).off = off
      }
      off.getContext('2d')!.putImageData(img, 0, 0)

      // ---- 绘制 ----
      ctx.fillStyle = '#050510'
      ctx.fillRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(off, left, top, size, size)

      // 6 重对称时叠加淡六边形网格
      if (s.symmetry === 6) {
        ctx.strokeStyle = 'rgba(177,92,255,0.06)'
        ctx.lineWidth = 1
        const scale = size / GRID
        const hr = 24 * scale
        for (let gy = top; gy < top + size; gy += hr * 1.5) {
          for (let gx = left; gx < left + size; gx += hr * Math.sqrt(3)) {
            ctx.beginPath()
            for (let k = 0; k < 6; k += 1) {
              const a = (Math.PI / 3) * k + Math.PI / 6
              const px = gx + hr * Math.cos(a)
              const py = gy + hr * Math.sin(a)
              if (k === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.closePath()
            ctx.stroke()
          }
        }
      }

      // 游走粒子（紫色淡点）
      const scale = size / GRID
      ctx.fillStyle = 'rgba(177,92,255,0.55)'
      for (const wk of s.walkers) {
        const px = left + wk.x * scale
        const py = top + wk.y * scale
        ctx.beginPath()
        ctx.arc(px, py, mobile ? 1.4 : 1.8, 0, Math.PI * 2)
        ctx.fill()
      }

      // 尖端闪烁：取最近沉积的几个点画星光
      const sparkles = s.recentSticks.slice(-6)
      for (const rs of sparkles) {
        const life = nowMs - rs.t
        const k = 1 - life / 700
        if (k <= 0) continue
        const px = left + rs.x * scale
        const py = top + rs.y * scale
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * k})`
        ctx.lineWidth = 1
        const len = 5 * k
        ctx.beginPath()
        ctx.moveTo(px - len, py)
        ctx.lineTo(px + len, py)
        ctx.moveTo(px, py - len)
        ctx.lineTo(px, py + len)
        ctx.stroke()
      }

      // 生成圈（淡紫，扩散场边界）
      ctx.strokeStyle = 'rgba(177,92,255,0.12)'
      ctx.setLineDash([3, 6])
      ctx.beginPath()
      ctx.arc(cx, cy, s.spawnRadius * scale, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // HUD 节流更新
      const roundedRate = s.rate
      setHud((prev) =>
        prev.count === s.count && prev.rate === roundedRate && prev.radius === Math.round(s.maxRadius) && prev.finished === s.finished
          ? prev
          : { count: s.count, rate: roundedRate, radius: Math.round(s.maxRadius), finished: s.finished },
      )

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, placeSymmetric])

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      controls.registerInteraction()
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const mobile = w < 720
      const size = mobile ? Math.min(w * 0.94, h * 0.62) : Math.min(w * 0.66, h * 0.78)
      const cxp = w / 2
      const cyp = mobile ? h * 0.55 : h * 0.52
      const left = cxp - size / 2
      const top = cyp - size / 2
      const gx = ((e.clientX - rect.left - left) / size) * GRID
      const gy = ((e.clientY - rect.top - top) / size) * GRID
      addSeed(gx, gy)
    },
    [controls, addSeed],
  )

  const handleReset = useCallback(() => {
    controls.registerInteraction()
    resetSim()
  }, [controls, resetSim])

  const guideSteps: Array<GuideStep> = [
    {
      title: tx('看晶体自己生长'),
      body: tx('随机游走的粒子一碰到晶体就粘住，渐渐长出树枝状的分形。现在它正以 6 重对称生长，像一片雪花。'),
    },
    {
      target: '.dendrite-controls',
      title: tx('调节粘附概率'),
      body: tx('粘附概率越低，粒子越容易掠过尖端、只在最外层粘住——晶体变得更细更枝杈；调高则更致密。拨拨看。'),
      awaitInteraction: true,
    },
    {
      target: '.dendrite-sym',
      title: tx('试试 6 重对称'),
      body: tx('切换到 6 重对称，每一次粘附都会被复制成六瓣镜像——这正是雪花六角形的来源。让晶体长到 5000 粒子完成挑战。'),
    },
  ]

  return (
    <div className="oss-experience dendrite-experience">
      <canvas ref={canvasRef} className="dendrite-canvas" onPointerDown={onCanvasPointerDown} />

      <header className="dendrite-question">
        <h1>{tx('雪花为什么长成树枝状？')}</h1>
        <p>{tx('随机游走的粒子一碰到晶体就粘住（扩散限制聚集）。改变粘附概率与对称性，看分形枝晶实时生长。')}</p>
        <button type="button" className="dendrite-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}
        </button>
      </header>

      <aside className="dendrite-readout">
        <div className="dendrite-readout-row">
          <small>{tx('粒子数')}</small>
          <strong className="is-cyan">{tx(String(hud.count))}</strong>
        </div>
        <div className="dendrite-readout-row">
          <small>{tx('生长速率')}</small>
          <strong className="is-cyan">{tx(`${hud.rate}/s`)}</strong>
        </div>
        <div className="dendrite-readout-row">
          <small>{tx('晶体半径')}</small>
          <strong className="is-cyan">{tx(String(hud.radius))}</strong>
        </div>
        {hud.finished && (
          <div className="dendrite-success">
            <Trophy weight="fill" /> {tx('挑战达成：6 重对称晶体超过 5000 粒子')}
          </div>
        )}
      </aside>

      <footer className="dendrite-controls">
        <div className="dendrite-panel">
          <button
            type="button"
            className="dendrite-icon-btn"
            aria-label={running ? tx('暂停') : tx('播放')}
            onClick={() => {
              controls.registerInteraction()
              setRunning((r) => !r)
            }}
          >
            {running ? <Pause weight="bold" /> : <Play weight="bold" />}
          </button>
          <button type="button" className="dendrite-icon-btn" aria-label={tx('重置')} onClick={handleReset}>
            <ArrowCounterClockwise weight="bold" />
          </button>
        </div>

        <div className="dendrite-panel dendrite-slider">
          <label htmlFor="dendrite-temp">
            {tx('温度')} <span className="dendrite-val">{tx(temperature.toFixed(2))}</span>
          </label>
          <input
            id="dendrite-temp"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={temperature}
            onChange={(e) => {
              controls.registerInteraction()
              setTemperature(Number(e.target.value))
            }}
          />
        </div>

        <div className="dendrite-panel dendrite-slider">
          <label htmlFor="dendrite-stick">
            {tx('粘附概率')} <span className="dendrite-val">{tx(stickProb.toFixed(2))}</span>
          </label>
          <input
            id="dendrite-stick"
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={stickProb}
            onChange={(e) => {
              controls.registerInteraction()
              setStickProb(Number(e.target.value))
            }}
          />
        </div>

        <div className="dendrite-panel dendrite-sym">
          <span className="dendrite-sym-label">{tx('对称性')}</span>
          {([1, 4, 6] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={`dendrite-sym-btn${symmetry === n ? ' is-active' : ''}`}
              onClick={() => {
                controls.registerInteraction()
                setSymmetry(n)
              }}
            >
              {tx(`${n} 重`)}
            </button>
          ))}
        </div>
      </footer>

      {whyOpen && (
        <div className="dendrite-why" role="dialog" aria-label={tx('枝晶生长原理解释')}>
          <div className="dendrite-why-card">
            <button type="button" className="dendrite-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('为什么会长成树枝状？')}</h2>
            <p>
              {tx('这个模型叫')}<strong>{tx('扩散限制聚集（DLA）')}</strong>
              {tx('：粒子在周围做随机游走，一旦碰到晶体就永久粘住。最早由 Witten 和 Sander 在 1981 年提出，用来描述烟尘、胶体与电沉积中那些蓬松的树枝状结构。')}
            </p>
            <p>
              {tx('粘附概率越低，枝杈越细越长。这是因为')}<span className="is-purple">{tx('屏蔽效应')}</span>
              {tx('：突出的尖端更容易拦截到游走的粒子，凹陷处反而被「屏蔽」而长不快，于是凸起越来越凸——形成正反馈，长出分形的枝。二维 DLA 团簇的分形维数约为')}
              <strong> 1.7</strong>{tx('，介于线与面之间。')}
            </p>
            <p>
              {tx('真实的枝晶随处可见：')}<span className="is-cyan">{tx('雪花')}</span>
              {tx('在 6 重对称的水分子晶格上生长；金属凝固、电池电极上的锂枝晶、甚至闪电与河流三角洲，都遵循相似的扩散-聚集竞争。本演示把每次粘附复制成 6 瓣镜像，正是在模拟雪花为何六角对称。')}
            </p>
            <small>{tx('延伸阅读：Wikipedia 扩散限制聚集（DLA）· 分形维数 · 枝晶凝固 · 雪花晶体学')}</small>
          </div>
        </div>
      )}

      <div className="oss-engine-credit dendrite-credit">{tx('Canvas 2D · 扩散限制聚集（DLA）· 本地构建')}</div>

      <GuideTour worldId="dendritic-crystal" steps={guideSteps} />
      <GhostHint
        worldId="dendritic-crystal"
        gesture={{ type: 'tap', target: '.dendrite-canvas', label: tx('点击画布添加新的晶种') }}
      />
    </div>
  )
}
