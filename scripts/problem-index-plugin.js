// Vite plugin: exposes `virtual:problem-index`, a lightweight list of every problem's metadata
// (no descriptions, solutions or exercises), so lists, search, tracks and the dashboard can render
// without downloading all content. Full problems are loaded per file on demand (see src/data/problems.js).
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const VIRTUAL_ID = 'virtual:problem-index'
const RESOLVED_ID = '\0' + VIRTUAL_ID
// The summaries are only for search, so they live in a module of their own that loads with the Search page.
const SUMMARIES_ID = 'virtual:problem-summaries'
const RESOLVED_SUMMARIES_ID = '\0' + SUMMARIES_ID

// Plain-text opening of the description, for search results.
function summaryOf(markdown = '') {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/[*_`>|#\\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 130 ? text.slice(0, 127).trimEnd() + '…' : text
}

async function buildIndex(root, strict) {
  const contentDir = resolve(root, 'src/content')
  const { exerciseOf } = await import(pathToFileURL(resolve(root, 'src/data/exercises.js')).href)
  const items = []
  for (const cat of readdirSync(contentDir)) {
    for (const file of readdirSync(join(contentDir, cat)).filter((f) => f.endsWith('.js'))) {
      const path = join(contentDir, cat, file)
      // the mtime query defeats Node's module cache so edits show up in dev
      let p
      try {
        p = (await import(`${pathToFileURL(path).href}?t=${statSync(path).mtimeMs}`)).default
      } catch (err) {
        // a file mid-edit should not take the whole dev site down; a production build must fail
        if (strict) throw new Error(`${cat}/${file}: ${err.message}`)
        console.warn(`[problem-index] skipped ${cat}/${file}: ${err.message}`)
        continue
      }
      // the app finds a problem's file from its id and category, so they must match the path
      const problem = `${cat}/${file}: id "${p?.id}", category "${p?.category}"`
      if (p?.id + '.js' !== file || p?.category !== cat || !p?.title) {
        if (strict) throw new Error(`${problem} must match the folder and file name and have a title`)
        console.warn(`[problem-index] skipped ${problem}`)
        continue
      }
      items.push({
        id: p.id,
        category: p.category,
        title: p.title,
        level: p.level,
        tags: p.tags ?? [],
        estMinutes: p.estMinutes,
        exercise: exerciseOf(p),
        summary: summaryOf(p.description),
        cards: (p.followUps?.length ?? 0) + (p.keyPoints?.length ? 1 : 0),
      })
    }
  }
  return items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

export default function problemIndex() {
  let root = process.cwd()
  let strict = true
  let built = null
  return {
    name: 'problem-index',
    configResolved(config) {
      root = config.root
      strict = config.command === 'build'
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      if (id === SUMMARIES_ID) return RESOLVED_SUMMARIES_ID
    },
    async load(id) {
      if (id !== RESOLVED_ID && id !== RESOLVED_SUMMARIES_ID) return
      // both modules come from one pass over the content, kept until a content file changes
      built ??= buildIndex(root, strict)
      const items = await built
      if (id === RESOLVED_SUMMARIES_ID) return `export default ${JSON.stringify(Object.fromEntries(items.map((p) => [p.id, p.summary])))}`
      return `export default ${JSON.stringify(items.map(({ summary, ...rest }) => rest))}`
    },
    configureServer(server) {
      const refresh = (file) => {
        if (!file.replace(/\\/g, '/').includes('/src/content/')) return
        built = null
        for (const id of [RESOLVED_ID, RESOLVED_SUMMARIES_ID]) {
          const mod = server.moduleGraph.getModuleById(id)
          if (mod) server.reloadModule(mod)
        }
      }
      server.watcher.on('change', refresh)
      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}
