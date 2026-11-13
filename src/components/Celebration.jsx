import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { problemById } from '../data/problems.js'
import { levelOf, usePoints } from '../store/points.js'
import { takeSolve } from '../store/solves.js'

// How big the moment is grows with the problem: a small sparkle for a Logging Lab exercise or a beginner problem,
// a confetti burst for intermediate, fireworks for advanced, and fireworks with a golden rain for expert.
// A new level always gets the grand one.
const TIERS = {
  small: {
    effect: 'sparkle',
    ms: 3500,
    cheers: ['Nice and steady.', 'One more done.', 'Good. Keep the rhythm.', 'Small steps add up.', 'That one is yours now.'],
  },
  INTERMEDIATE: {
    effect: 'burst',
    ms: 4500,
    title: 'Intermediate problem solved',
    cheers: ['Good thinking. Keep that feeling.', 'You are getting stronger at this.', 'That took real work. Well done.', 'Proof that you can do this.'],
  },
  ADVANCED: {
    effect: 'fireworks',
    ms: 6000,
    title: 'Advanced problem solved!',
    cheers: ['That was a hard one, and you did it.', 'This is real interview level work. Be proud.', 'You stayed with a hard problem. That is a skill.', 'Look at you. Advanced, solved.'],
  },
  EXPERT: {
    effect: 'grand',
    ms: 8000,
    title: 'Expert problem solved!',
    cheers: ['Expert level. Few people get here. You did.', 'This is architect work, and it is yours now.', 'Take a moment. You earned this one.'],
  },
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]

export default function Celebration() {
  const { total } = usePoints()
  const last = useRef(total)
  const [shown, setShown] = useState(null)

  useEffect(() => {
    const before = last.current
    last.current = total
    if (total <= before) return
    const solve = takeSolve()
    if (!solve) return
    const level = problemById.get(solve.id)?.level
    const key = TIERS[level] ? level : 'small'
    const tier = TIERS[key]
    const from = levelOf(before)
    const to = levelOf(total)
    const levelUp = to.level > from.level
    setShown({
      key: Date.now(),
      tier: levelUp ? 'level-up' : key,
      gained: total - before,
      title: tier.title ?? (level === 'BEGINNER' ? 'Beginner problem solved' : solve.label),
      cheer: pick(tier.cheers),
      ms: levelUp ? 8000 : tier.ms,
      levelUp,
      to,
      total,
    })
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) play(levelUp ? 'grand' : tier.effect)
  }, [total])

  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), shown.ms)
    return () => clearTimeout(t)
  }, [shown])

  if (!shown) return null
  const big = shown.levelUp || shown.tier === 'EXPERT' || shown.tier === 'ADVANCED'
  return (
    <div key={shown.key} className={`celebrate-card tier-${shown.tier.toLowerCase()}${big ? ' centered' : ''}`} role="status" onClick={() => setShown(null)}>
      {shown.levelUp ? (
        <>
          <div className="celebrate-big">Level {shown.to.level}</div>
          <div className="celebrate-title">Your new title: {shown.to.name}</div>
          <div className="small muted">
            +{shown.gained} points · {shown.total} in total. Look how far you have come.
          </div>
        </>
      ) : (
        <>
          {shown.tier === 'EXPERT' && <div className="celebrate-trophy">🏆</div>}
          <div className="celebrate-points">+{shown.gained} points</div>
          <div className="celebrate-title">{shown.title}</div>
          <div className={shown.tier === 'small' ? 'small muted' : 'muted'}>{shown.cheer}</div>
        </>
      )}
      {shown.tier !== 'small' && (
        <Link to="/calm" className="small celebrate-link" onClick={(e) => e.stopPropagation()}>
          Take a short break in the Calm Corner
        </Link>
      )}
    </div>
  )
}

// ---------- effects ----------
// One canvas per celebration, removed when the last particle has faded.
const BLUES = ['#2f81f7', '#58a6ff', '#79c0ff', '#a5d6ff', '#38bdf8']
const WARM = ['#3fb950', '#d29922', '#f778ba', '#bc8cff']
const GOLD = ['#f2cc60', '#ffd866', '#e3b341', '#fff1b8']

function play(effect) {
  const w = innerWidth
  const h = innerHeight
  const parts = []
  const add = (p) => parts.push({ delay: 0, gravity: 0.3, drag: 0.99, life: 1, fade: 0.012, shape: 'rect', spin: Math.random() * 6, turn: (Math.random() - 0.5) * 0.3, ...p })

  const burst = (x, y, count, colors, speed, extra = {}) => {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.4 + Math.random() * 0.6)
      add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 3 + Math.random() * 3, color: pick(colors), ...extra })
    }
  }

  if (effect === 'sparkle') {
    // a few stars twinkling over the card in the corner
    for (let i = 0; i < 16; i++)
      add({ x: w - 60 - Math.random() * 260, y: h - 40 - Math.random() * 130, vx: (Math.random() - 0.5) * 0.6, vy: -0.4 - Math.random() * 0.6, gravity: 0, size: 5 + Math.random() * 5, shape: 'star', color: pick([...BLUES, ...GOLD]), delay: Math.random() * 25, fade: 0.018 })
  }
  if (effect === 'burst') {
    for (let i = 0; i < 90; i++)
      add({ x: w / 2 + (Math.random() - 0.5) * 160, y: h * 0.4, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 12 - 4, size: 5 + Math.random() * 6, color: pick([...BLUES, ...WARM]), fade: 0.008 })
  }
  if (effect === 'fireworks' || effect === 'grand') {
    const shots = effect === 'grand' ? 7 : 4
    for (let i = 0; i < shots; i++) {
      const x = w * (0.2 + Math.random() * 0.6)
      const y = h * (0.15 + Math.random() * 0.3)
      const colors = i % 2 ? BLUES : effect === 'grand' ? GOLD : WARM
      // the rocket rises, then bursts where it stops
      add({ x, y: h, vx: 0, vy: -(h - y) / 40, gravity: 0, drag: 1, size: 3, shape: 'dot', color: '#ffffff', delay: i * 22, fade: 0, ttl: 40, then: () => burst(x, y, 70, colors, 7, { shape: 'dot', gravity: 0.06, drag: 0.97, fade: 0.014, delay: 0 }) })
    }
  }
  if (effect === 'grand') {
    // golden paper falling over the whole screen
    for (let i = 0; i < 140; i++)
      add({ x: Math.random() * w, y: -20 - Math.random() * h * 0.6, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, gravity: 0.03, drag: 1, size: 6 + Math.random() * 6, color: pick([...GOLD, ...BLUES]), delay: 20 + Math.random() * 60, fade: 0.004 })
  }

  const canvas = document.createElement('canvas')
  canvas.className = 'confetti-canvas'
  const dpr = devicePixelRatio || 1
  canvas.width = w * dpr
  canvas.height = h * dpr
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  function frame() {
    ctx.clearRect(0, 0, w, h)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (p.delay > 0) {
        p.delay--
        continue
      }
      p.vy += p.gravity
      p.vx *= p.drag
      p.vy *= p.drag
      p.x += p.vx
      p.y += p.vy
      p.spin += p.turn
      p.life -= p.fade
      if (p.ttl !== undefined && --p.ttl <= 0) {
        parts.splice(i, 1)
        p.then?.()
        continue
      }
      if (p.life <= 0 || p.y > h + 40) {
        parts.splice(i, 1)
        continue
      }
      draw(ctx, p)
    }
    if (parts.length) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

function draw(ctx, p) {
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, p.life))
  ctx.translate(p.x, p.y)
  ctx.fillStyle = p.color
  if (p.shape === 'dot') {
    ctx.beginPath()
    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (p.shape === 'star') {
    ctx.rotate(p.spin * 0.2)
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? p.size * 0.35 : p.size
      ctx.lineTo(Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r)
    }
    ctx.fill()
  } else {
    ctx.rotate(p.spin)
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
  }
  ctx.restore()
}
