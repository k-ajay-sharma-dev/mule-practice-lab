import { scheduleReview, updateEntry } from './progress.js'

// Self-rating after comparing with the reference: Partial (attempted) also schedules a review;
// Revisit is scheduled by the store itself.
export function rate(id, status) {
  updateEntry(id, { status }, { graded: true })
  if (status === 'attempted') scheduleReview(id)
}
