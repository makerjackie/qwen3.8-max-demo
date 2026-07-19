import './styles/MolecularVibration.css'

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

/* ---------- Molecule definitions with pre-computed eigenvectors ---------- */

type Atom = { el: 'O' | 'C' | 'H'; x: number; y: number; r: number }
type Mode = { name: string; nameEn: string; freq: number; vecs: Array<[number, number]> }
type Molecule = { id: string; label: string; atoms: Atom[]; bonds: Array<[number, number]>; modes: Mode[] }

const EL_COLOR: Record<string, string> = { O: '#ff4444', C: '#8899aa', H: '#f0f0f0' }
const EL_GLOW: Record<string, string> = { O: '#ff6666', C: '#aabbcc', H: '#ffffff' }

const MOLECULES: Molecule[] = [
  {
    id: 'h2o', label: 'H₂O',
    atoms: [
      { el: 'O', x: 0, y: 0, r: 22 },
      { el: 'H', x: -52, y: 40, r: 14 },
      { el: 'H', x: 52, y: 40, r: 14 },
    ],
    bonds: [[0, 1], [0, 2]],
    modes: [
      { name: '对称伸缩', nameEn: 'Symmetric Stretch', freq: 3657, vecs: [[0, -0.3], [-0.7, 0.5], [0.7, 0.5]] },
      { name: '反对称伸缩', nameEn: 'Asymmetric Stretch', freq: 3756, vecs: [[0, 0.2], [-0.8, -0.5], [0.8, -0.5]] },
      { name: '弯曲', nameEn: 'Bend', freq: 1595, vecs: [[0, 0.5], [0.6, -0.4], [-0.6, -0.4]] },
    ],
  },
  {
    id: 'co2', label: 'CO₂',
    atoms: [
      { el: 'C', x: 0, y: 0, r: 18 },
      { el: 'O', x: -62, y: 0, r: 22 },
      { el: 'O', x: 62, y: 0, r: 22 },
    ],
    bonds: [[0, 1], [0, 2]],
    modes: [
      { name: '对称伸缩', nameEn: 'Symmetric Stretch', freq: 1388, vecs: [[0, 0], [-1, 0], [1, 0]] },
      { name: '反对称伸缩', nameEn: 'Asymmetric Stretch', freq: 2349, vecs: [[0.7, 0], [-0.5, 0], [-0.5, 0]] },
      { name: '弯曲', nameEn: 'Bend', freq: 667, vecs: [[0, -0.8], [0, 0.5], [0, 0.5]] },
    ],
  },
  {
    id: 'ch4', label: 'CH₄',
    atoms: [
      { el: 'C', x: 0, y: 0, r: 18 },
      { el: 'H', x: 0, y: -56, r: 13 },
      { el: 'H', x: 53, y: 18, r: 13 },
      { el: 'H', x: -53, y: 18, r: 13 },
      { el: 'H', x: 0, y: 56, r: 13 },
    ],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4]],
    modes: [
      { name: '对称伸缩', nameEn: 'Symmetric Stretch', freq: 2917, vecs: [[0, 0], [0, -1], [1, 0.3], [-1, 0.3], [0, 1]] },
      { name: '弯曲', nameEn: 'Bend', freq: 1534, vecs: [[0, 0.4], [0, -0.6], [0.5, 0.3], [-0.5, 0.3], [0, 0.6]] },
      { name: '反对称伸缩', nameEn: 'Asymmetric Stretch', freq: 3019, vecs: [[0.3, 0], [-0.4, -0.7], [0.7, 0.2], [-0.7, 0.2], [0.4, -0.7]] },
    ],
  },
]

const EXAGGERATION = 24

export function MolecularVibration({ controls }: { controls: ExperienceControls }) {
  const tx = useExperienceI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [molIdx, setMolIdx] = useState(0)
  const [modeIdx, setModeIdx] = useState(0)
  const [amplitude, setAmplitude] = useState(0.7)
  const [playing, setPlaying] = useState(true)
  const [whyOpen, setWhyOpen] = useState(false)
  const finishedRef = useRef(false)
  const visitedModes = useRef<Set<string>>(new Set())
  const timeRef = useRef(0)
  const ampRef = useRef(0.7)
  const playingRef = useRef(true)
  ampRef.current = amplitude
  playingRef.current = playing

  const mol = MOLECULES[molIdx]
  const mode = mol.modes[modeIdx]

  const selectMode = useCallback((idx: number) => {
    controls.registerInteraction()
    setModeIdx(idx)
    const key = `${mol.id}-${idx}`
    visitedModes.current.add(key)
    // Challenge: excite all 3 modes of water
    if (mol.id === 'h2o' && !finishedRef.current) {
      const waterVisited = [0, 1, 2].every((i) => visitedModes.current.has(`h2o-${i}`))
      if (waterVisited) {
        finishedRef.current = true
        controls.finish()
      }
    }
  }, [controls, mol.id])

  useEffect(() => {
    controls.completeOnboarding()
    visitedModes.current.add('h2o-0')
  }, [controls])

  /* ---------- Canvas animation ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w > 0 && h > 0) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
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
      if (playingRef.current) timeRef.current += dt

      const t = timeRef.current
      const cx = w / 2
      const cy = h * 0.46
      const scale = Math.min(w, h) / 320
      const sinT = Math.sin(t * 3.2)
      const amp = ampRef.current * EXAGGERATION * scale

      // Background
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(0, 0, w, h)

      // Subtle grid
      ctx.strokeStyle = 'rgba(77,208,225,0.04)'
      ctx.lineWidth = 1
      for (let gx = 0; gx < w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke() }
      for (let gy = 0; gy < h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke() }

      // Compute displaced positions
      const positions = mol.atoms.map((a, i) => {
        const [vx, vy] = mode.vecs[i]
        return {
          x: cx + (a.x + vx * amp * sinT) * scale,
          y: cy + (a.y + vy * amp * sinT) * scale,
          r: a.r * scale,
          el: a.el,
          vx, vy,
        }
      })

      // Draw bonds with spring effect
      for (const [i, j] of mol.bonds) {
        const a = positions[i]
        const b = positions[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        const restLen = Math.hypot(
          (mol.atoms[j].x - mol.atoms[i].x) * scale,
          (mol.atoms[j].y - mol.atoms[i].y) * scale,
        )
        const stretch = len / restLen
        // Spring coil when stretched
        const coils = 6
        const nx = -dy / len
        const ny = dx / len
        const coilAmp = Math.max(0, (stretch - 0.92)) * 14 * scale

        ctx.strokeStyle = stretch > 1.05 ? RED : 'rgba(200,215,235,0.7)'
        ctx.lineWidth = 2.5 * scale
        ctx.beginPath()
        if (coilAmp > 1) {
          ctx.moveTo(a.x, a.y)
          for (let c = 0; c <= coils; c++) {
            const frac = c / coils
            const px = a.x + dx * frac + nx * coilAmp * Math.sin(frac * Math.PI * coils)
            const py = a.y + dy * frac + ny * coilAmp * Math.sin(frac * Math.PI * coils)
            ctx.lineTo(px, py)
          }
        } else {
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
        }
        ctx.stroke()
      }

      // Draw displacement vectors (purple arrows)
      for (const p of positions) {
        const vLen = Math.hypot(p.vx, p.vy)
        if (vLen < 0.05) continue
        const arrowLen = 28 * scale * ampRef.current
        const ex = p.x + p.vx * arrowLen
        const ey = p.y + p.vy * arrowLen
        ctx.strokeStyle = PURPLE
        ctx.lineWidth = 2
        ctx.globalAlpha = 0.7
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke()
        // Arrowhead
        const angle = Math.atan2(ey - p.y, ex - p.x)
        ctx.beginPath()
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - 7 * Math.cos(angle - 0.4), ey - 7 * Math.sin(angle - 0.4))
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - 7 * Math.cos(angle + 0.4), ey - 7 * Math.sin(angle + 0.4))
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Draw atoms as gradient spheres
      for (const p of positions) {
        const grad = ctx.createRadialGradient(
          p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1,
          p.x, p.y, p.r,
        )
        grad.addColorStop(0, EL_GLOW[p.el])
        grad.addColorStop(1, EL_COLOR[p.el])
        ctx.fillStyle = grad
        ctx.shadowColor = EL_GLOW[p.el]
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0

        // Particle effect when vibrating fast
        if (Math.abs(sinT) > 0.85 && ampRef.current > 0.4) {
          ctx.fillStyle = `rgba(255,209,102,${0.3 * Math.abs(sinT)})`
          for (let pi = 0; pi < 3; pi++) {
            const angle = t * 4 + pi * 2.1
            const dist = p.r + 4 + Math.sin(t * 6 + pi) * 5
            ctx.beginPath()
            ctx.arc(p.x + Math.cos(angle) * dist, p.y + Math.sin(angle) * dist, 2, 0, Math.PI * 2)
            ctx.fill()
          }
        }

        // Red highlight at turning points
        if (Math.abs(sinT) > 0.95) {
          ctx.strokeStyle = RED
          ctx.lineWidth = 2
          ctx.globalAlpha = (Math.abs(sinT) - 0.95) * 20
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      }

      // Mode label + frequency
      ctx.fillStyle = YELLOW
      ctx.font = `800 ${Math.round(16 * scale)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(`${mode.name} · ${mode.freq} cm⁻¹`, cx, cy - 90 * scale)

      // Energy level diagram (right side)
      const elX = w - 60 * scale
      const elTop = cy - 70 * scale
      const elH = 140 * scale
      ctx.strokeStyle = 'rgba(200,215,235,0.2)'
      ctx.lineWidth = 1
      mol.modes.forEach((m, i) => {
        const y = elTop + (i / Math.max(1, mol.modes.length - 1)) * elH
        const active = i === modeIdx
        ctx.strokeStyle = active ? CYAN : 'rgba(200,215,235,0.25)'
        ctx.lineWidth = active ? 2.5 : 1
        ctx.beginPath(); ctx.moveTo(elX - 20, y); ctx.lineTo(elX + 20, y); ctx.stroke()
        if (active) {
          ctx.fillStyle = CYAN
          ctx.beginPath(); ctx.arc(elX, y, 4, 0, Math.PI * 2); ctx.fill()
        }
      })
      ctx.fillStyle = 'rgba(200,215,235,0.5)'
      ctx.font = `600 ${Math.round(10 * scale)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('E', elX, elTop - 12)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [mol, mode, modeIdx])

  const guideSteps: Array<GuideStep> = [
    {
      target: '.mvib-mol-btns',
      title: tx('选择分子'),
      body: tx('点击顶部按钮切换 H₂O、CO₂、CH₄，观察不同分子的振动模式数量与频率差异。'),
    },
    {
      target: '.mvib-mode-btns',
      title: tx('切换振动模式'),
      body: tx('每个分子有若干简正模式——点击模式按钮，原子沿特征向量方向振动，频率各不相同。'),
    },
    {
      title: tx('挑战：激发水的全部模式'),
      body: tx('依次点击水分子的 3 个振动模式（对称伸缩、反对称伸缩、弯曲），全部激发即完成挑战。'),
    },
  ]

  return (
    <div className="oss-experience mvib-experience">
      <canvas ref={canvasRef} className="mvib-canvas" />

      <header className="mvib-question">
        <h1>{tx('分子为什么只在特定频率上振动？')}</h1>
        <p>{tx('选择分子，激发它的简正模式——原子沿特征向量弹跳，键如弹簧伸缩。')}</p>
        <button type="button" className="mvib-why-btn" onClick={() => setWhyOpen(true)}>
          <Question weight="bold" /> {tx('为什么')}</button>
      </header>

      {/* Molecule selector */}
      <nav className="mvib-mol-btns" aria-label={tx('分子选择')}>
        {MOLECULES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            className={`mvib-mol-btn${i === molIdx ? ' is-active' : ''}`}
            onClick={() => { controls.registerInteraction(); setMolIdx(i); setModeIdx(0) }}
          >{m.label}</button>
        ))}
      </nav>

      {/* Mode selector */}
      <nav className="mvib-mode-btns" aria-label={tx('振动模式')}>
        {mol.modes.map((m, i) => (
          <button
            key={`${mol.id}-${i}`}
            type="button"
            className={`mvib-mode-btn${i === modeIdx ? ' is-active' : ''}`}
            onClick={() => selectMode(i)}
          >
            <span className="mvib-mode-name">{tx(m.name)}</span>
            <span className="mvib-mode-freq">{m.freq} cm⁻¹</span>
          </button>
        ))}
      </nav>

      {/* Amplitude slider + play/pause */}
      <footer className="mvib-controls">
        <button
          type="button"
          className="mvib-play-btn"
          onClick={() => { controls.registerInteraction(); setPlaying((p) => !p) }}
          aria-label={playing ? tx('暂停') : tx('播放')}
        >
          {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
        </button>
        <label className="mvib-amp-label">
          <span>{tx('振幅')}</span>
          <input
            type="range"
            min={0.1}
            max={1.5}
            step={0.05}
            value={amplitude}
            onChange={(e) => { controls.registerInteraction(); setAmplitude(Number(e.target.value)) }}
            className="mvib-amp-slider"
          />
        </label>
        <div className="mvib-challenge-hint">
          {finishedRef.current
            ? <><Trophy weight="fill" /> {tx('挑战达成：水分子全部模式已激发')}</>
            : tx('挑战：依次激发水分子的全部 3 个振动模式')}
        </div>
      </footer>

      {/* Why panel */}
      {whyOpen && (
        <div className="mvib-why" role="dialog" aria-label={tx('简正模式原理解释')}>
          <div className="mvib-why-card">
            <button type="button" className="mvib-why-close" onClick={() => setWhyOpen(false)} aria-label={tx('关闭')}>
              <X weight="bold" />
            </button>
            <h2>{tx('简正模式：质量加权 Hessian 的特征向量')}</h2>
            <p>
              {tx('分子在平衡位置附近做小振动时，势能面可近似为二次型。对质量加权 Hessian 矩阵做特征分解，每个特征向量就是一个')}
              <span className="mvib-is-purple">{tx('简正模式')}</span>
              {tx('——所有原子以同一频率、固定相位比沿该方向振动。')}
            </p>
            <p>
              {tx('只有引起偶极矩变化的模式才能吸收红外光（IR 活性）。CO₂ 的')}
              <span className="mvib-is-red">{tx('弯曲模式（667 cm⁻¹）')}</span>
              {tx('恰好落在地球热辐射波段，这正是 CO₂ 成为温室气体的微观原因。')}
            </p>
            <p>
              <span className="mvib-is-red">{tx('边界条件：')}</span>
              {tx('本页使用预计算特征向量的 2D 投影，忽略非谐效应与模式耦合。真实分子在高能级时会出现倍频与组合频。')}
            </p>
            <small>{tx('延伸阅读：Wilson GF 矩阵法 · 红外光谱 · 温室效应分子机制')}</small>
          </div>
        </div>
      )}

      <div className="oss-engine-credit mvib-credit">{tx('Canvas 2D · 简正模式特征向量 · 本地构建')}</div>

      <GuideTour worldId="molecular-vibration" steps={guideSteps} />
      <GhostHint worldId="molecular-vibration" gesture={{ type: 'tap', target: '.mvib-mode-btn', label: tx('点击切换振动模式') }} />
    </div>
  )
}
