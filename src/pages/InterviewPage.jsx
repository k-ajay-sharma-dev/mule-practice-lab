import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AnswerCheck from '../components/AnswerCheck.jsx'
import Markdown from '../components/Markdown.jsx'
import useSpeechText, { canListen } from '../components/useSpeechText.js'
import useVoiceRecorder, { canRecord } from '../components/useVoiceRecorder.js'
import { RecordingLive, SavedAnswers, VoiceClip } from '../components/VoiceRecording.jsx'
import { deckByKey, DECKS, followUpCards, shuffle } from '../data/cards.js'
import { categoryBySlug } from '../data/categories.js'
import { loadProblems } from '../data/problems.js'
import { loadBoxes, nextBox, saveBoxes } from '../store/flash.js'
import { writeLocal } from '../store/local.js'
import { scheduleReview } from '../store/progress.js'
import { checkAnswer } from '../study/answer-check.js'
import { saveProblem } from '../study/recording.js'
import { useSyncStatus } from '../sync/status.js'

// Timed spoken practice on interview follow-ups: answer out loud against the clock, then compare and rate honestly.
// Ratings share the flashcard boxes, so a miss also shows up in Flashcards, Review and Weak Areas.
const HISTORY_KEY = 'pl.interview.history'
const MAX_HISTORY = 30
const LOW_SECONDS = 10
const COUNTS = [5, 10, 15]
const TIMES = [60, 90, 120, 180]
const RATINGS = [
  { key: 'missed', label: 'Missed it' },
  { key: 'partly', label: 'Partly' },
  { key: 'nailed', label: 'Nailed it', primary: true },
]

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

function speak(text) {
  if (!canSpeak) return
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text.replace(/[`*_]/g, '')))
}

function readHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY))
    return Array.isArray(list) ? list.filter((h) => h && typeof h.date === 'string' && Number.isFinite(h.total)) : []
  } catch {
    return []
  }
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function Countdown({ seconds, onEnd }) {
  const [left, setLeft] = useState(seconds)
  const end = useRef(onEnd)
  end.current = onEnd

  // measured against a deadline, so a throttled background tab cannot stretch the time
  useEffect(() => {
    const deadline = Date.now() + seconds * 1000
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setLeft(remaining)
      if (remaining === 0) {
        clearInterval(timer)
        end.current()
      }
    }, 250)
    return () => clearInterval(timer)
  }, [seconds])

  return <span className={`interview-timer mono${left <= LOW_SECONDS ? ' low timer-blink' : ''}`}>{clock(left)}</span>
}

export default function InterviewPage() {
  const [deckKey, setDeckKey] = useState('all')
  const [count, setCount] = useState(COUNTS[0])
  const [seconds, setSeconds] = useState(TIMES[1])
  const [aloud, setAloud] = useState(false)
  const [record, setRecord] = useState(false)
  const [check, setCheck] = useState(false)
  const voice = useVoiceRecorder()
  const speech = useSpeechText()
  const signedIn = Boolean(useSyncStatus().user)
  const [kept, setKept] = useState({}) // question id -> what happened to its recording
  const [keptVersion, setKeptVersion] = useState(0)
  const [round, setRound] = useState(null) // { cards, index, revealed, timedOut, ratings: [{ card, rating }] }
  const [history, setHistory] = useState(readHistory)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const card = round?.cards[round.index]
  const finished = round && round.index >= round.cards.length

  useEffect(() => {
    if (aloud && card && !round.revealed) speak(card.front)
  }, [aloud, card, round?.revealed])
  useEffect(() => () => canSpeak && window.speechSynthesis.cancel(), [])

  // one clip per question: it runs from the question appearing until the answer is revealed
  useEffect(() => {
    if (card && !round.revealed && voice.micOn) voice.begin(card.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, round?.revealed, voice.micOn])

  useEffect(() => {
    if (check && card && !round.revealed) speech.start(card.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, card?.id, round?.revealed])

  async function start() {
    setLoading(true)
    setFailed(false)
    voice.discard()
    speech.clear()
    setKept({})
    // a blocked microphone shows why, and the practice carries on without recording
    if (record) await voice.open()
    try {
      const boxes = loadBoxes()
      const deck = deckByKey(deckKey).pick().filter((p) => p.cards > 0)
      const loaded = await loadProblems(shuffle(deck).slice(0, 40).map((p) => p.id))
      const cards = shuffle(loaded.filter(Boolean).flatMap(followUpCards))
        .sort((a, b) => (boxes[a.id] ?? 0) - (boxes[b.id] ?? 0))
        .slice(0, count)
      if (!cards.length) {
        voice.close()
        return setFailed(true)
      }
      setRound({ cards: shuffle(cards), index: 0, revealed: false, timedOut: false, ratings: [] })
    } catch {
      voice.close()
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  const reveal = (timedOut) => {
    if (canSpeak) window.speechSynthesis.cancel()
    voice.finish()
    speech.stop()
    setRound((r) => ({ ...r, revealed: true, timedOut }))
  }

  function endPractice() {
    voice.close()
    voice.discard()
    speech.clear()
    setRound(null)
  }

  async function keepAnswer(question, rating, clip) {
    const status = (text) => setKept((k) => ({ ...k, [question.id]: text }))
    status('Saving to your account…')
    try {
      const { saveRecording } = await import('../sync/recordings.js')
      const info = { question: question.front, problemId: question.problem.id, rating, seconds: Math.round(clip.seconds) }
      await saveRecording(info, clip.blob)
      status('Saved to your account')
      setKeptVersion((v) => v + 1)
    } catch (error) {
      status(saveProblem(error))
    }
  }

  function rate(rating) {
    if (signedIn && voice.clips[card.id]) keepAnswer(card, rating, voice.clips[card.id])
    const boxes = loadBoxes()
    if (rating !== 'partly') saveBoxes({ ...boxes, [card.id]: nextBox(boxes[card.id], rating === 'nailed') })
    if (rating === 'missed') scheduleReview(card.problem.id)

    const points = check ? checkAnswer(speech.texts[card.id] ?? '', card.front, card.back) : null
    const ratings = [...round.ratings, { card, rating, points }]
    const index = round.index + 1
    setRound({ ...round, index, revealed: false, timedOut: false, ratings })
    if (index >= round.cards.length) {
      voice.close()
      saveRound(ratings)
    }
  }

  function saveRound(ratings) {
    const tally = (key) => ratings.filter((r) => r.rating === key).length
    const entry = {
      date: new Date().toISOString(),
      deck: deckByKey(deckKey).label,
      seconds,
      total: ratings.length,
      nailed: tally('nailed'),
      partly: tally('partly'),
      missed: tally('missed'),
    }
    const next = [...history, entry].slice(-MAX_HISTORY)
    setHistory(next)
    writeLocal(HISTORY_KEY, JSON.stringify(next))
  }

  if (!round || finished) {
    const missed = finished ? round.ratings.filter((r) => r.rating === 'missed') : []
    const checked = finished ? round.ratings.filter((r) => r.points) : []
    const sumOf = (key) => checked.reduce((sum, r) => sum + r.points[key], 0)
    const last = history.at(-1)
    return (
      <div className="flash-page">
        <p className="eyebrow">// interview practice</p>
        <h1>Interview Practice</h1>
        <p className="muted">
          Answer each follow-up <b>out loud</b> before the clock runs out, as you would to an interviewer. Then compare
          with the model answer and rate yourself honestly. The rating is your own judgement.
        </p>

        {finished && (
          <>
            <div className="match-banner pass flash-summary">
              Round done: {last.nailed} nailed · {last.partly} partly · {last.missed} missed
            </div>
            {checked.length > 0 && (
              <p className="muted small">
                By word match, you covered {sumOf('covered')} of {sumOf('total')} points from the model answers.
              </p>
            )}
            {missed.length > 0 && (
              <>
                <h2 className="section-heading">Practise these again</h2>
                <p className="muted small">These problems are now on your review schedule.</p>
                <ul className="interview-missed">
                  {missed.map(({ card: c }) => (
                    <li key={c.id}>
                      <Markdown>{c.front}</Markdown>
                      <Link className="small" to={`/${c.problem.category}/${c.problem.id}`}>
                        {c.problem.title} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {Object.keys(voice.clips).length > 0 && (
              <>
                <h2 className="section-heading">Listen back</h2>
                {!signedIn && (
                  <p className="muted small">
                    You're not signed in, so these go when you leave this page. Download any you want to keep.
                  </p>
                )}
                <ul className="voice-list">
                  {round.ratings.map(({ card: c, rating }, i) =>
                    voice.clips[c.id] ? (
                      <li key={c.id}>
                        <Markdown>{c.front}</Markdown>
                        <VoiceClip
                          clip={voice.clips[c.id]}
                          number={i + 1}
                          label={RATINGS.find((r) => r.key === rating).label}
                          status={kept[c.id]}
                        />
                      </li>
                    ) : null,
                  )}
                </ul>
              </>
            )}
          </>
        )}

        <div className="mock-setup">
          <label className="field">
            Deck
            <select className="input" value={deckKey} onChange={(e) => setDeckKey(e.target.value)}>
              {DECKS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Questions
            <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Time per answer
            <select className="input" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {clock(t)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canSpeak && (
          <p>
            <label className="check-inline">
              <input type="checkbox" checked={aloud} onChange={(e) => setAloud(e.target.checked)} />
              Read each question aloud
            </label>
          </p>
        )}
        {canRecord && (
          <p>
            <label className="check-inline">
              <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
              Record my answers so I can listen back
            </label>
            <span className="muted small voice-note">
              {signedIn
                ? 'Answers you rate are saved to your Google account, and your latest 30 are kept.'
                : "You're not signed in, so recordings stay on this page and go when you leave it."}
            </span>
          </p>
        )}
        {canListen() && (
          <p>
            <label className="check-inline">
              <input type="checkbox" checked={check} onChange={(e) => setCheck(e.target.checked)} />
              Check my spoken answers against the model answer
            </label>
            <span className="muted small voice-note">
              Your browser turns your speech into text, and Chrome sends the audio to Google to do that. Nothing is saved.
            </span>
          </p>
        )}
        <button className="btn btn-primary" onClick={start} disabled={loading}>
          {loading ? 'Preparing…' : finished ? 'Another round' : 'Start practice'}
        </button>
        {failed && <p className="warn-text small">Couldn't load the questions. Check your connection, or try another deck.</p>}

        {history.length > 0 && (
          <>
            <h2 className="section-heading">Recent rounds</h2>
            <ul className="mock-history">
              {[...history]
                .reverse()
                .slice(0, 5)
                .map((h) => (
                  <li key={h.date}>
                    <span className="muted small">{new Date(h.date).toLocaleString()}</span>
                    <span>
                      {h.nailed} / {h.total}
                    </span>
                    <span className="muted small">
                      {h.deck} · {h.partly} partly · {h.missed} missed
                    </span>
                  </li>
                ))}
            </ul>
          </>
        )}

        {signedIn && <SavedAnswers version={keptVersion} />}
      </div>
    )
  }

  return (
    <div className="flash-page">
      <div className="flash-top">
        <button className="btn btn-ghost btn-sm" onClick={endPractice}>
          ← End practice
        </button>
        <span className="mono small muted">
          {round.index + 1} / {round.cards.length}
        </span>
      </div>
      <div className="progress-bar flash-progress">
        <div style={{ width: `${(round.index / round.cards.length) * 100}%` }} />
      </div>

      <div className={`flash-card${round.revealed ? ' flipped' : ''}`}>
        <div className="flash-kind">
          {round.revealed ? (
            <span className="mode-chip">{round.timedOut ? 'Time is up' : 'Compare your answer'}</span>
          ) : (
            <Countdown key={card.id} seconds={seconds} onEnd={() => reveal(true)} />
          )}
          <span className="muted small">{categoryBySlug.get(card.problem.category)?.label}</span>
        </div>
        <div className="flash-front">
          <Markdown>{card.front}</Markdown>
        </div>
        {voice.problem && <p className="warn-text small">{voice.problem} This round continues without recording.</p>}
        {check && speech.problem && <p className="warn-text small">{speech.problem}</p>}
        {round.revealed ? (
          <>
            {voice.clips[card.id] && <VoiceClip clip={voice.clips[card.id]} number={round.index + 1} />}
            <div className="flash-back">
              <Markdown>{card.back}</Markdown>
            </div>
            {check && <AnswerCheck card={card} text={speech.texts[card.id]} onEdit={(text) => speech.edit(card.id, text)} />}
            <div className="interview-rate">
              {RATINGS.map((r) => (
                <button key={r.key} className={`btn${r.primary ? ' btn-primary' : ''}`} onClick={() => rate(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
            <Link className="small" to={`/${card.problem.category}/${card.problem.id}`}>
              Open problem: {card.problem.title} →
            </Link>
          </>
        ) : (
          <>
            {voice.recording && <RecordingLive stream={voice.stream.current} />}
            {check && !speech.problem && <p className="answer-live small">{speech.texts[card.id] || 'Listening…'}</p>}
            <p className="muted small">Speak your answer now.</p>
            <button className="btn btn-primary flash-flip" onClick={() => reveal(false)}>
              I've finished answering
            </button>
          </>
        )}
      </div>
    </div>
  )
}
