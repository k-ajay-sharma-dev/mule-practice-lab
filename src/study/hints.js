// Text helpers for the hint ladder: find the line of the scenario, and the part of the model answer, that a
// requirement is about, by the words they share. Crude on purpose: it only has to point at the right place.
const STOP = new Set(
  'about above after again also and any are because been before being both but can cannot does each every for from has have how into its just more most must never not now once only other our out over same should simply some such than that the their them then there these they this those through too under until very was were what when where which while who why will with within without would your yours yourself'.split(' '),
)

const stem = (w) => w.slice(0, 5)
function words(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[`*_#>[\]()]/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem),
  )
}

function best(pieces, label) {
  const want = words(label)
  let top = null
  let topScore = 0
  for (const p of pieces) {
    const have = words(p)
    let score = 0
    for (const w of want) if (have.has(w)) score++
    // prefer the shorter of two equal matches: it is more to the point
    if (score > topScore || (score === topScore && score > 0 && p.length < top.length)) {
      top = p
      topScore = score
    }
  }
  return topScore >= 1 ? top : null
}

const clean = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').replace(/^\s*[-*]\s+/, '').replace(/\s+/g, ' ').trim()

// The scenario sentence that asks for this requirement
export function scenarioLine(description, label) {
  const plain = String(description ?? '').replace(/```[\s\S]*?```/g, ' ')
  const pieces = plain
    .split(/\n+/)
    .flatMap((line) => (/^\s*[-*]\s/.test(line) ? [line] : line.split(/(?<=[.!?])\s+/)))
    .map(clean)
    .filter((s) => s.length > 15 && !/^questions:?$/i.test(s))
  return best(pieces, label)
}

// The part of the model answer that covers it: a paragraph or bullet, never a whole diagram
export function answerPiece(solution, label) {
  const plain = String(solution ?? '').replace(/```[\s\S]*?```/g, ' ')
  const pieces = plain
    .split(/\n\s*\n|\n(?=\s*[-*]\s)/)
    .map(clean)
    .filter((s) => s.length > 20)
  return best(pieces, label)
}
