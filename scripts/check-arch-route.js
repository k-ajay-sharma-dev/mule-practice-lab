// Checks the lines of the architecture diagrams (src/arch/route.js) on every reference diagram, laid out the way the
// designer lays them out, on canvases from phone size to wide:
// 1. Every connection gets a route, made of right angles, that starts and ends on its two boxes.
// 2. No line runs through a box.
// 3. No two lines lie on top of each other.
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LANES, NODE_TYPES } from '../src/arch/catalog.js'
import { gutterFor, lanePadFor, roundedPath, routeEdges } from '../src/arch/route.js'

// the sizes in styles.css: the usual layout, and the compact one for a canvas of 640px or less
const WIDE = { w: 196, h: 56, gapX: 44, gapY: 48, label: 128, gutter: (g) => g, blank: 26 }
const COMPACT = { w: 154, h: 62, gapX: 28, gapY: 48, top: 40, bottom: 26, label: 0, gutter: (g) => Math.max(14, g - 10), blank: 26 }
const GAP = 6
const EDGE = 11

function layout(diagram, canvas) {
  const pad = lanePadFor(diagram.edges.length)
  const s = canvas <= 640 ? COMPACT : { ...WIDE, w: canvas >= 1000 ? 232 : WIDE.w, top: pad, bottom: pad }
  const full = gutterFor(diagram.edges.length)
  const gutter = s.gutter(full)
  // a crowded diagram keeps two boxes in a row and scrolls sideways instead
  const available = canvas - 2 * EDGE - s.label
  const width = full > 48 ? Math.max(available, 2 * s.w + s.gapX + 2 * full) : available
  const boxes = {}
  let y = EDGE
  for (const lane of LANES) {
    const nodes = diagram.nodes.filter((n) => NODE_TYPES[n.type].lane === lane.key)
    if (!nodes.length) {
      y += s.blank + GAP
      continue
    }
    const inner = width - 2 * gutter
    const perRow = Math.max(1, Math.floor((inner + s.gapX) / (s.w + s.gapX)))
    const rows = Math.ceil(nodes.length / perRow)
    const tall = s.h + 16
    for (let r = 0; r < rows; r++) {
      const row = nodes.slice(r * perRow, (r + 1) * perRow)
      const used = row.length * s.w + (row.length - 1) * s.gapX
      row.forEach((n, k) => {
        const h = s.h + (n.config ? 16 : 0)
        boxes[n.id] = { x: EDGE + s.label + gutter + (inner - used) / 2 + k * (s.w + s.gapX), y: y + s.top + r * (tall + s.gapY) + (tall - h) / 2, w: s.w, h }
      })
    }
    y += s.top + s.bottom + rows * tall + (rows - 1) * s.gapY + GAP
  }
  return { boxes, bounds: { x0: EDGE + s.label, x1: EDGE * 2 + s.label + width, y0: 0, y1: y + EDGE } }
}

const segments = (pts) => pts.slice(1).map((p, i) => [pts[i], p])
// the length two segments share when they lie on the same line
function shared([a, b], [c, d]) {
  for (const axis of [0, 1]) {
    const o = 1 - axis
    if (Math.abs(a[o] - b[o]) < 0.6 && Math.abs(c[o] - d[o]) < 0.6 && Math.abs(a[o] - c[o]) < 2) {
      return Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) - Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]))
    }
  }
  return 0
}

const onSide = (p, b) => {
  const inX = p[0] >= b.x - 0.6 && p[0] <= b.x + b.w + 0.6
  const inY = p[1] >= b.y - 0.6 && p[1] <= b.y + b.h + 0.6
  return inX && inY && (Math.abs(p[0] - b.x) < 0.6 || Math.abs(p[0] - b.x - b.w) < 0.6 || Math.abs(p[1] - b.y) < 0.6 || Math.abs(p[1] - b.y - b.h) < 0.6)
}

const failures = []
const only = process.argv.slice(2)
let diagrams = 0
let lines = 0
let turns = 0
let slowest = { ms: 0 }
for (const dir of ['architecture', 'use-cases', 'case-studies']) {
  const path = resolve('src/content', dir)
  for (const file of readdirSync(path).filter((f) => f.endsWith('.js')).sort()) {
    const id = file.replace(/\.js$/, '')
    if (only.length && !only.includes(id)) continue
    const reference = (await import(pathToFileURL(join(path, file)).href)).default.diagram?.reference
    if (!reference) continue
    diagrams++
    for (const width of [340, 420, 560, 700, 880, 1150, 1500]) {
      const { boxes, bounds } = layout(reference, width)
      const t0 = performance.now()
      const routes = routeEdges(boxes, reference.edges, bounds)
      const ms = performance.now() - t0
      if (ms > slowest.ms) slowest = { ms, id, width, edges: reference.edges.length }
      const at = `${id} at ${width}`
      for (const e of reference.edges) {
        const pts = routes[e.id]
        if (!pts) {
          failures.push(`${at}: ${e.from} to ${e.to} has no route`)
          continue
        }
        lines++
        turns += pts.length - 2
        if (!onSide(pts[0], boxes[e.from]) || !onSide(pts.at(-1), boxes[e.to])) failures.push(`${at}: ${e.from} to ${e.to} does not start and end on its boxes`)
        if (/NaN|undefined/.test(roundedPath(pts))) failures.push(`${at}: ${e.from} to ${e.to} has a broken path`)
        for (const [a, b] of segments(pts)) {
          if (Math.abs(a[0] - b[0]) > 0.6 && Math.abs(a[1] - b[1]) > 0.6) failures.push(`${at}: ${e.from} to ${e.to} has a slanted part`)
          for (const [nid, box] of Object.entries(boxes)) {
            const hit = Math.max(a[0], b[0]) > box.x + 1 && Math.min(a[0], b[0]) < box.x + box.w - 1 && Math.max(a[1], b[1]) > box.y + 1 && Math.min(a[1], b[1]) < box.y + box.h - 1
            if (hit) failures.push(`${at}: ${e.from} to ${e.to} runs through ${nid}`)
          }
        }
      }
      const drawn = reference.edges.filter((e) => routes[e.id])
      drawn.forEach((e, i) => {
        for (const f of drawn.slice(i + 1)) {
          for (const s of segments(routes[e.id])) {
            for (const t of segments(routes[f.id])) {
              if (shared(s, t) > 1) failures.push(`${at}: ${e.from} to ${e.to} and ${f.from} to ${f.to} lie on top of each other`)
            }
          }
        }
      })
    }
  }
}

if (failures.length) {
  console.log(`${failures.length} line problem(s):`)
  for (const f of failures.slice(0, 40)) console.log(`  ${f}`)
  process.exitCode = 1
} else {
  console.log(`All diagram lines are clean (${diagrams} diagrams, ${lines} lines, ${(turns / lines).toFixed(2)} turns per line).`)
}
console.log(`Slowest: ${slowest.id} at ${slowest.width}, ${slowest.edges} lines, ${Math.round(slowest.ms)} ms`)
