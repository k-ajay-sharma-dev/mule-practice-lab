// Deleting a past exam or interview round. Plain functions with no page or storage code, so scripts/check-history.js
// can test them.
//
// A round puts the problems you missed on the review schedule. Deleting the round takes those reviews back, but only
// the ones it added: a review added on another day came from somewhere else, and a problem another kept round also
// missed keeps its review.

const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA') // the same day key the review store uses

// The problems each kind of round sent to review.
export const MISSED = {
  // older exam results don't store whether a question was answered, and then a wrong one counts as missed
  exam: (h) => h.results.filter((r) => !r.ok && r.answered !== false).map((r) => r.id),
  mock: (h) => h.results.filter((r) => !r.solved).map((r) => r.id),
  // older practice rounds don't store which questions were missed, so they have no reviews to take back
  interview: (h) => (Array.isArray(h.missedIds) ? h.missedIds : []),
}

export function reviewsToRemove(removed, kept, review, missed) {
  const stillMissed = new Set(kept.flatMap(missed))
  const ids = new Set()
  for (const h of removed) {
    const day = dayOf(h.date)
    for (const id of missed(h)) {
      if (review[id]?.added === day && !stillMissed.has(id)) ids.add(id)
    }
  }
  return [...ids]
}

// Splits a history into the rounds to delete and the rounds to keep. Rounds are told apart by their date.
export function splitHistory(history, dates) {
  const gone = new Set(dates)
  return { removed: history.filter((h) => gone.has(h.date)), kept: history.filter((h) => !gone.has(h.date)) }
}
