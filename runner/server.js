// DataWeave runner: a tiny HTTP service that executes scripts with the DataWeave CLI.
//
//   GET  /health  → { ok, version }
//   POST /run     { script, inputs: [{ name, mime, content }] }
//               → { ok: true, output, mime, durationMs } | { ok: false, error, durationMs }
//
// Config (environment variables):
//   PORT             default 8787
//   DW_PATH          path to the dw binary (default: runner/bin/dw/bin/dw[.exe], then "dw" on PATH)
//   RUNNER_KEY       if set, requests must send header "X-Runner-Key: <value>"
//   ALLOWED_ORIGINS  comma-separated CORS origins (default: localhost dev + *.github.io)
//   RUN_TIMEOUT_MS   default 10000
//   MAX_CONCURRENT   default 2
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)
const RUNNER_KEY = process.env.RUNNER_KEY || ''
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS || 10000)
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2)
const MAX_BODY_BYTES = 1024 * 1024
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const DW_PATH = resolveDw()

function resolveDw() {
  if (process.env.DW_PATH) return process.env.DW_PATH
  const local = join(here, 'bin', 'dw', 'bin', process.platform === 'win32' ? 'dw.exe' : 'dw')
  return existsSync(local) ? local : 'dw'
}

function isAllowedOrigin(origin) {
  if (!origin) return false
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.includes(origin)
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || /^https:\/\/[\w-]+\.github\.io$/.test(origin)
}

const EXT_BY_MIME = [
  ['json', '.json'],
  ['xml', '.xml'],
  ['csv', '.csv'],
  ['yaml', '.yaml'],
  ['x-www-form-urlencoded', '.urlencoded'],
]

function extFor(mime = '') {
  return EXT_BY_MIME.find(([k]) => mime.includes(k))?.[1] ?? '.txt'
}

// ---- Concurrency gate (keeps a 1 GB VM from running too many dw processes at once) ----
let active = 0
const waiting = []
async function withSlot(fn) {
  if (active >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

function exec(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(DW_PATH, args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, RUN_TIMEOUT_MS)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: `Could not start the DataWeave CLI (${DW_PATH}): ${err.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

// Drop ANSI colours, JVM warnings and "[ERROR]" prefixes so the message reads cleanly.
function cleanError(text) {
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('WARNING:'))
    .map((l) => l.replace(/^\[ERROR\]\s?/, ''))
    .filter((l) => l !== 'Error while executing the script:')
    .join('\n')
    .trim()
}

function outputMime(script) {
  const m = /^\s*output\s+([\w.+-]+\/[\w.+-]+)/m.exec(script)
  return m ? m[1] : 'application/json'
}

const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

async function runScript({ script, inputs = [] }) {
  if (typeof script !== 'string' || !script.trim()) return { ok: false, error: 'Script is empty.' }
  if (!Array.isArray(inputs)) return { ok: false, error: 'inputs must be an array.' }
  for (const inp of inputs) {
    if (!VALID_NAME.test(inp?.name || '')) return { ok: false, error: `Invalid input name: ${inp?.name}` }
  }

  const dir = await mkdtemp(join(tmpdir(), 'dwrun-'))
  const started = Date.now()
  try {
    const args = ['run', '--untrusted', '-s']
    for (const inp of inputs) {
      const file = join(dir, `${inp.name}${extFor(inp.mime)}`)
      await writeFile(file, String(inp.content ?? ''), 'utf8')
      args.push('-i', `${inp.name}=${file}`)
    }
    const scriptFile = join(dir, 'main.dwl')
    await writeFile(scriptFile, script, 'utf8')
    args.push('-f', scriptFile)

    const r = await withSlot(() => exec(args, dir))
    const durationMs = Date.now() - started
    if (r.timedOut) return { ok: false, error: `Timed out after ${RUN_TIMEOUT_MS / 1000}s.`, durationMs }
    if (r.code !== 0) return { ok: false, error: cleanError(r.stderr || r.stdout) || 'Script failed.', durationMs }
    return { ok: true, output: r.stdout.replace(/\r\n/g, '\n').trimEnd(), mime: outputMime(script), durationMs }
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

let cachedVersion
async function dwVersion() {
  if (cachedVersion === undefined) {
    const r = await exec(['--version'], tmpdir())
    // CLI prints e.g. "Runtime : V2.12.2" as its last line.
    cachedVersion =
      r.code === 0 ? cleanError(r.stdout).split('\n').pop().replace(/^Runtime\s*:\s*V?/i, 'DataWeave ') : null
  }
  return cachedVersion
}

// ---- HTTP ----
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Runner-Key')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    // Chrome asks before a public site (GitHub Pages) can call a localhost server.
    if (req.headers['access-control-request-private-network']) {
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
    }
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  // Liveness probe for the host (Render health check): no key needed, reveals nothing.
  if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { ok: true })

  if (RUNNER_KEY && req.headers['x-runner-key'] !== RUNNER_KEY) {
    return send(res, 401, { ok: false, error: 'Invalid or missing runner key.' })
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { ok: true, version: await dwVersion() })
    }
    if (req.method === 'POST' && req.url === '/run') {
      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch (e) {
        return send(res, 400, { ok: false, error: `Bad request: ${e.message}` })
      }
      return send(res, 200, await runScript(body))
    }
    send(res, 404, { ok: false, error: 'Not found' })
  } catch (e) {
    send(res, 500, { ok: false, error: e.message })
  }
})

// Render stops the container with SIGTERM when it sleeps or redeploys; exit promptly instead of waiting to be killed.
process.on('SIGTERM', () => server.close(() => process.exit(0)))

server.listen(PORT, () => {
  console.log(`DataWeave runner on http://localhost:${PORT}  (dw: ${DW_PATH})`)
  if (RUNNER_KEY) console.log('Runner key required.')
})
