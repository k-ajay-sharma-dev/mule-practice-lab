import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Calm Corner: short activities that help when studying feels heavy. Nothing here is graded or saved.
const KIND_WORDS = [
  'You do not have to feel better before you begin. Begin small, and let it carry you.',
  'A hard day is not a failed day. You are still here, still trying.',
  'Rest is part of the work. Your mind learns while it rests too.',
  'You have solved hard things before. This is one more of them.',
  'Be as kind to yourself as you would be to a friend who feels like this.',
  'One problem is enough for today, if one is what you have in you.',
  'Feelings come and go like weather. This one will pass too.',
  'You are allowed to go slowly. Slow is still forward.',
  'What you are learning is yours. No bad day can take it away.',
  'Breathe out. You do not have to carry everything at once.',
]

const ACTIVITIES = [
  ['breathe', 'Breathe', 'A guided breathing circle'],
  ['ground', 'Ground yourself', '5 things you see, 4 you feel…'],
  ['letgo', 'Let it go', 'Write a worry, then release it'],
  ['bubbles', 'Pop bubbles', 'Pop them one by one'],
  ['stretch', 'Stretch', 'Six gentle desk stretches'],
]

export default function CalmPage() {
  const [words, setWords] = useState(() => Math.floor(Math.random() * KIND_WORDS.length))
  const [activity, setActivity] = useState('breathe')

  return (
    <div className="calm-page">
      <p className="eyebrow">// calm corner</p>
      <h1>Calm Corner</h1>
      <p className="muted">Take a few minutes for yourself. Nothing here is graded or saved. Come back to the problems whenever you are ready.</p>

      <section className="calm-words">
        <p>{KIND_WORDS[words]}</p>
        <button className="btn btn-ghost btn-sm" onClick={() => setWords((w) => (w + 1) % KIND_WORDS.length)}>
          Another kind word
        </button>
      </section>

      <div className="calm-tabs" role="tablist">
        {ACTIVITIES.map(([key, label, hint]) => (
          <button key={key} role="tab" aria-selected={activity === key} className={`calm-tab${activity === key ? ' active' : ''}`} onClick={() => setActivity(key)}>
            <strong>{label}</strong>
            <span className="small muted">{hint}</span>
          </button>
        ))}
      </div>

      <section className="calm-stage">
        {activity === 'breathe' && <Breathe />}
        {activity === 'ground' && <Ground />}
        {activity === 'letgo' && <LetGo />}
        {activity === 'bubbles' && <Bubbles />}
        {activity === 'stretch' && <Stretch />}
      </section>

      <p className="small muted calm-support">
        If the sadness stays, or feels too heavy to carry, please talk to someone: a friend, family, a doctor, or a mental
        health helpline in your country. Reaching out is a strong thing to do. You deserve support.
      </p>
      <p>
        <Link to="/" className="btn btn-ghost btn-sm">
          ← Back to the Learning Path
        </Link>
      </p>
    </div>
  )
}

// ---------- Breathe ----------
const PATTERNS = {
  box: { label: 'Box (4 · 4 · 4 · 4)', steps: [['Breathe in', 4, 'in'], ['Hold', 4, 'in'], ['Breathe out', 4, 'out'], ['Hold', 4, 'out']] },
  calm: { label: 'Relax (4 · 7 · 8)', steps: [['Breathe in', 4, 'in'], ['Hold', 7, 'in'], ['Breathe out', 8, 'out']] },
  gentle: { label: 'Gentle (4 · 6)', steps: [['Breathe in', 4, 'in'], ['Breathe out', 6, 'out']] },
}

function Breathe() {
  const [pattern, setPattern] = useState('gentle')
  const [minutes, setMinutes] = useState(1)
  const [run, setRun] = useState(null) // { step, left, endsAt }
  const steps = PATTERNS[pattern].steps

  useEffect(() => {
    if (!run) return
    const t = setTimeout(() => {
      if (Date.now() >= run.endsAt && run.step === steps.length - 1 && run.left <= 1) return setRun({ done: true })
      if (run.left > 1) return setRun({ ...run, left: run.left - 1 })
      const step = (run.step + 1) % steps.length
      setRun({ ...run, step, left: steps[step][1] })
    }, 1000)
    return () => clearTimeout(t)
  }, [run, steps])

  const start = () => setRun({ step: 0, left: steps[0][1], endsAt: Date.now() + minutes * 60000 })
  const [label, seconds, size] = run && !run.done ? steps[run.step] : ['Ready when you are', 4, 'out']

  return (
    <div className="breathe">
      <div className="calm-options">
        <select className="input" value={pattern} onChange={(e) => (setPattern(e.target.value), setRun(null))}>
          {Object.entries(PATTERNS).map(([k, p]) => (
            <option key={k} value={k}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="input" value={minutes} onChange={(e) => (setMinutes(Number(e.target.value)), setRun(null))}>
          {[1, 3, 5].map((m) => (
            <option key={m} value={m}>
              {m} minute{m > 1 ? 's' : ''}
            </option>
          ))}
        </select>
        {run && !run.done ? (
          <button className="btn" onClick={() => setRun(null)}>
            Stop
          </button>
        ) : (
          <button className="btn btn-primary" onClick={start}>
            {run?.done ? 'Again' : 'Start'}
          </button>
        )}
      </div>
      <div className="breathe-area">
        <div className={`breathe-circle ${size}`} style={{ transitionDuration: `${seconds}s` }} />
        <div className="breathe-text">
          <strong>{run?.done ? 'Well done' : label}</strong>
          {run && !run.done && <span className="mono">{run.left}</span>}
          {run?.done && <span className="small muted">Notice how you feel now.</span>}
        </div>
      </div>
    </div>
  )
}

// ---------- Ground yourself (5 4 3 2 1) ----------
const SENSES = [
  [5, 'things you can see', 'Look around slowly. A colour, a shape, the light on a wall.'],
  [4, 'things you can feel', 'Your feet on the floor, the chair under you, the air on your skin.'],
  [3, 'things you can hear', 'Near sounds and far ones. A fan, a bird, your own breath.'],
  [2, 'things you can smell', 'Tea, soap, the air in the room. Or two smells you like.'],
  [1, 'thing you can taste', 'Or one good thing about today, however small.'],
]

function Ground() {
  const [at, setAt] = useState(0)
  const [ticked, setTicked] = useState(0)
  if (at >= SENSES.length)
    return (
      <div className="ground-done">
        <p className="calm-big">You are here, right now.</p>
        <p className="muted">Your mind came back to the room with you. Take that calm into the next thing you do.</p>
        <button className="btn" onClick={() => (setAt(0), setTicked(0))}>
          Start again
        </button>
      </div>
    )
  const [count, what, hint] = SENSES[at]
  return (
    <div className="ground">
      <p className="calm-big">
        Name {count} {what}
      </p>
      <p className="muted">{hint}</p>
      <div className="ground-dots">
        {Array.from({ length: count }, (_, i) => (
          <button key={i} className={`ground-dot${i < ticked ? ' on' : ''}`} onClick={() => setTicked(i + 1)} aria-label={`Found ${i + 1}`}>
            {i + 1}
          </button>
        ))}
      </div>
      <button className={`btn${ticked >= count ? ' btn-primary' : ''}`} onClick={() => (setAt(at + 1), setTicked(0))}>
        {at === SENSES.length - 1 ? 'Finish' : 'Next'}
      </button>
    </div>
  )
}

// ---------- Let it go ----------
function LetGo() {
  const [text, setText] = useState('')
  const [floating, setFloating] = useState([])
  const release = () => {
    if (!text.trim()) return
    const id = Date.now()
    setFloating((f) => [...f, { id, text: text.trim() }])
    setText('')
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 4200)
  }
  return (
    <div className="letgo">
      <p className="muted">Write what is weighing on you. When you press Let it go, it floats away. It is never saved or sent anywhere.</p>
      <textarea className="input letgo-input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="What is on your mind…" />
      <button className="btn btn-primary" onClick={release} disabled={!text.trim()}>
        Let it go
      </button>
      <div className="letgo-sky" aria-hidden="true">
        {floating.map((f) => (
          <div key={f.id} className="letgo-float">
            {f.text}
          </div>
        ))}
      </div>
      {floating.length > 0 && <p className="small muted letgo-note">It is gone now. You do not need to hold it for this moment.</p>}
    </div>
  )
}

// ---------- Pop bubbles ----------
const BUBBLE_COUNT = 30
const freshBubbles = () => Array.from({ length: BUBBLE_COUNT }, (_, i) => ({ id: `${Date.now()}-${i}`, popped: false, hue: 195 + Math.random() * 35 }))

function Bubbles() {
  const [bubbles, setBubbles] = useState(freshBubbles)
  const [total, setTotal] = useState(0)
  const left = bubbles.filter((b) => !b.popped).length
  const pop = (id) => {
    setBubbles((list) => list.map((b) => (b.id === id && !b.popped ? { ...b, popped: true } : b)))
    setTotal((t) => t + 1)
  }
  return (
    <div className="bubbles">
      <p className="muted">
        Pop them slowly, one at a time. {total > 0 && <span>{total} popped.</span>}
      </p>
      <div className="bubble-sheet">
        {bubbles.map((b) => (
          <button
            key={b.id}
            className={`bubble${b.popped ? ' popped' : ''}`}
            style={{ '--hue': b.hue }}
            onClick={() => pop(b.id)}
            disabled={b.popped}
            aria-label={b.popped ? 'Popped' : 'Pop'}
          />
        ))}
      </div>
      {left === 0 && (
        <button className="btn btn-primary" onClick={() => setBubbles(freshBubbles())}>
          A fresh sheet
        </button>
      )}
    </div>
  )
}

// ---------- Stretch ----------
const STRETCHES = [
  ['Neck rolls', 'Drop your chin to your chest. Roll your head slowly to one side, then the other.'],
  ['Shoulder shrugs', 'Lift your shoulders up to your ears, hold, then let them fall. Repeat a few times.'],
  ['Reach up', 'Lace your fingers and push your palms up to the ceiling. Grow tall.'],
  ['Side bend', 'One arm up, lean gently to the other side. Then switch sides.'],
  ['Wrist circles', 'Circle your wrists both ways. Open and close your hands.'],
  ['Look far away', 'Find something far from you, out of a window if you can, and rest your eyes on it.'],
]
const STRETCH_SECONDS = 20

function Stretch() {
  const [at, setAt] = useState(null)
  const [left, setLeft] = useState(STRETCH_SECONDS)
  const timer = useRef(null)

  useEffect(() => {
    if (at === null || at >= STRETCHES.length) return
    timer.current = setTimeout(() => {
      if (left > 1) setLeft(left - 1)
      else {
        setAt(at + 1)
        setLeft(STRETCH_SECONDS)
      }
    }, 1000)
    return () => clearTimeout(timer.current)
  }, [at, left])

  if (at === null)
    return (
      <div className="stretch">
        <p className="muted">Six gentle stretches, {STRETCH_SECONDS} seconds each. Go only as far as feels good.</p>
        <button className="btn btn-primary" onClick={() => setAt(0)}>
          Start
        </button>
      </div>
    )
  if (at >= STRETCHES.length)
    return (
      <div className="stretch">
        <p className="calm-big">All done. Your body thanks you.</p>
        <button className="btn" onClick={() => (setAt(0), setLeft(STRETCH_SECONDS))}>
          Once more
        </button>
      </div>
    )
  const [name, how] = STRETCHES[at]
  return (
    <div className="stretch">
      <div className="small muted">
        {at + 1} of {STRETCHES.length}
      </div>
      <p className="calm-big">{name}</p>
      <p className="muted">{how}</p>
      <div className="stretch-bar">
        <div style={{ width: `${((STRETCH_SECONDS - left) / STRETCH_SECONDS) * 100}%` }} />
      </div>
      <div className="calm-options">
        <span className="mono">{left}s</span>
        <button className="btn btn-sm" onClick={() => (setAt(at + 1), setLeft(STRETCH_SECONDS))}>
          Next →
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setAt(null)}>
          Stop
        </button>
      </div>
    </div>
  )
}
