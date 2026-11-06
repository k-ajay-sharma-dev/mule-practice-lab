// Rules for choosing several topics or levels at once. Nothing chosen means no limit.
export const LEVEL_OPTIONS = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
  { value: 'EXPERT', label: 'Expert' },
]
export const DEFAULT_LEVELS = ['INTERMEDIATE', 'ADVANCED', 'EXPERT']

export const fitsLevels = (levels) => (p) => levels.length === 0 || levels.includes(p.level)

// Takes one problem from each list in turn, so a small topic is not lost beside a big one. A problem in two lists counts once.
export function evenMix(lists, order = (list) => list) {
  const queues = lists.map((list) => order(list))
  const longest = Math.max(0, ...queues.map((q) => q.length))
  const seen = new Set()
  const mixed = []
  for (let i = 0; i < longest; i++) {
    for (const queue of queues) {
      const p = queue[i]
      if (p && !seen.has(p.id)) {
        seen.add(p.id)
        mixed.push(p)
      }
    }
  }
  return mixed
}

// A short name for a choice, for history lists and the closed picker.
export function choiceLabel(labels, none = 'Everything') {
  if (labels.length === 0) return none
  if (labels.length <= 2) return labels.join(', ')
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`
}
