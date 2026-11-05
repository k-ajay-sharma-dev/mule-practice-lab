// Compares a spoken answer with a model answer by matching words, so it needs no server. Plain functions, so
// scripts/check-answer.js can test them. It can't judge meaning: the rating always stays with the learner.

export const COVER_SHARE = 0.5 // how many of a point's words must be spoken for it to count

const STOP_WORDS = new Set(
  `a about after all also an and any are as at be because been before being but by can could did do does doing each even
  for from get gets give gives had has have how if in into is it its itself just like made make makes many may might more
  most much must need needs no not now of off on once one only or other our out over own rather same see should so some
  still such than that the their them then there these they this those through to too two under until up us use used uses
  using very via was way we were what when where whether which while who why will with within without would you your`
    .split(/\s+/),
)

// Speech gives "merge with" where the text says mergeWith, so both are split into plain words.
const words = (text) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? []

// Rough on purpose: it only has to make "retries", "retried" and "retry" meet.
const stem = (word) => word.replace(/(ing|ies|ied|ed|es|s)$/, '').replace(/e$/, '')
const root = (word) => (word.length > 4 ? stem(word) : word)

const keywords = (text) => [...new Set(words(text).filter((w) => !STOP_WORDS.has(w) && w.length > 1).map(root))]

// One point per sentence. Full stops inside "e.g." and file names don't end a sentence.
export const pointsOf = (answer) =>
  answer
    .replace(/\b(e\.g|i\.e|etc|vs)\./gi, (m) => m.replaceAll('.', ''))
    .split(/[.;!?]+(?:\s+|$)|\n+/)
    .map((s) => s.replace(/^[-*\s]+/, '').trim())
    .filter((s) => keywords(s).length)

export function checkAnswer(spoken, question, answer) {
  const heard = new Set(keywords(spoken))
  const asked = new Set(keywords(question))
  const points = pointsOf(answer).map((text) => {
    const all = keywords(text)
    // repeating the question proves nothing, unless the point has nothing else to go on
    const fresh = all.filter((w) => !asked.has(w))
    const needed = fresh.length ? fresh : all
    const found = needed.filter((w) => heard.has(w)).length
    return { text, covered: found > 0 && found / needed.length >= COVER_SHARE }
  })
  return { points, covered: points.filter((p) => p.covered).length, total: points.length }
}

export function speechProblem(error) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'Speech to text is blocked. Allow the microphone for this site, then start again.'
  if (error === 'audio-capture') return 'No microphone was found, so your answer could not be heard.'
  if (error === 'network') return "Speech to text couldn't reach its service. Check your connection, or type your answer after it is revealed."
  return null // silence and stopping on purpose are not problems
}
