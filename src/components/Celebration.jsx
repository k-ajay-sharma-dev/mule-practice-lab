import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { levelOf, usePoints } from '../store/points.js'
import { takeSolve } from '../store/solves.js'

const CHEERS = [
  'Nice work. One more step forward.',
  'You did that. Well done.',
  'Small steps add up. This was one.',
  'That one is yours now.',
  'Good thinking. Keep that feeling.',
  'Proof that you can do this.',
  'Every answer makes the next one lighter.',
  'You showed up today, and it counts.',
  'Steady progress. Be proud of it.',
  'Your future self says thank you.',
]
const pick = (list) => list[Math.floor(Math.random() * list.length)]

// Celebrates a first solve: a short burst of confetti and a card with the points earned, and a bigger moment for
// a new level. People who ask their system for less motion get the card without the confetti.
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
    const from = levelOf(before)
    const to = levelOf(total)
    const levelUp = to.level > from.level
    setShown({ key: Date.now(), gained: total - before, label: solve.label, cheer: pick(CHEERS), levelUp, to, total })
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) confetti(levelUp ? 160 : 70)
  }, [total])

  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), shown.levelUp ? 7000 : 4000)
    return () => clearTimeout(t)
  }, [shown])

  if (!shown) return null
  return (
    <div key={shown.key} className={`celebrate-card${shown.levelUp ? ' level-up' : ''}`} role="status" onClick={() => setShown(null)}>
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
          <div className="celebrate-points">+{shown.gained} points</div>
          <div className="celebrate-title">{shown.label}</div>
          <div className="small muted">{shown.cheer}</div>
        </>
      )}
      <Link to="/calm" className="small celebrate-link" onClick={(e) => e.stopPropagation()}>
        Take a short break in the Calm Corner
      </Link>
    </div>
  )
}

// A one-off canvas of falling paper in the app's blues, with a few warm pieces. Removed when the last piece is gone.
function confetti(count) {
  const canvas = document.createElement('canvas')
  canvas.className = 'confetti-canvas'
  const dpr = window.devicePixelRatio || 1
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const colors = ['#2f81f7', '#58a6ff', '#79c0ff', '#a5d6ff', '#3fb950', '#d29922', '#f778ba']
  const pieces = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 160,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 11 - 4,
    size: 5 + Math.random() * 6,
    spin: Math.random() * Math.PI,
    turn: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }))
  const start = performance.now()
  function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    const fade = Math.max(0, 1 - (now - start) / 2600)
    for (const p of pieces) {
      p.vy += 0.32
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.spin += p.turn
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y)
      ctx.rotate(p.spin)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }
    if (fade > 0) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
