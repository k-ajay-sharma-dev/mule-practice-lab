import { getReview, removeReviews } from '../store/progress.js'
import { MISSED, reviewsToRemove, splitHistory } from '../study/history.js'

// Asks, then deletes the rounds with these dates and the reviews they added. Returns the rounds left, or null when
// you say no.
export function deleteRounds(kind, history, dates, question) {
  if (!confirm(`${question} Problems it put on your review list come off it too. This can't be undone.`)) return null
  const { removed, kept } = splitHistory(history, dates)
  removeReviews(reviewsToRemove(removed, kept, getReview(), MISSED[kind]))
  return kept
}

// A list of past exams or interview rounds, each with a Delete button, and Delete all above the list.
// kind picks which problems a round sent to review (see study/history.js), so deleting it takes those reviews back.
// onChange gets the rounds that are left.
export default function PastRounds({ title, noun, kind, history, shown = history, onChange, children }) {
  function remove(dates, question) {
    const kept = deleteRounds(kind, history, dates, question)
    if (kept) onChange(kept)
  }

  const all = history.length === 1 ? `the past ${noun}` : `all ${history.length} past ${noun}s`
  return (
    <>
      <div className="history-head">
        <h2 className="section-heading">{title}</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => remove(history.map((h) => h.date), `Delete ${all}?`)}>
          Delete all
        </button>
      </div>
      <ul className="mock-history">
        {shown.map((h) => (
          <li key={h.date}>
            {children(h)}
            <button
              className="btn btn-ghost btn-sm history-delete"
              onClick={() => remove([h.date], `Delete the ${noun} from ${new Date(h.date).toLocaleString()}?`)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
