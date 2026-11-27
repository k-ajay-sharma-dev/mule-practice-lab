// The guided lab files-large-oom. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { defaultSystems, putFile } from '../platform-systems.js'
import { FILE, FLOW, HOST, piecewise, settingsOf, SIZE, streams } from './files-large-oom.pkg.js'

const NAME = 'pos-sales-nightly'
const PROPS = { 'sftp.host': HOST, 'sftp.user': 'mule_stock', 'stream.strategy': 'repeatable-in-memory', 'stream.maxBufferMb': '3072', 'dw.script': 'group-all', 'process.mode': 'transform', 'batch.blockSize': '100' }
const SAMPLE = 'store,till,sold_at,sku,qty,amount\n014,3,2026-11-02T09:14:02Z,H-100,2,19.80\n014,3,2026-11-02T09:14:40Z,H-300,1,4.25\n021,1,2026-11-02T09:15:11Z,H-200,6,58.20\n'

const nightly = (s) => app(s, NAME)
const running = (s) => nightly(s)?.status === 'Running'
const set = (s) => settingsOf({ ...nightly(s)?.props, ...nightly(s)?.secrets })
const last = (s) => nightly(s)?.store?.last
const small = (s) => (nightly(s)?.vCores ?? 9) <= 0.5
const archived = (s) => Boolean(s.systems?.servers?.[HOST]?.files?.[FILE.replace('/in/', '/archive/')])

const lab = {
  id: 'p-files-large-oom',
  group: 'Files, SFTP and batch',
  title: 'A 2 GB file takes the replica down every night',
  minutes: 20,
  scenario:
    'pos-sales-nightly reads the sales file of every till of Brightmart Outfitters from /in on sftp.brightmart.lab at 02:00 and writes it as JSON for the data warehouse. Since the stores started to send every sale line, the file is 2 GB. Last night the replica restarted during the run and the warehouse has no sales for 2 November. The app runs on 0.5 vCores and the budget stays there.',
  start() {
    let s = newPlatform({
      clock: at(0, 12),
      apps: [newApp(NAME, { vCores: 0.5, props: { ...PROPS }, secrets: { 'sftp.password': 'lab' } })],
      systems: defaultSystems(at(1, 9)),
      mail: [
        {
          t: at(1, 7, 50),
          to: OPS,
          subject: 'No sales in the warehouse for 2 November',
          body: 'The morning sales report is empty for every store. The file from the tills was on the SFTP server at 01:40 as usual. We need the numbers before the 11:00 meeting.',
          source: 'Brightmart Outfitters Finance',
        },
      ],
    })
    s = putFile(s, HOST, FILE, SAMPLE, { size: SIZE, owner: 'pos' })
    return until(s, at(1, 9))
  },
  steps: [
    {
      ...sawLogs(NAME),
      how: `Runtime Manager, Applications, ${NAME}, Logs. Find the run of 02:00, the line about G1 Old Gen and the FATAL line after it.`,
    },
    {
      title: 'Look at the file on the server',
      how: `Open SFTP and FTP from the menu, connect to ${HOST} as mule_stock with the password lab and open /in. Compare the size of ${FILE.slice(4)} with the heap of a 0.5 vCore replica, which is 1.3 GB in the lab.`,
      done: (s) => Boolean(s.seen[`sftp:${HOST}`]),
    },
    ask(
      'Why the heap filled up',
      'The SFTP Read uses <repeatable-in-memory-stream maxBufferSize="3072" bufferUnit="MB"/>. What does that do with a 2 GB file?',
      [
        'It reads 512 KB at a time and drops what was read',
        'It keeps every byte it reads in the heap, so the payload can be read again. Somebody raised maxBufferSize to 3 GB, so the limit that would have failed fast with MULE:STREAM_MAXIMUM_SIZE_EXCEEDED never came, and the heap ran out first',
        'It writes the file to disk and keeps only a pointer in memory',
        'It reads the file twice',
      ],
      1,
      'A repeatable in-memory stream buffers the whole content in the heap. Its maxBufferSize is the guard: past it the read fails with MULE:STREAM_MAXIMUM_SIZE_EXCEEDED instead of taking the replica down. A 2 GB buffer in a 1.3 GB heap cannot work at any limit.',
    ),
    {
      title: 'Stream the read through the disk',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set stream.strategy to repeatable-file-store and Apply Changes. That is <repeatable-file-store-stream>: it keeps 512 KB in memory and writes the rest to a temporary file, so the payload can still be read more than once. Then Schedules, ${FLOW}, Run, and read the log of the run.`,
      done: (s) => Boolean(nightly(s)?.store?.streamRun),
    },
    ask(
      'Still out of memory',
      'The read now streams, and the replica still ran out of heap. The stack names ArrayValue.groupBy. Why?',
      [
        'The file store stream does not work on SFTP',
        'The temporary file is on the heap',
        'The Transform does payload groupBy $.store. To build the groups it needs every sale of the file at the same time, as objects that are larger than the text. A stream helps only when every step after it also reads it in pieces',
        'The replica needs a restart after the change',
      ],
      2,
      'groupBy, orderBy, distinctBy and sizeOf of the whole payload all need every record before they give a result, so DataWeave pulls the full stream into memory. A map over each record can stream: the reader property streaming=true reads the CSV in order, and the writer property deferred=true passes the output on while it is written.',
    ),
    {
      title: 'Let the rest of the flow stream too',
      how: 'The warehouse sorts the sales itself, so the grouping is not needed. Set dw.script to per-record: input payload application/csv streaming=true, output application/json deferred=true and a payload map. Or set process.mode to batch with batch.blockSize 100: the Batch Job loads the records into its queues on disk and each thread holds one block of records. Keep stream.strategy at a streaming value and Apply Changes.',
      done: (s) => running(s) && streams(set(s)) && piecewise(set(s)),
    },
    ask(
      'When non-repeatable fits',
      'A colleague prefers stream.strategy non-repeatable, the <non-repeatable-stream/> strategy. When is it the right choice?',
      [
        'Always, it is the fastest',
        'When the flow reads the payload once, in one direction. It buffers nothing, so a second reader, such as a Logger of the payload or a second Transform, finds the stream already consumed',
        'Only for files under 1 MB',
        'When the file is read by several flows at the same time',
      ],
      1,
      'non-repeatable-stream has no buffer at all, which saves the disk and the copy. It fits a flow that reads the content once from start to end. The repeatable file store stream costs a temporary file and is safe when any later step reads the payload again.',
    ),
    ask(
      'More vCores',
      'Before you came, someone tried 4 vCores with the old settings and the run passed at 72 percent heap. Why not keep that?',
      [
        'It is the right fix, memory problems need memory',
        'It works for now at 8 times the cost, and the limit only moves: the in-memory read and the groupBy still need about 2.5 times the size of the file, so a larger file or a busy sale day fails again',
        'Larger replicas cannot run scheduled flows',
        'A replica of 4 vCores has less heap than one of 0.5',
      ],
      1,
      'A larger replica is a fair first aid when the business is waiting, and you state it as such. The fix is to stop holding the file in memory. With a streamed read and a streamed transform the heap needed stays the same for 2 GB or 20 GB, and the job fits 0.5 vCores.',
    ),
    {
      title: 'Load the sales at 0.5 vCores',
      how: `Schedules, ${FLOW}, Run, at 0.5 vCores or less. The log shows the lines written to /out, the file moved to /archive on ${HOST}, and a heap that stays low. Check /archive in SFTP and FTP.`,
      done: (s) => {
        const x = last(s)
        return running(s) && small(s) && Boolean(x?.ok) && streams(x) && piecewise(x) && x.vCores <= 0.5 && x.heap < 80 && archived(s)
      },
    },
  ],
  why: 'A large file must never be held in the heap as a whole. Mule streams the content of a file read, and the streaming strategy decides where the part already read is kept: repeatable-in-memory-stream keeps it all in the heap up to maxBufferSize, repeatable-file-store-stream keeps 512 KB in memory and the rest in a temporary file, and non-repeatable-stream keeps nothing and can be read once. Streaming only helps when every later step reads in pieces too: a DataWeave map with streaming=true and deferred=true, a For Each with a batch size, or a Batch Job with a small block size. groupBy, orderBy and sizeOf of the whole payload pull everything into memory. A larger replica moves the limit and costs more each month. The heap need, the run times and the replica heap of each size are lab values.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/streaming-about',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), `sftp:${HOST}`)
    const props = () => nightly(s).props
    s = runNow(change(s, NAME, { props: { ...props(), 'stream.strategy': 'repeatable-file-store' } }), NAME, FLOW)
    s = change(s, NAME, { props: { ...props(), 'dw.script': 'per-record' } })
    return runNow(s, NAME, FLOW)
  },
  answers: { 2: 1, 4: 2, 6: 1, 7: 1 },
}

export const LABS = [lab]
