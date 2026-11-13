// A first solve tells the celebration layer (components/Celebration.jsx) what was solved. The layer celebrates only
// when the points go up right after one of these, so progress that arrives from the account (another device) never
// sets off a celebration by itself. Kept apart from store/points.js so the stores can call it without an import cycle.
let pending = null

export function noteSolve(label) {
  pending = { label, at: Date.now() }
}

export function takeSolve() {
  const p = pending
  pending = null
  return p && Date.now() - p.at < 4000 ? p : null
}
