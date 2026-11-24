// Draws the lines of an architecture diagram: right-angled routes that leave and reach a box at their own point, go
// around the other boxes and keep clear of each other. Pure geometry, so scripts/check-arch-route.js can test it.

const STUB = 12 // how far a line runs straight out of a box before it may turn (longer than the arrow head)
const CLEAR = 9 // how close a line may pass to a box
const TRACK = 8 // distance between two lines that run side by side
const PORT_GAP = 24 // distance between two lines on the same side of a box
const SNAP = 6 // line ends sit on multiples of this, so two ends are either in line or clearly apart
const COST = { bend: 28, cross: 30, touch: 45, share: 6, shareStart: 24 }

// right, down, left, up
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]
const OUT = { r: 0, b: 1, l: 2, t: 3 }
const vertical = (side) => side === 't' || side === 'b'

const midX = (b) => b.x + b.w / 2
const midY = (b) => b.y + b.h / 2

// Which side of each box a line uses: down or up between rows, sideways between neighbours in a row, and underneath
// when another box stands between the two.
function sidesFor(s, t, others) {
  if (t.y >= s.y + s.h - 2) return ['b', 't']
  if (t.y + t.h <= s.y + 2) return ['t', 'b']
  const [left, right] = s.x < t.x ? [s, t] : [t, s]
  const between = others.some((o) => o !== s && o !== t && o.x + o.w > left.x + left.w && o.x < right.x && o.y < right.y + right.h && o.y + o.h > right.y)
  if (between) return ['b', 'b']
  return s === left ? ['r', 'l'] : ['l', 'r']
}

// The free space beside the boxes of a row, for the lines that go around them: more for a diagram with many lines.
export const gutterFor = (edgeCount) => (edgeCount > 14 ? 80 : edgeCount > 8 ? 48 : 28)

// A point on a side for every line end, spread out and ordered by where the other end is, so lines do not cross at
// the box.
function placePorts(routes) {
  const groups = new Map()
  for (const r of routes) {
    for (const end of ['a', 'b']) {
      const p = r[end]
      const key = `${p.id}|${p.side}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({ r, p, other: end === 'a' ? r.b : r.a })
    }
  }
  for (const list of groups.values()) {
    const { box, side } = list[0].p
    const v = vertical(side)
    const at = (o) => (v ? midX(o.box) : midY(o.box))
    list.sort((m, n) => at(m.other) - at(n.other) || m.r.order - n.r.order)
    const room = (v ? box.w : box.h) - 28
    const step = list.length > 1 ? Math.min(PORT_GAP, Math.max(4, room / (list.length - 1))) : 0
    list.forEach(({ p }, i) => {
      p.pos = (v ? midX(box) : midY(box)) + (i - (list.length - 1) / 2) * step
      p.alone = list.length === 1
    })
  }
  // a line that can run straight does: the end that has its side to itself moves to face the other end
  for (const { a, b } of routes) {
    if (vertical(a.side) !== vertical(b.side) || a.side === b.side || Math.abs(a.pos - b.pos) < 0.5) continue
    const v = vertical(a.side)
    const fits = (p, pos) => {
      const from = v ? p.box.x : p.box.y
      const size = v ? p.box.w : p.box.h
      return pos >= from + 14 && pos <= from + size - 14
    }
    if (b.alone && fits(b, a.pos)) b.pos = a.pos
    else if (a.alone && fits(a, b.pos)) a.pos = b.pos
  }
  for (const r of routes) for (const p of [r.a, r.b]) {
    const { box, side } = p
    const pos = Math.round(p.pos / SNAP) * SNAP
    p.x = side === 'l' ? box.x : side === 'r' ? box.x + box.w : pos
    p.y = side === 't' ? box.y : side === 'b' ? box.y + box.h : pos
    const d = OUT[side]
    p.sx = p.x + DX[d] * STUB
    p.sy = p.y + DY[d] * STUB
  }
}

// Tracks inside a free stretch, evenly placed and at most `max` of them.
function tracks(from, to, max = 7) {
  const room = to - from
  if (room < 2) return []
  const n = Math.max(1, Math.min(max, Math.floor(room / TRACK) + 1))
  const step = n > 1 ? Math.min(TRACK, room / (n - 1)) : 0
  const start = (from + to) / 2 - ((n - 1) * step) / 2
  return Array.from({ length: n }, (_, i) => start + i * step)
}

function freeStretches(intervals, from, to) {
  const out = []
  let at = from
  for (const [a, b] of [...intervals].sort((m, n) => m[0] - n[0])) {
    if (a > at) out.push([at, a])
    at = Math.max(at, b)
  }
  if (to > at) out.push([at, to])
  return out
}

const distinct = (values) => {
  const sorted = values.sort((m, n) => m - n)
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > 0.4)
}

// Grid lines. Where a line meets a box its position must be exact; the turning points just outside a box may move a
// little to share a grid line, and tracks too near another grid line are left out.
function gridLines(exact, stubs, extra) {
  const lines = distinct([...exact])
  for (const v of [...stubs, ...extra]) if (!lines.some((m) => Math.abs(m - v) < 3)) lines.push(v)
  return distinct(lines)
}

function buildGrid(boxes, routes, bounds) {
  const ends = routes.flatMap((r) => [r.a, r.b])
  const rows = freeStretches(boxes.map((b) => [b.y, b.y + b.h]), bounds.y0, bounds.y1)
  const extraY = rows.flatMap(([a, b]) => tracks(a === bounds.y0 ? a + 2 : a + STUB, b === bounds.y1 ? b - 2 : b - STUB))
  const extraX = []
  for (const b of boxes) {
    const row = boxes.filter((o) => o.y < b.y + b.h && o.y + o.h > b.y)
    for (const [f, t] of freeStretches(row.map((o) => [o.x, o.x + o.w]), bounds.x0, bounds.x1)) {
      const left = f === bounds.x0
      const right = t === bounds.x1
      extraX.push(...tracks(left ? Math.max(f + 2, t - STUB - 5 * TRACK) : f + STUB, right ? Math.min(t - 2, f + STUB + 5 * TRACK) : t - STUB, 6))
    }
  }
  const up = ends.filter((p) => vertical(p.side))
  const across = ends.filter((p) => !vertical(p.side))
  const xs = gridLines(up.map((p) => p.sx), across.map((p) => p.sx), extraX)
  const ys = gridLines(across.map((p) => p.sy), up.map((p) => p.sy), extraY)
  const W = xs.length
  const H = ys.length
  // blocked[0]: the step to the right of a grid point; blocked[1]: the step down
  const blocked = [new Uint8Array(W * H), new Uint8Array(W * H)]
  const c = CLEAR - 0.5
  for (const b of boxes) {
    const [x0, x1, y0, y1] = [b.x - c, b.x + b.w + c, b.y - c, b.y + b.h + c]
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i
        if (i + 1 < W && ys[j] > y0 && ys[j] < y1 && xs[i] < x1 && xs[i + 1] > x0) blocked[0][k] = 1
        if (j + 1 < H && xs[i] > x0 && xs[i] < x1 && ys[j] < y1 && ys[j + 1] > y0) blocked[1][k] = 1
      }
    }
  }
  const index = (list, v) => list.reduce((best, m, i) => (Math.abs(m - v) < Math.abs(list[best] - v) ? i : best), 0)
  for (const p of ends) {
    p.i = index(xs, p.sx)
    p.j = index(ys, p.sy)
    p.k = p.j * W + p.i
    p.sx = xs[p.i]
    p.sy = ys[p.j]
  }
  return { xs, ys, W, H, blocked }
}

function heap() {
  const items = []
  return {
    get size() { return items.length },
    push(f, v) {
      let i = items.push([f, v]) - 1
      while (i) {
        const up = (i - 1) >> 1
        if (items[up][0] <= items[i][0]) break
        ;[items[up], items[i]] = [items[i], items[up]]
        i = up
      }
    },
    pop() {
      const top = items[0]
      const last = items.pop()
      if (items.length) {
        items[0] = last
        let i = 0
        for (;;) {
          let m = i
          for (const n of [2 * i + 1, 2 * i + 2]) if (n < items.length && items[n][0] < items[m][0]) m = n
          if (m === i) break
          ;[items[m], items[i]] = [items[i], items[m]]
          i = m
        }
      }
      return top[1]
    },
  }
}

// What the routes drawn so far occupy: steps along each axis, points passed straight, points where a line turns.
function occupancy(size) {
  return { step: [new Uint8Array(size), new Uint8Array(size)], pass: [new Uint8Array(size), new Uint8Array(size)], turn: new Uint8Array(size), end: new Uint8Array(size) }
}

function mark(occ, route, by) {
  const { path, dirs } = route
  for (let n = 0; n < path.length; n++) {
    const dirIn = dirs[n]
    const dirOut = dirs[n + 1]
    if (dirIn % 2 === dirOut % 2) occ.pass[dirIn % 2][path[n]] += by
    else occ.turn[path[n]] += by
    if (n + 1 < path.length) occ.step[dirOut % 2][Math.min(path[n], path[n + 1])] += by
  }
}

function findPath(grid, occ, a, b) {
  const { xs, ys, W, H, blocked } = grid
  const size = W * H * 4
  const best = new Float64Array(size).fill(Infinity)
  const from = new Int32Array(size).fill(-1)
  const goalDir = (OUT[b.side] + 2) % 4
  const guess = (k) => Math.abs(xs[k % W] - b.sx) + Math.abs(ys[(k / W) | 0] - b.sy)
  const open = heap()
  const start = a.k * 4 + OUT[a.side]
  best[start] = 0
  open.push(guess(a.k), start)
  while (open.size) {
    const state = open.pop()
    if (state < 0) {
      // the goal, reached with its last turn counted
      const path = []
      const dirs = [goalDir]
      for (let s = -state - 1; s >= 0; s = from[s]) {
        path.unshift(s >> 2)
        dirs.unshift(s & 3)
      }
      return { path, dirs }
    }
    const k = state >> 2
    const dir = state & 3
    const g = best[state]
    if (k === b.k && dir !== (goalDir + 2) % 4) {
      const total = g + (dir === goalDir ? 0 : COST.bend)
      open.push(total, -state - 1)
      continue
    }
    for (let d = 0; d < 4; d++) {
      if (d === (dir + 2) % 4) continue
      const i = (k % W) + DX[d]
      const j = ((k / W) | 0) + DY[d]
      if (i < 0 || j < 0 || i >= W || j >= H) continue
      const next = j * W + i
      const axis = d % 2
      const step = Math.min(k, next)
      if (blocked[axis][step]) continue
      const len = Math.abs(xs[i] - xs[k % W]) + Math.abs(ys[j] - ys[(k / W) | 0])
      let cost = len
      if (d !== dir) {
        cost += COST.bend
        if (occ.pass[0][k] || occ.pass[1][k] || occ.turn[k]) cost += COST.touch
      } else if (occ.turn[k]) cost += COST.touch
      else if (occ.pass[1 - axis][k]) cost += COST.cross
      if (occ.step[axis][step]) cost += COST.shareStart + len * COST.share
      // another line's end: passing through it would look like a connection
      if (occ.end[next] && next !== b.k) cost += COST.touch
      const s = next * 4 + d
      if (g + cost < best[s] - 1e-6) {
        best[s] = g + cost
        from[s] = state
        open.push(g + cost + guess(next), s)
      }
    }
  }
  return null
}

function pointsOf(grid, route) {
  const pts = [[route.a.x, route.a.y], ...route.path.map((k) => [grid.xs[k % grid.W], grid.ys[(k / grid.W) | 0]]), [route.b.x, route.b.y]]
  const out = []
  for (const p of pts) {
    const n = out.length
    if (n && Math.abs(out[n - 1][0] - p[0]) < 0.6 && Math.abs(out[n - 1][1] - p[1]) < 0.6) continue
    if (n > 1) {
      const [m, l] = [out[n - 2], out[n - 1]]
      if ((Math.abs(m[0] - l[0]) < 0.6 && Math.abs(l[0] - p[0]) < 0.6) || (Math.abs(m[1] - l[1]) < 0.6 && Math.abs(l[1] - p[1]) < 0.6)) out.pop()
    }
    out.push(p)
  }
  return out
}

// boxes: { [nodeId]: { x, y, w, h } }, edges: [{ id, from, to }], bounds: the area lines may use
// → { [edgeId]: [[x, y], ...] }. A line with no way through is left out, and the caller draws it directly.
export function routeEdges(boxes, edges, bounds) {
  const all = Object.values(boxes)
  const routes = edges
    .filter((e) => e.from !== e.to && boxes[e.from] && boxes[e.to])
    .map((e, order) => {
      const s = boxes[e.from]
      const t = boxes[e.to]
      const [a, b] = sidesFor(s, t, all)
      return { id: e.id, order, a: { id: e.from, box: s, side: a }, b: { id: e.to, box: t, side: b } }
    })
  if (!routes.length) return {}
  placePorts(routes)
  const grid = buildGrid(all, routes, bounds)
  const occ = occupancy(grid.W * grid.H)
  for (const r of routes) for (const p of [r.a, r.b]) occ.end[p.k] = 1
  const far = (r) => Math.abs(r.a.x - r.b.x) + Math.abs(r.a.y - r.b.y)
  const order = [...routes].sort((m, n) => far(m) - far(n) || m.order - n.order)
  // a second and third look: each line is drawn again now that the others have their place
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (const r of order) {
      const old = r.path
      if (old) mark(occ, r, -1)
      const found = findPath(grid, occ, r.a, r.b)
      if (found) {
        if (!old || found.path.join() !== old.join()) changed = true
        Object.assign(r, found)
      }
      if (r.path) mark(occ, r, 1)
    }
    if (!changed) break
  }
  return Object.fromEntries(routes.filter((r) => r.path).map((r) => [r.id, pointsOf(grid, r)]))
}

// An SVG path through the points with rounded corners.
export function roundedPath(points, radius = 8) {
  const n = (v) => Math.round(v * 10) / 10
  let d = `M${n(points[0][0])},${n(points[0][1])}`
  for (let i = 1; i < points.length - 1; i++) {
    const [p, c, q] = [points[i - 1], points[i], points[i + 1]]
    const before = Math.hypot(c[0] - p[0], c[1] - p[1])
    const after = Math.hypot(q[0] - c[0], q[1] - c[1])
    const r = Math.min(radius, before / 2, after / 2)
    const from = [c[0] + ((p[0] - c[0]) / before) * r, c[1] + ((p[1] - c[1]) / before) * r]
    const to = [c[0] + ((q[0] - c[0]) / after) * r, c[1] + ((q[1] - c[1]) / after) * r]
    d += ` L${n(from[0])},${n(from[1])} Q${n(c[0])},${n(c[1])} ${n(to[0])},${n(to[1])}`
  }
  const last = points[points.length - 1]
  return `${d} L${n(last[0])},${n(last[1])}`
}
