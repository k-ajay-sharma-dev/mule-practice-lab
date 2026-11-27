// The sample applications of the end to end lab of Azure Blob Storage. Imports only platform-log.js, so the engine can
// load it without a cycle. PKG stands for the flows the team builds in Studio on the Invoice Documents System API.
// READER is the app of the finance team that reads what PKG writes.
import { info, line, needs, warn } from '../platform-log.js'

export const PKG = 'invoice-docs-sapi'
export const READER = 'ledgerline-invoice-reader'
export const RETRY = 'invoice-retry-flow'
export const READ_FLOW = 'ledgerline-manifest-poll'
export const MANIFEST_HEADER = 'invoice_id,customer_id,amount,currency,issued_at,blob'
const json = (x) => JSON.stringify(x)
const blobOf = (inv) => `invoices/${inv.issuedAt.replace(/-/g, '/')}/${inv.invoiceId}.pdf`
const manifestOf = (inv) => `manifests/${inv.issuedAt}.csv`
// What the DataWeave mapping writes to the manifest for one invoice
export const manifestLine = (inv) => `${inv.invoiceId},${inv.customerId},${Number(inv.amount).toFixed(2)},${inv.currency},${inv.issuedAt},${blobOf(inv)}`
export { blobOf, manifestOf }

export function cidOf(seed) {
  let h = 2166136261
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return `${h.toString(16).padStart(8, '0')}-c7a1-11f1`
}

// The checks of the APIkit router and the flow. A PDF in base64 starts with JVBER (%PDF).
export function invoiceProblem(inv) {
  if (!inv || typeof inv !== 'object') return 'the body is not a JSON object'
  if (!/^INV-\d{2}-\d{4}$/.test(String(inv.invoiceId ?? ''))) return `invoiceId '${inv.invoiceId ?? ''}' is not like INV-26-1001`
  if (!String(inv.customerId ?? '').trim()) return 'customerId is missing'
  if (!(typeof inv.amount === 'number' && inv.amount > 0)) return 'amount must be a number above 0'
  if (!/^[A-Z]{3}$/.test(String(inv.currency ?? ''))) return 'currency must be a code such as EUR'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(inv.issuedAt ?? ''))) return 'issuedAt must be a date such as 2026-11-03'
  if (!/^JVBER/.test(String(inv.pdf ?? ''))) return 'pdf is not a PDF in base64'
  return null
}

const filesOf = (ctx) => ctx.systems.files(`blob:${String(ctx.props['blob.account'] ?? '').trim()}/${String(ctx.props['blob.container'] ?? '').trim()}`, { sas: ctx.props['blob.sas'] })
// Put Blob with If-None-Match: *, then Append Block on the manifest of the day (an append blob, made on first use).
// Lab made: the size of the PDF is the size of its base64 text times 3/4, plus a page of 40 KB.
function store(ctx, inv) {
  const f = filesOf(ctx)
  const pdf = f.write(blobOf(inv), '', { mode: 'CREATE_NEW', size: 40960 + Math.floor((String(inv.pdf).length * 3) / 4) })
  if (!pdf.ok && pdf.kind !== 'already-exists') return pdf
  if (!pdf.ok) return { ok: true, duplicate: true }
  const first = f.write(manifestOf(inv), `${MANIFEST_HEADER}\n${manifestLine(inv)}\n`, { mode: 'CREATE_NEW' })
  if (first.ok) return { ok: true }
  if (first.kind !== 'already-exists') return first
  const more = f.write(manifestOf(inv), `${manifestLine(inv)}\n`, { mode: 'APPEND' })
  return more.ok ? { ok: true } : more
}
const remember = (st, entry) => {
  st.invoices = [...(st.invoices ?? []).filter((x) => x.invoiceId !== entry.invoiceId), entry].slice(-30)
}
const httpType = (e) => (e.status === 403 ? 'HTTP:FORBIDDEN' : e.status === 404 ? 'HTTP:NOT_FOUND' : e.status === 503 ? 'HTTP:SERVICE_UNAVAILABLE' : 'HTTP:CONNECTIVITY')

export const PACKAGES = {
  [PKG]: {
    layer: 'System',
    traced: true,
    note: 'Invoice Documents System API. POST /invoices takes an invoice of the billing system with its PDF, writes the PDF to the Azure Blob container blob.container as invoices/yyyy/MM/dd/<id>.pdf and adds a line to the manifest of the day, manifests/<date>.csv, with the SAS in blob.sas. An invoice that is already there answers 200 again. When the storage account cannot be reached the invoice waits in a persistent Object Store and invoice-retry-flow writes it every 5 minutes. GET /invoices/{invoiceId} shows where it is.',
    sample: { method: 'POST', path: '/invoices', body: '{"invoiceId":"INV-26-1001","customerId":"C-102","amount":342.10,"currency":"EUR","issuedAt":"2026-11-03","pdf":"JVBERi0xLjcKJcfsj6IK"}' },
    boot: needs('blob.account', 'blob.container', 'blob.sas'),
    schedules: [{ flow: RETRY, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [RETRY]: (ctx) => {
        const st = ctx.store
        const waiting = (st.invoices ?? []).filter((x) => x.status === 'waiting')
        if (!waiting.length) return { ok: true, ms: 50, log: [] }
        const log = [info(`${RETRY}: ${waiting.length} invoice${waiting.length === 1 ? '' : 's'} waiting in the Object Store`)]
        let failed = 0
        for (const x of waiting) {
          const cid = x.correlationId ?? cidOf(x.invoiceId)
          const r = store(ctx, x.invoice)
          if (!r.ok) {
            failed++
            log.push(warn(`event:${cid} ${x.invoiceId} still waits: Azure Storage answered ${r.status ?? ''} ${r.code ?? r.error}`))
            continue
          }
          log.push(info(`event:${cid} Retry wrote ${blobOf(x.invoice)} and added ${x.invoiceId} to ${manifestOf(x.invoice)}`))
          remember(st, { ...x, status: 'stored', retried: ctx.now, t: ctx.now })
        }
        return failed ? { ok: false, ms: 3000, errorType: 'HTTP:SERVICE_UNAVAILABLE', errors: failed, log, store: st } : { ok: true, ms: 800, log, store: st }
      },
    },
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const st = (ctx.app.store ??= {})
      const cfg = `${PKG}-config`
      if (req.method === 'POST' && path === '/invoices') {
        const flow = `post:\\invoices:${cfg}`
        let inv = null
        try {
          inv = JSON.parse(req.body || 'null')
        } catch {
          inv = null
        }
        const problem = invoiceProblem(inv)
        if (problem) return { status: 400, ms: 6, error: 'APIKIT:BAD_REQUEST', flow, log: [warn(`Refused an invoice: ${problem}`)], body: json({ message: problem }) }
        const cid = req.cid || cidOf(`${inv.invoiceId}/${ctx.now}`)
        const r = store(ctx, inv)
        const entry = { invoiceId: inv.invoiceId, blob: blobOf(inv), manifest: manifestOf(inv), correlationId: cid, t: ctx.now }
        if (r.ok && r.duplicate) return { status: 200, ms: 70, flow, log: [info(`${inv.invoiceId} is stored already (409 BlobAlreadyExists on Put Blob with If-None-Match: *). Answered 200, nothing written twice`)], body: json({ ...entry, status: 'stored', duplicate: true, t: undefined }) }
        if (!r.ok) {
          // the invoice is not lost: it waits in the persistent Object Store for invoice-retry-flow
          remember(st, { ...entry, status: 'waiting', problem: `${r.status ?? ''} ${r.code ?? r.error}`.trim(), invoice: inv, parked: ctx.now })
          return {
            status: 202, ms: 2100, flow, error: httpType(r),
            log: [line('ERROR', `Put Blob ${blobOf(inv)} failed: ${r.error}`), warn(`${inv.invoiceId} waits in the Object Store invoice-retry. ${RETRY} writes it when the storage account answers again`)],
            body: json({ invoiceId: inv.invoiceId, status: 'waiting', message: 'Accepted. The document is stored as soon as Azure Storage answers again.' }),
          }
        }
        remember(st, { ...entry, status: 'stored' })
        return { status: 201, ms: 140, flow, log: [info(`DataWeave mapped ${inv.invoiceId} of ${inv.customerId}, ${Number(inv.amount).toFixed(2)} ${inv.currency}, to the manifest line ${manifestLine(inv)}`), info(`Put Blob ${blobOf(inv)} and Append Block ${manifestOf(inv)}: 201 Created`)], body: json({ ...entry, status: 'stored', t: undefined }) }
      }
      const one = path.match(/^\/invoices\/([^/]+)$/)
      if (req.method === 'GET' && one) {
        const x = (st.invoices ?? []).find((y) => y.invoiceId === decodeURIComponent(one[1]))
        if (!x) return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `get:\\invoices\\(invoiceId):${cfg}`, body: json({ message: 'No such invoice' }) }
        const { invoice, t, ...rest } = x
        return { status: 200, ms: 8, flow: `get:\\invoices\\(invoiceId):${cfg}`, body: json(rest) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: `${PKG}-main`, body: json({ message: 'Resource not found' }) }
    },
  },
  [READER]: {
    note: 'The app of the finance team (Ledgerline accounts payable archive). Every 5 minutes it lists manifests/ in the container blob.container with the SAS in blob.sas, reads each new or longer manifest and downloads the PDFs it names.',
    schedules: [{ flow: READ_FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [READ_FLOW]: (ctx) => {
        const st = ctx.store
        // the warning is written once, so the log of the waiting app stays short
        if (!String(ctx.props['blob.sas'] ?? '').trim()) return st.noSas ? { ok: true, ms: 20, log: [] } : { ok: true, ms: 20, log: [warn('No SAS in blob.sas yet, so Ledgerline cannot read the container')], store: { ...st, noSas: true } }
        const f = filesOf(ctx)
        const listed = f.list('manifests')
        if (!listed.ok) return { ok: true, ms: 300, log: [warn(`Ledgerline cannot list manifests: ${listed.status ?? ''} ${listed.code ?? listed.error}`)] }
        const log = []
        const seen = st.read ?? {}
        for (const m of listed.files.filter((x) => !x.dir)) {
          if (seen[m.path]?.size === m.size) continue
          const r = f.read(m.path)
          if (!r.ok) {
            log.push(warn(`Ledgerline cannot read ${m.path}: ${r.status ?? ''} ${r.code ?? r.error}`))
            continue
          }
          const rows = String(r.content).split('\n').slice(1).filter(Boolean).map((l) => l.split(','))
          const pdfs = rows.filter((x) => f.read(x[5]).ok).length
          const total = rows.reduce((n, x) => n + Number(x[2]), 0)
          seen[m.path] = { size: m.size, invoices: rows.map((x) => x[0]), t: ctx.now }
          log.push(info(`Ledgerline read ${m.path}: ${rows.length} invoices, ${total.toFixed(2)} in total, ${pdfs} PDFs downloaded to the archive`))
        }
        st.read = seen
        return { ok: true, ms: 400, log, store: st }
      },
    },
  },
}
