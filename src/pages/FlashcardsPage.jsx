import { useState } from 'react'
import { Link } from 'react-router-dom'
import Markdown from '../components/Markdown.jsx'
import MultiPick from '../components/MultiPick.jsx'
import { cardsOf, DECK_OPTIONS, deckLists, shuffle } from '../data/cards.js'
import { categoryBySlug } from '../data/categories.js'
import { loadProblems } from '../data/problems.js'
import { loadBoxes, nextBox, saveBoxes } from '../store/flash.js'
import { evenMix } from '../study/mix.js'

const ROUND_SIZE = 20

export default function FlashcardsPage() {
  const [deckKeys, setDeckKeys] = useState([])
  const [round, setRound] = useState(null) // { cards, index, flipped, again, good }
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [boxes, setBoxes] = useState(loadBoxes)

  async function start() {
    setLoading(true)
    setFailed(false)
    try {
      const lists = deckLists(deckKeys).map((list) => list.filter((p) => p.cards > 0))
      // load a random slice of the deck's problems, then prefer the cards you know least
      const loaded = await loadProblems(evenMix(lists, shuffle).slice(0, 40).map((p) => p.id))
      const cards = shuffle(loaded.filter(Boolean).flatMap(cardsOf))
        .sort((a, b) => (boxes[a.id] ?? 0) - (boxes[b.id] ?? 0))
        .slice(0, ROUND_SIZE)
      setRound({ cards: shuffle(cards), index: 0, flipped: false, again: 0, good: 0 })
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  function grade(good) {
    const card = round.cards[round.index]
    const next = { ...boxes, [card.id]: nextBox(boxes[card.id], good) }
    setBoxes(next)
    saveBoxes(next)
    setRound({
      ...round,
      index: round.index + 1,
      flipped: false,
      again: round.again + (good ? 0 : 1),
      good: round.good + (good ? 1 : 0),
    })
  }

  const known = Object.values(boxes).filter((b) => b >= 3).length

  if (!round || round.index >= round.cards.length) {
    return (
      <div className="flash-page">
        <p className="eyebrow">// flashcards</p>
        <h1>Flashcards</h1>
        <p className="muted">
          Rapid review of interview follow-ups and key points. Say the answer out loud, flip, and be honest:
          <b> Again</b> brings a card back soon, <b>Good</b> moves it up a box.
        </p>
        {round && (
          <div className="match-banner pass flash-summary">
            Round done: {round.good} good · {round.again} again
          </div>
        )}
        <div className="flash-setup">
          <MultiPick label="Deck" options={DECK_OPTIONS} value={deckKeys} onChange={setDeckKeys} />
          <button className="btn btn-primary" onClick={start} disabled={loading}>
            {loading ? 'Shuffling…' : round ? 'Another round' : `Start a round of ${ROUND_SIZE}`}
          </button>
        </div>
        {failed && (
          <p className="warn-text small">Couldn't load the cards — check your connection, or reload the page, and try again.</p>
        )}
        <p className="muted small">
          {Object.keys(boxes).length} cards seen · {known} well known (box 3+)
        </p>
      </div>
    )
  }

  const card = round.cards[round.index]
  return (
    <div className="flash-page">
      <div className="flash-top">
        <button className="btn btn-ghost btn-sm" onClick={() => setRound(null)}>
          ← End round
        </button>
        <span className="mono small muted">
          {round.index + 1} / {round.cards.length}
        </span>
      </div>
      <div className="progress-bar flash-progress">
        <div style={{ width: `${(round.index / round.cards.length) * 100}%` }} />
      </div>

      <div className={`flash-card${round.flipped ? ' flipped' : ''}`}>
        <div className="flash-kind">
          <span className="mode-chip">{card.kind}</span>
          <span className="muted small">
            {categoryBySlug.get(card.problem.category)?.label} · box {boxes[card.id] ?? 0}
          </span>
        </div>
        <div className="flash-front">
          <Markdown>{card.front}</Markdown>
        </div>
        {round.flipped ? (
          <>
            <div className="flash-back">
              <Markdown>{card.back}</Markdown>
            </div>
            <div className="flash-actions">
              <button className="btn" onClick={() => grade(false)}>
                Again
              </button>
              <button className="btn btn-primary" onClick={() => grade(true)}>
                Good
              </button>
            </div>
            <Link className="small" to={`/${card.problem.category}/${card.problem.id}`}>
              Open problem: {card.problem.title} →
            </Link>
          </>
        ) : (
          <button className="btn btn-primary flash-flip" onClick={() => setRound({ ...round, flipped: true })}>
            Show answer
          </button>
        )}
      </div>
    </div>
  )
}
