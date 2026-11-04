// Vite plugin: exposes `virtual:problem-index`, a lightweight list of every problem's metadata
// (no descriptions, solutions or exercises), so lists, search, tracks and the dashboard can render
// without downloading all content. Full problems are loaded per file on demand (see src/data/problems.js).
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const VIRTUAL_ID = 'virtual:problem-index'
const RESOLVED_ID = '\0' + VIRTUAL_ID

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
  return {
    name: 'problem-index',
    configResolved(config) {
      root = config.root
      strict = config.command === 'build'
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    async load(id) {
      if (id !== RESOLVED_ID) return
      return `export default ${JSON.stringify(await buildIndex(root, strict))}`
    },
    configureServer(server) {
      const refresh = (file) => {
        if (!file.replace(/\\/g, '/').includes('/src/content/')) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.reloadModule(mod)
      }
      server.watcher.on('change', refresh)
      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}
