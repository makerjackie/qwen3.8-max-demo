import './styles/Sandpile.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowCounterClockwise, Play, Pause, Question, X, Trophy } from '@phosphor-icons/react'

import type { ExperienceControls } from '~/components/ExperienceShell'
import { GuideTour, type GuideStep } from '~/components/experiences/GuideTour'
import { GhostHint } from '~/components/experiences/GhostHint'
import { useExperienceI18n } from '~/i18n/experience'

/* ─── Constants ─────────────────────────────────────────────── */
const GRID = 101
const CENTER = Math.floor(GRID / 2)
const TOTAL = GRID * GRID

/* Color palette per grain count */
const COLORS: Array<[number, number, number]> = [
  [26, 26, 46],    // 0 grains: dark
  [77, 208, 225],  // 1 grain: cyan
  [255, 209, 102], // 2 grains: yellow
  [177, 92, 255],  // 3 grains: purple
]
const TOPPLE_COLOR: [number, number, number] = [255, 107, 107] // red flash

type DropMode = 'center' | 'random' | 'click'

/* ─── Component ─────────────────────────────────────────────── */
export function Sandpile({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(true)
  const [dropRate, setDropRate] = useState(120)
  const [dropMode, setDropMode] = useState<DropMode>('center')
  const [resolveSpeed, setResolveSpeed] = useState(5000)
  const [totalDropped, setTotalDropped] = useState(0)
  const [currentAvalanche, setCurrentAvalanche] = useState(0)
  const [maxAvalanche, setMaxAvalanche] = useState(0)
  const [whyOpen, setWhyOpen] = useState(false)
  const [challengeDone, setChallengeDone] = useState(false)
  const finishedRef = useRef(false)
  const interactedRef = useRef(false)

  /* Mutable simulation state */
  const sim = useRef({
    grid: new Int32Array(TOTAL),
    flash: new Float32Array(TOTAL), // toppling flash intensity
    inQueue: new Uint8Array(TOTAL), // whether cell is already in unstable queue
    playing: true,
    dropRate: 120,
    dropMode: 'center' as DropMode,
    resolveSpeed: 5000,
    dropAccumulator: 0,
    lastTime: 0,
    totalDropped: 0,
    currentAvalanche: 0,
    maxAvalanche: 0,
    unstable: [] as number[], // indices of cells >= 4
    imageData: null as ImageData | null,
  })

  /* Keep refs in sync with state */
  useEffect(() => { sim.current.playing = playing }, [playing])
  useEffect(() => { sim.current.dropRate = dropRate }, [dropRate])
  useEffect(() => { sim.current.dropMode = dropMode }, [dropMode])
  useEffect(() => { sim.current.resolveSpeed = resolveSpeed }, [resolveSpeed])

  const registerFirstInteraction = useCallback(() => {
    if (!interactedRef.current) {
      interactedRef.current = true
      controls.registerInteraction()
    }
  }, [controls])

  /* Drop a grain at position */
  const dropGrain = useCallback((idx: number) => {
    const s = sim.current
    s.grid[idx] += 1
    s.totalDropped += 1
    s.currentAvalanche = 0
    if (s.grid[idx] >= 4 && !s.inQueue[idx]) {
      s.inQueue[idx] = 1
      s.unstable.push(idx)
    }
  }, [])

  /* Resolve topplings — returns number of topplings performed */
  const resolveTopplings = useCallback((budget: number): number => {
    const s = sim.current
    let count = 0
    while (s.unstable.length > 0 && count < budget) {
      const idx = s.unstable.pop()!
      s.inQueue[idx] = 0
      if (s.grid[idx] < 4) continue
      s.grid[idx] -= 4
      s.flash[idx] = 1.0
      s.currentAvalanche += 1
      count++
      const row = Math.floor(idx / GRID)
      const col = idx % GRID
      /* Distribute to 4 neighbors (open boundary — edges lose grains) */
      if (row > 0) {
        const n = idx - GRID
        s.grid[n] += 1
        if (s.grid[n] >= 4 && !s.inQueue[n]) { s.inQueue[n] = 1; s.unstable.push(n) }
      }
      if (row < GRID - 1) {
        const n = idx + GRID
        s.grid[n] += 1
        if (s.grid[n] >= 4 && !s.inQueue[n]) { s.inQueue[n] = 1; s.unstable.push(n) }
      }
      if (col > 0) {
        const n = idx - 1
        s.grid[n] += 1
        if (s.grid[n] >= 4 && !s.inQueue[n]) { s.inQueue[n] = 1; s.unstable.push(n) }
      }
      if (col < GRID - 1) {
        const n = idx + 1
        s.grid[n] += 1
        if (s.grid[n] >= 4 && !s.inQueue[n]) { s.inQueue[n] = 1; s.unstable.push(n) }
      }
    }
    return count
  }, [])

  /* Reset simulation */
  const resetSim = useCallback(() => {
    const s = sim.current
    s.grid.fill(0)
    s.flash.fill(0)
    s.inQueue.fill(0)
    s.unstable = []
    s.totalDropped = 0
    s.currentAvalanche = 0
    s.maxAvalanche = 0
    s.dropAccumulator = 0
    setTotalDropped(0)
    setCurrentAvalanche(0)
    setMaxAvalanche(0)
  }, [])

  /* ─── Mount: complete onboarding ─────────────────────────── */
  useEffect(() => {
    controls.completeOnboarding()
  }, [controls])

  /* ─── Main render loop ───────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // Pre-seed: drop initial grains so pattern is visible immediately
    const s = sim.current
    for (let i = 0; i < 300; i++) {
      const idx = CENTER * GRID + CENTER
      s.grid[idx] += 1
      s.totalDropped += 1
      if (s.grid[idx] >= 4 && !s.inQueue[idx]) {
        s.inQueue[idx] = 1
        s.unstable.push(idx)
      }
    }
    // Resolve all initial topplings
    resolveTopplings(50000)
    setTotalDropped(s.totalDropped)

    let raf = 0

    const frame = (now: number) => {
      const s = sim.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        s.imageData = null
      }

      const dt = s.lastTime ? Math.min((now - s.lastTime) / 1000, 0.1) : 0
      s.lastTime = now

      if (s.playing) {
        /* Drop grains at configured rate */
        s.dropAccumulator += dt * s.dropRate
        const drops = Math.floor(s.dropAccumulator)
        if (drops > 0) {
          s.dropAccumulator -= drops
          for (let i = 0; i < drops; i++) {
            let idx: number
            if (s.dropMode === 'center') {
              idx = CENTER * GRID + CENTER
            } else if (s.dropMode === 'random') {
              idx = Math.floor(Math.random() * TOTAL)
            } else {
              idx = CENTER * GRID + CENTER // click mode: auto-drops still go center
            }
            s.grid[idx] += 1
            s.totalDropped += 1
            if (s.grid[idx] >= 4 && !s.inQueue[idx]) {
              s.inQueue[idx] = 1
              s.unstable.push(idx)
            }
          }
        }

        /* Resolve topplings */
        if (s.unstable.length > 0) {
          resolveTopplings(s.resolveSpeed)
        }

        /* Track avalanche max */
        if (s.currentAvalanche > s.maxAvalanche) {
          s.maxAvalanche = s.currentAvalanche
        }
        /* Check challenge */
        if (s.currentAvalanche > 500 && !finishedRef.current) {
          finishedRef.current = true
          setChallengeDone(true)
          controls.finish()
        }
      }

      /* Decay flash */
      for (let i = 0; i < TOTAL; i++) {
        if (s.flash[i] > 0) s.flash[i] = Math.max(0, s.flash[i] - dt * 4)
      }

      /* ─── Render via ImageData ─── */
      const size = Math.min(w, h) - 40
      const cellSize = Math.max(1, Math.floor(size / GRID))
      const renderSize = cellSize * GRID
      const offsetX = Math.floor((w - renderSize) / 2)
      const offsetY = Math.floor((h - renderSize) / 2)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#0a0a14'
      ctx.fillRect(0, 0, w, h)

      /* Create or reuse offscreen canvas for pixel rendering */
      let offscreen = (frame as any)._off as HTMLCanvasElement | undefined
      if (!offscreen) {
        offscreen = document.createElement('canvas')
        offscreen.width = GRID
        offscreen.height = GRID
        ;(frame as any)._off = offscreen
      }
      const offCtx = offscreen.getContext('2d')!
      let imgData = s.imageData
      if (!imgData) {
        imgData = offCtx.createImageData(GRID, GRID)
        s.imageData = imgData
      }
      const pixels = imgData.data

      for (let i = 0; i < TOTAL; i++) {
        const p = i * 4
        const grains = s.grid[i]
        const flash = s.flash[i]
        let r: number, g: number, b: number
        if (flash > 0.01) {
          /* Blend toward red/white flash */
          const base = grains >= 0 && grains <= 3 ? COLORS[grains] : COLORS[3]
          r = Math.round(base[0] + (255 - base[0]) * flash)
          g = Math.round(base[1] + (255 - base[1]) * flash * 0.6)
          b = Math.round(base[2] + (255 - base[2]) * flash * 0.6)
        } else if (grains >= 0 && grains <= 3) {
          const c = COLORS[grains]
          r = c[0]; g = c[1]; b = c[2]
        } else {
          r = TOPPLE_COLOR[0]; g = TOPPLE_COLOR[1]; b = TOPPLE_COLOR[2]
        }
        pixels[p] = r
        pixels[p + 1] = g
        pixels[p + 2] = b
        pixels[p + 3] = 255
      }

      offCtx.putImageData(imgData, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(offscreen, offsetX, offsetY, renderSize, renderSize)

      /* Subtle border glow */
      ctx.strokeStyle = 'rgba(77, 208, 225, 0.25)'
      ctx.lineWidth = 1.5
      ctx.shadowColor = 'rgba(77, 208, 225, 0.4)'
      ctx.shadowBlur = 8
      ctx.strokeRect(offsetX - 1, offsetY - 1, renderSize + 2, renderSize + 2)
      ctx.shadowBlur = 0

      /* Store layout for click mapping */
      ;(frame as any)._layout = { offsetX, offsetY, cellSize, renderSize }

      /* Update HUD periodically */
      if (Math.floor(now / 250) !== Math.floor((now - 16) / 250)) {
        setTotalDropped(s.totalDropped)
        setCurrentAvalanche(s.currentAvalanche)
        setMaxAvalanche(s.maxAvalanche)
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ─── Click to drop grain ────────────────────────────────── */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    registerFirstInteraction()
    const s = sim.current
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    /* Compute layout (mirrors render loop) */
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const size = Math.min(w, h) - 40
    const cellSize = Math.max(1, Math.floor(size / GRID))
    const renderSize = cellSize * GRID
    const offsetX = Math.floor((w - renderSize) / 2)
    const offsetY = Math.floor((h - renderSize) / 2)

    const col = Math.floor((px - offsetX) / cellSize)
    const row = Math.floor((py - offsetY) / cellSize)
    if (col < 0 || col >= GRID || row < 0 || row >= GRID) return

    const idx = row * GRID + col
    s.currentAvalanche = 0
    dropGrain(idx)
  }, [registerFirstInteraction, dropGrain])

  /* ─── Guide steps ────────────────────────────────────────── */
  const guideSteps: Array<GuideStep> = [
    {
      title: tx('点击落沙'),
      body: tx('点击网格任意位置，放入一粒沙。沙粒会累积在格子上，每种颜色代表不同的沙粒数量。'),
      target: '.sandpile-canvas',
      awaitInteraction: true,
    },
    {
      title: tx('观察崩塌级联'),
      body: tx('当某个格子积累到 4 粒沙时，它会「崩塌」——向四个邻居各送出 1 粒沙。这可能引发连锁反应，形成壮观的雪崩波。'),
    },
    {
      title: tx('挑战：触发大雪崩'),
      body: tx('试着触发一次波及超过 500 个格子的雪崩！提示：让沙堆自然生长到临界态，然后在关键位置落下一粒沙。'),
    },
  ]

  return (
    <div className="oss-experience sandpile-experience">
      <canvas
        ref={canvasRef}
        className="sandpile-canvas"
        onClick={handleCanvasClick}
      />

      {/* Header */}
      <header className="sandpile-header">
        <h1>{tx('一粒沙，如何引发一场雪崩？')}</h1>
        <p>{tx('阿贝尔沙堆模型：简单规则自发演化到临界态，产生任意规模的雪崩。')}</p>
        <button type="button" className="sandpile-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}
        </button>
      </header>

      {/* Stats HUD */}
      <aside className="sandpile-stats">
        <div className="sandpile-stat-row">
          <small>{tx('累计落沙')}</small>
          <strong className="sandpile-stat-cyan">{totalDropped.toLocaleString()}</strong>
        </div>
        <div className="sandpile-stat-row">
          <small>{tx('当前雪崩')}</small>
          <strong className="sandpile-stat-cyan">{currentAvalanche.toLocaleString()}</strong>
        </div>
        <div className="sandpile-stat-row">
          <small>{tx('最大雪崩')}</small>
          <strong className="sandpile-stat-purple">{maxAvalanche.toLocaleString()}</strong>
        </div>
        {challengeDone && (
          <div className="sandpile-success">
            <Trophy weight="fill" /> {tx('挑战完成：雪崩波及超过 500 格！')}
          </div>
        )}
        {!challengeDone && (
          <div className="sandpile-challenge-hint">
            {tx(`挑战：触发 500+ 格雪崩（当前最大 ${maxAvalanche}）`)}
          </div>
        )}
      </aside>

      {/* Control bar */}
      <footer className="sandpile-controls">
        {/* Play / Pause */}
        <button
          type="button"
          className={`sandpile-play-btn ${playing ? 'is-playing' : ''}`}
          onClick={() => { registerFirstInteraction(); setPlaying(!playing) }}
          aria-label={playing ? tx('暂停') : tx('播放')}
        >
          {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
        </button>

        {/* Drop rate */}
        <div className="sandpile-slider">
          <label>
            {tx('落沙速度')}
            <strong className="sandpile-val">{dropRate} {tx('粒/秒')}</strong>
          </label>
          <input
            type="range"
            min={1}
            max={200}
            step={1}
            value={dropRate}
            onChange={(e) => { registerFirstInteraction(); setDropRate(Number(e.target.value)) }}
            aria-label={tx('落沙速度')}
          />
        </div>

        {/* Drop mode */}
        <div className="sandpile-mode" role="group" aria-label={tx('落点模式')}>
          {(['center', 'random', 'click'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`sandpile-mode-btn ${dropMode === mode ? 'is-active' : ''}`}
              onClick={() => { registerFirstInteraction(); setDropMode(mode) }}
            >
              {mode === 'center' ? tx('中心') : mode === 'random' ? tx('随机') : tx('点击')}
            </button>
          ))}
        </div>

        {/* Resolve speed */}
        <div className="sandpile-slider">
          <label>
            {tx('解析速度')}
            <strong className="sandpile-val">{resolveSpeed}</strong>
          </label>
          <input
            type="range"
            min={10}
            max={10000}
            step={10}
            value={resolveSpeed}
            onChange={(e) => { registerFirstInteraction(); setResolveSpeed(Number(e.target.value)) }}
            aria-label={tx('每帧解析崩塌数')}
          />
        </div>

        {/* Reset */}
        <button
          type="button"
          className="sandpile-action-btn"
          onClick={() => { registerFirstInteraction(); resetSim() }}
          aria-label={tx('重置')}
        >
          <ArrowCounterClockwise weight="bold" />
          <span>{tx('重置')}</span>
        </button>
      </footer>

      {/* Why panel */}
      {whyOpen && (
        <div className="sandpile-why" role="dialog" aria-label={tx('沙堆模型原理解释')}>
          <div className="sandpile-why-card">
            <button type="button" className="sandpile-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('自组织临界性：为什么沙堆永远在「崩溃边缘」？')}</h2>
            <p>
              {tx('1987 年，物理学家 Bak、Tang 和 Wiesenfeld 提出了这个极简模型：不断往网格上落沙，满 4 粒就崩塌。系统无需任何外部调节，会')}
              <strong>{tx('自发演化到一个临界态')}</strong>
              {tx('——在这个状态下，一粒沙可能什么都不发生，也可能引发横跨整个网格的大雪崩。')}
            </p>
            <p>
              {tx('雪崩规模服从')}<span className="sandpile-is-purple">{tx('幂律分布')}</span>
              {tx('：小雪崩极其频繁，大雪崩罕见但确实会发生，没有「典型规模」。这与地震（Gutenberg-Richter 定律）、森林火灾、股市崩盘的统计规律惊人一致——')}
              <strong>{tx('复杂系统的临界行为具有普适性。')}</strong>
            </p>
            <p>
              <span className="sandpile-is-cyan">{tx('阿贝尔性质：')}</span>
              {tx('无论以什么顺序处理崩塌，最终稳定态完全相同。这意味着沙堆的终态只取决于落沙总量，与过程无关——这是「阿贝尔群」结构在物理中的优美体现。')}
            </p>
            <p>
              <span className="sandpile-is-red">{tx('边界条件：')}</span>
              {tx('本页使用开放边界（边缘格子的沙粒会掉出网格）。你看到的四色分形图案是沙堆在临界态下的稳态结构——它是计算数学中最美丽的对象之一。')}
            </p>
            <small>{tx('延伸阅读：Bak, Tang & Wiesenfeld (1987) · Dhar, The Abelian Sandpile Model · Jensen, Self-Organized Criticality')}</small>
          </div>
        </div>
      )}

      <div className="oss-engine-credit sandpile-credit">{tx('Canvas 2D · ImageData 像素渲染 · 开放边界 · 本地构建')}</div>

      <GuideTour worldId="sandpile" steps={guideSteps} />
      <GhostHint worldId="sandpile" gesture={{ type: 'tap', target: '.sandpile-canvas', label: tx('点击网格落下一粒沙') }} />
    </div>
  )
}
