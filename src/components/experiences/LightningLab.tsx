import './styles/LightningLab.css'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { Lightning, Question, X, Trophy } from '@phosphor-icons/react'

import type { ExperienceControls } from '~/components/ExperienceShell'
import { GuideTour, type GuideStep } from '~/components/experiences/GuideTour'
import { GhostHint } from '~/components/experiences/GhostHint'
import { useExperienceI18n } from '~/i18n/experience'

const YELLOW = '#ffd166'
const CYAN = '#4dd0e1'
const PURPLE = '#b15cff'

type Point = { x: number; y: number }
type Segment = { a: Point; b: Point; depth: number; width: number; alpha: number }
type Bolt = { segments: Segment[]; born: number; maxDepth: number }

function midpointDisplace(
  a: Point, b: Point, roughness: number, depth: number, maxDepth: number,
  branchProb: number, segments: Segment[], width: number, alpha: number,
): number {
  if (depth >= maxDepth) {
    segments.push({ a, b, depth, width, alpha })
    return depth
  }
  const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const offset = (Math.random() - 0.5) * len * roughness
  const nx = -dy / len
  const ny = dx / len
  mid.x += nx * offset
  mid.y += ny * offset

  let maxD = depth
  const d1 = midpointDisplace(a, mid, roughness * 0.72, depth + 1, maxDepth, branchProb, segments, width, alpha)
  const d2 = midpointDisplace(mid, b, roughness * 0.72, depth + 1, maxDepth, branchProb, segments, width, alpha)
  maxD = Math.max(d1, d2)

  if (depth >= 2 && Math.random() < branchProb && len > 30) {
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2
    const bLen = len * (0.35 + Math.random() * 0.3)
    const end: Point = { x: mid.x + Math.cos(angle) * bLen, y: mid.y + Math.sin(angle) * bLen }
    const bd = midpointDisplace(mid, end, roughness * 0.8, depth + 1, maxDepth, branchProb * 0.6, segments, width * 0.55, alpha * 0.6)
    maxD = Math.max(maxD, bd)
  }
  return maxD
}

function generateBolt(start: Point, end: Point, voltage: number, humidity: number, branchProb: number): Bolt {
  const segments: Segment[] = []
  const roughness = 0.38 + humidity * 0.22
  const maxDepth = 7 + Math.round(humidity * 4)
  const bp = branchProb * (0.6 + humidity * 0.5)
  const width = 1.5 + voltage * 2.5
  const maxD = midpointDisplace(start, end, roughness, 0, maxDepth, bp, segments, width, 1)
  return { segments, born: performance.now(), maxDepth: maxD }
}

const FADE_MS = 550
const FLASH_MS = 80

export function LightningLab({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boltsRef = useRef<Bolt[]>([])
  const flashRef = useRef(0)
  const targetRef = useRef<Point | null>(null)
  const nextStrikeRef = useRef(0)
  const paramsRef = useRef({ voltage: 0.6, humidity: 0.5, branchProb: 0.35 })
  const [voltage, setVoltage] = useState(60)
  const [humidity, setHumidity] = useState(50)
  const [branchProb, setBranchProb] = useState(35)
  const [whyOpen, setWhyOpen] = useState(false)
  const [finished, setFinished] = useState(false)
  const [maxBranch, setMaxBranch] = useState(0)
  const finishedRef = useRef(false)
  const interactedRef = useRef(false)
  const maxBranchRef = useRef(0)

  useEffect(() => { controls.completeOnboarding() }, [controls])

  const registerOnce = useCallback(() => {
    if (!interactedRef.current) { interactedRef.current = true; controls.registerInteraction() }
  }, [controls])

  const strike = useCallback((tx2?: number, ty2?: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const { voltage: v, humidity: hu, branchProb: bp } = paramsRef.current
    const startX = (tx2 ?? w * (0.3 + Math.random() * 0.4)) + (Math.random() - 0.5) * 60
    const startY = h * 0.06 + Math.random() * h * 0.06
    const endX = tx2 ?? startX + (Math.random() - 0.5) * 80
    const endY = ty2 ?? h * (0.82 + Math.random() * 0.1)
    const bolt = generateBolt({ x: startX, y: startY }, { x: endX, y: endY }, v, hu, bp)
    boltsRef.current.push(bolt)
    flashRef.current = performance.now()
    if (bolt.maxDepth > maxBranchRef.current) {
      maxBranchRef.current = bolt.maxDepth
      setMaxBranch(bolt.maxDepth)
    }
    if (!finishedRef.current && bolt.maxDepth > 8) {
      finishedRef.current = true
      setFinished(true)
      controls.finish()
    }
  }, [controls])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    nextStrikeRef.current = performance.now() + 300

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w === 0 || h === 0) return
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background: dark stormy sky
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      bgGrad.addColorStop(0, '#0a0c14')
      bgGrad.addColorStop(0.35, '#0d1020')
      bgGrad.addColorStop(0.75, '#080a12')
      bgGrad.addColorStop(1, '#050608')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)

      // Cloud layer
      const cloudGrad = ctx.createLinearGradient(0, 0, 0, h * 0.18)
      cloudGrad.addColorStop(0, 'rgba(40,44,66,0.7)')
      cloudGrad.addColorStop(0.6, 'rgba(28,32,52,0.4)')
      cloudGrad.addColorStop(1, 'rgba(20,22,38,0)')
      ctx.fillStyle = cloudGrad
      ctx.fillRect(0, 0, w, h * 0.18)

      // Ground silhouette
      ctx.fillStyle = '#0a0b0e'
      ctx.beginPath()
      ctx.moveTo(0, h)
      ctx.lineTo(0, h * 0.9)
      for (let x = 0; x <= w; x += w / 12) {
        ctx.lineTo(x, h * 0.9 - Math.sin(x * 0.008) * 8 - Math.random() * 2)
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fill()

      // Rain particles (subtle)
      ctx.strokeStyle = 'rgba(140,160,200,0.08)'
      ctx.lineWidth = 1
      for (let i = 0; i < 40; i++) {
        const rx = ((now * 0.06 + i * 137.5) % w)
        const ry = ((now * 0.35 + i * 89.3) % (h * 0.85))
        ctx.beginPath()
        ctx.moveTo(rx, ry)
        ctx.lineTo(rx - 1, ry + 12)
        ctx.stroke()
      }

      // Screen flash
      const flashAge = now - flashRef.current
      if (flashAge < FLASH_MS) {
        const fi = 1 - flashAge / FLASH_MS
        ctx.fillStyle = `rgba(220,225,255,${(fi * 0.35).toFixed(3)})`
        ctx.fillRect(0, 0, w, h)
      }

      // Render bolts
      const alive: Bolt[] = []
      for (const bolt of boltsRef.current) {
        const age = now - bolt.born
        if (age > FADE_MS) continue
        alive.push(bolt)
        const fade = age < 30 ? 1 : 1 - (age - 30) / (FADE_MS - 30)
        ctx.globalCompositeOperation = 'lighter'
        // Glow passes (purple-blue, wide → narrow)
        const glowPasses = [
          { wMul: 9, alpha: 0.05, color: PURPLE },
          { wMul: 5, alpha: 0.1, color: 'rgba(100,140,255,1)' },
          { wMul: 3, alpha: 0.22, color: 'rgba(140,170,255,1)' },
          { wMul: 1.8, alpha: 0.4, color: 'rgba(200,210,255,1)' },
        ]
        for (const pass of glowPasses) {
          ctx.lineWidth = pass.wMul
          ctx.strokeStyle = pass.color
          ctx.globalAlpha = pass.alpha * fade
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          for (const seg of bolt.segments) {
            ctx.moveTo(seg.a.x, seg.a.y)
            ctx.lineTo(seg.b.x, seg.b.y)
          }
          ctx.stroke()
        }
        // Core: white-hot
        for (const seg of bolt.segments) {
          ctx.globalAlpha = seg.alpha * fade
          ctx.lineWidth = seg.width
          ctx.strokeStyle = '#ffffff'
          ctx.beginPath()
          ctx.moveTo(seg.a.x, seg.a.y)
          ctx.lineTo(seg.b.x, seg.b.y)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }
      boltsRef.current = alive

      // Auto-strike
      if (now > nextStrikeRef.current) {
        strike()
        nextStrikeRef.current = now + 900 + Math.random() * 700
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [strike])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    registerOnce()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    targetRef.current = { x, y }
    strike(x, y)
  }

  const applyVoltage = (v: number) => { registerOnce(); paramsRef.current.voltage = v / 100; setVoltage(v) }
  const applyHumidity = (v: number) => { registerOnce(); paramsRef.current.humidity = v / 100; setHumidity(v) }
  const applyBranch = (v: number) => { registerOnce(); paramsRef.current.branchProb = v / 100; setBranchProb(v) }

  const guideSteps: Array<GuideStep> = [
    {
      target: '.lightning-stage',
      title: '点击引导闪电',
      body: '点击画面任意位置，闪电会从云层劈向你指定的落点。',
      awaitInteraction: true,
    },
    {
      target: '.lightning-controls',
      title: '调节电压与湿度',
      body: '电压控制闪电的亮度和粗细；湿度影响分叉密度——潮湿空气更容易产生多路放电。',
    },
    {
      target: '.lightning-challenge',
      title: '挑战：8 级分叉',
      body: '把湿度和分叉概率拉高，生成一道拥有超过 8 级分叉的闪电！',
    },
  ]

  return (
    <div className="oss-experience lightning-experience">
      {/* 场景层 */}
      <div className="lightning-stage">
        <canvas ref={canvasRef} className="lightning-canvas" onClick={handleCanvasClick} aria-label={tx('闪电画布：点击设置落雷点')} />
      </div>

      {/* 问题层 */}
      <header className="lightning-question">
        <h1>{tx('闪电为什么是锯齿形的？')}</h1>
        <p>{tx('每一道闪电都是一棵分形树——中点位移、随机分叉，自相似地劈向大地。')}</p>
        <button type="button" className="lightning-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}
        </button>
      </header>

      {/* 读数层 */}
      <aside className="lightning-readout" aria-label={tx('闪电读数')}>
        <div className="lightning-readout-row">
          <small>{tx('最大分叉级数')}</small>
          <strong className="is-cyan">{maxBranch}</strong>
        </div>
        <div className="lightning-readout-row">
          <small>{tx('等效电压')}</small>
          <strong className="is-cyan">{tx(`${(voltage * 3 + 100).toFixed(0)} MV`)}</strong>
        </div>
        <div className="lightning-readout-row">
          <small>{tx('分形维数')}</small>
          <strong className="is-purple">~1.5</strong>
        </div>
      </aside>

      {/* 挑战提示 */}
      {!finished && (
        <aside className="lightning-challenge">
          <Trophy weight="fill" />
          <span>{tx('挑战：生成一道拥有超过 8 级分叉的闪电。拉高湿度和分叉概率试试！')}</span>
        </aside>
      )}

      {/* 控制层 */}
      <footer className="lightning-controls">
        <div className="lightning-slider">
          <label>{tx('电压')}<strong className="is-yellow">{voltage}%</strong></label>
          <input type="range" min={10} max={100} value={voltage}
            style={{ '--fill': `${voltage}%` } as CSSProperties}
            onChange={(e) => applyVoltage(Number(e.target.value))}
            aria-label={tx('电压（影响亮度和粗细）')} />
        </div>
        <div className="lightning-slider">
          <label>{tx('湿度')}<strong className="is-yellow">{humidity}%</strong></label>
          <input type="range" min={0} max={100} value={humidity}
            style={{ '--fill': `${humidity}%` } as CSSProperties}
            onChange={(e) => applyHumidity(Number(e.target.value))}
            aria-label={tx('湿度（影响分叉密度）')} />
        </div>
        <div className="lightning-slider">
          <label>{tx('分叉概率')}<strong className="is-yellow">{branchProb}%</strong></label>
          <input type="range" min={5} max={80} value={branchProb}
            style={{ '--fill': `${((branchProb - 5) / 75) * 100}%` } as CSSProperties}
            onChange={(e) => applyBranch(Number(e.target.value))}
            aria-label={tx('分叉概率')} />
        </div>
        <button type="button" className="lightning-icon-btn" onClick={() => { registerOnce(); strike() }} aria-label={tx('手动触发闪电')}>
          <Lightning weight="fill" />
        </button>
      </footer>

      {/* 解释层 */}
      {whyOpen && (
        <div className="lightning-why" role="dialog" aria-label={tx('闪电分形原理解释')}>
          <div className="lightning-why-card">
            <button type="button" className="lightning-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('为什么闪电是锯齿分叉的？')}</h2>
            <p>
              {tx('闪电本质是空气的介电击穿：当云层与地面之间的电场超过约 3 MV/m，空气分子被电离，形成导电等离子体通道。先导（stepped leader）以约 50 m 的阶梯向下推进，每一步都选择电场最强的方向——这种「随机行走 + 电场偏置」产生了锯齿路径。')}
            </p>
            <p>
              {tx('分叉来自电荷竞争：主通道两侧的电场被屏蔽，但尖端处场强集中，当局部场强超过阈值就会萌生新分支。湿度越高，空气中水分子越多，极化效应使电场分布更不均匀，分叉概率随之增大。这就是为什么热带雷暴的闪电比干燥地区更「枝繁叶茂」。')}
            </p>
            <p>
              {tx('数学上，闪电路径的分形维数约为 1.5——介于线（1）和面（2）之间。本实验用中点位移算法模拟这一过程：每次取线段中点，垂直偏移一个随机量，再递归细分；每个节点以一定概率萌生子分支。你调的三个参数——电压、湿度、分叉概率——分别控制通道能量、介质不均匀性和分支萌发率。')}
            </p>
            <small>
              {tx('模型简化：真实先导步进约 50 m/步、速度 ~2×10⁵ m/s；回击电流峰值 ~30 kA、温度 ~30 000 K。分形维数 D≈1.5 来自 Takayasu (1985) 对放电路径的统计测量。本模拟为教学可视化，非物理精确求解。')}
            </small>
          </div>
        </div>
      )}

      <div className="oss-engine-credit lightning-credit">{tx('Canvas 2D · 中点位移分形 · 介电击穿模型')}</div>

      <GuideTour worldId="lightning-lab" steps={guideSteps} />
      <GhostHint
        worldId="lightning-lab"
        gesture={{ type: 'tap', target: '.lightning-canvas', label: tx('点击设置落雷点') }}
      />
    </div>
  )
}
