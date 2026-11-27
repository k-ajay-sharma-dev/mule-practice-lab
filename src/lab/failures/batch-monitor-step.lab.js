// The guided lab batch-monitor-step. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { liveOf } from '../platform-batch.js'
import { BAD_PRICE, DUPLICATES, FLOW, JOB, limitOk, MAP_STEP, NAME, REPORT_STEP, settingsOf, TOTAL } from './batch-monitor-step.pkg.js'

const PROPS = { 'batch.maxFailedRecords': '-1', 'batch.blockSize': '100', 'batch.failuresStep': 'none', 'mapping.price': 'as-number' }
const number = (n) => n.toLocaleString('en-US')

const sync = (s) => app(s, NAME)
const running = (s) => sync(s)?.status === 'Running'
const set = (s) => settingsOf({ ...sync(s)?.props, ...sync(s)?.secrets })
const batches = (s) => sync(s)?.batches ?? []
const seen = (s, inst) => Boolean(s.seen[`batch-instance:${inst.id}`])
const errorsOf = (inst, type) => inst.steps.flatMap((x) => x.errors).filter((e) => e.type === type).reduce((n, e) => n + e.count, 0)
const configured = (x) => limitOk(x) && x.failures === 'report' && x.mapping === 'supplier-locale'
const props = (s) => sync(s).props

const lab = {
  id: 'p-batch-monitor-step',
  group: 'Files, SFTP and batch',
  title: 'A green batch job with stale prices',
  minutes: 20,
  scenario: `${NAME} runs the Batch Job ${JOB} at 02:00. It loads the nightly product file of five suppliers, ${number(TOTAL)} products, into the price table of the Harbor webshop. Every night the job ends SUCCESSFUL. The merchandising team says the prices of one supplier have not changed for days. Find the failed records in the batch view, see why they fail, keep the failures visible and fix the mapping.`,
  start() {
    const s = newPlatform({
      clock: at(0, 1),
      apps: [newApp(NAME, { props: { ...PROPS } })],
      mail: [
        {
          t: at(1, 8, 15),
          to: OPS,
          subject: 'Nordvik prices are stuck',
          body: 'Nordvik Trading sent a new price list on Sunday, and the webshop still shows the old prices of all their products. The other suppliers are fine. Your sync job says SUCCESSFUL every night. Can you check what happens to the Nordvik products?',
          source: 'Harbor Merchandising',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of the merchandising team', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Open the instance of last night',
      how: `Batch jobs from the console menu, under Runtimes. Pick ${NAME} and open the instance of 02:00 today. Read the steps and the failed records, grouped by error type.`,
      done: (s) => Boolean(s.seen[`batch:${NAME}`]) && batches(s).some((x) => errorsOf(x, 'MULE:EXPRESSION') > 0 && seen(s, x)),
    },
    ask(
      'Successful and still failing',
      `The instance is SUCCESSFUL, with ${number(BAD_PRICE + DUPLICATES)} of ${number(TOTAL)} records failed in ${MAP_STEP}. What do the error groups tell you?`,
      [
        'The webshop refused the prices, so the job should be run again',
        'Every failed record has the same error, so one bad file caused it',
        `SUCCESSFUL only means the instance finished: with maxFailedRecords -1 no number of failed records stops it. The large group is MULE:EXPRESSION on ${number(BAD_PRICE)} records, and its sample is a Nordvik product with the price "29,17". The mapping reads the price with "as Number", which does not take a comma decimal. The ${DUPLICATES} DB:QUERY_EXECUTION records are a separate problem: the same SKU twice in one file`,
        'The batch engine drops 12% of the records to keep the job fast',
      ],
      2,
      'A failed record does not fail the instance or the flow. The batch view counts failures per step and keeps the first error of each error type with its record, so one look at the groups shows how many records share a cause. The sample record is what points at the supplier and the field.',
    ),
    {
      title: 'Try maxFailedRecords 0',
      how: `A team lead wants the job to stop on errors. In Sandbox, set batch.maxFailedRecords to 0 in Runtime Manager, ${NAME}, Settings, Properties, Apply Changes. Then Schedules, ${FLOW}, Run, and open the new instance in Batch jobs. It ends FAILED_PROCESS_RECORDS after block 3, at 300 of ${number(TOTAL)} records.`,
      done: (s) => batches(s).some((x) => x.status === 'FAILED_PROCESS_RECORDS' && x.maxFailedRecords === 0 && seen(s, x)),
    },
    {
      title: 'Report the failures and fix the mapping',
      how: `Settings, Properties of ${NAME}. Set batch.maxFailedRecords back to -1, or a limit of at least ${DUPLICATES}. Set batch.failuresStep to report: a last step ${REPORT_STEP} with acceptPolicy ONLY_FAILURES keeps each failed product with its error in dbo.product_sync_rejects, and On Complete mails the counts to the catalog team. Set mapping.price to supplier-locale, which reads each price with the number format of its supplier. Apply Changes.`,
      done: (s) => running(s) && configured(set(s)),
    },
    {
      title: 'Run it again and read the monitor',
      how: `Schedules, ${FLOW}, Run. The instance is EXECUTING for some minutes, so move the clock 10 minutes and open it in Batch jobs. No MULE:EXPRESSION group is left, and ${REPORT_STEP} took the ${DUPLICATES} duplicate records.`,
      done: (s) => {
        const x = batches(s)[0]
        if (!x || !running(s) || !configured(set(s))) return false
        const live = liveOf(x, s.clock)
        const report = x.steps.find((y) => y.name === REPORT_STEP)
        return live.status === 'SUCCESSFUL' && errorsOf(x, 'MULE:EXPRESSION') === 0 && x.processed === TOTAL && report?.accept === 'ONLY_FAILURES' && report.processed === DUPLICATES && seen(s, x)
      },
    },
    ask(
      'Block size',
      'With blockSize 100 and maxFailedRecords 0 the job stopped after 300 records. What changes with blockSize 1000?',
      [
        'More records are processed before the stop, here about 1,000. A thread finishes the whole block it took, so the stop comes at the end of the block with the first failure, and blocks that other threads hold finish too. Each thread also holds more records in memory, and the job reads and writes its queues less often',
        'Nothing, the stop comes at the first failed record',
        'maxFailedRecords would count per block, so up to 1,000 failures are allowed',
        'The job would run with fewer steps',
      ],
      0,
      'Records move through the steps in blocks, 100 by default. In the lab one block is in flight at a time. A real runtime runs several blocks on parallel threads, so even more records pass before the stop. A larger block means fewer trips to the batch queues and more heap per thread, and on a stop more records are processed after the first failure. Change it after you measure, and look at the record size too.',
    ),
    ask(
      'The batch queue',
      `Where are the ${number(TOTAL)} records while the instance is EXECUTING?`,
      [
        'In the heap of the replica until On Complete',
        'In the Anypoint MQ queue of the application',
        'In the database the job writes to',
        'In persistent batch queues that the Load and Dispatch phase writes to the local disk of the runtime. A large input needs free disk space, and the history of finished instances is kept on disk too, 7 days by default',
      ],
      3,
      'Load and Dispatch reads the input and writes every record to a persistent queue before the steps start, which is why a batch job can take a file larger than the heap. The disk of the worker or replica holds that queue and the instance history, so a job with many large runs can fill it. The batch history settings shorten how long instances are kept.',
    ),
    ask(
      'One instance at a time',
      'The 02:00 instance is still EXECUTING when someone runs the flow by hand. Why can it matter that only one instance of the job runs at a time?',
      [
        'It does not matter, two instances finish twice as fast',
        'With the default scheduling strategy ORDERED_SEQUENTIAL a new instance waits until the one before it is done. Both instances write the same price rows, so running them together, as ROUND_ROBIN allows, could let an older file overwrite newer prices, and they would share the threads and the disk',
        'Mule refuses the second run with an error',
        'The second instance stops the first one',
      ],
      1,
      'A Batch Job has a schedulingStrategy. ORDERED_SEQUENTIAL, the default, runs the instances one after the other in the order they were created. ROUND_ROBIN lets several instances share the threads, which suits jobs whose records do not depend on each other. For a price table, order matters.',
    ),
  ],
  why: `The batch view of Runtime Manager shows each instance of a job with its status, the records processed, successful and failed, the counts per step and the first error of each error type with its record. SUCCESSFUL means the instance finished within maxFailedRecords, not that every record made it. Here one supplier sends prices with a comma decimal, and "as Number" fails on them, so ${number(BAD_PRICE)} products never reach the webshop. maxFailedRecords 0 does stop the job, but at the end of the block with the first failure, and every later supplier is left out too. A step with acceptPolicy ONLY_FAILURES keeps the failed records with their error, and the mapping reads each price with the format of its supplier. The number of records, the rows and the supplier are lab values.`,
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/batch-processing-concept',
  solve(start) {
    let s = mark(start, 'inbox')
    s = mark(mark(s, `batch:${NAME}`), `batch-instance:${batches(s)[0].id}`)
    s = runNow(change(s, NAME, { props: { ...props(s), 'batch.maxFailedRecords': '0' } }), NAME, FLOW)
    s = mark(s, `batch-instance:${batches(s)[0].id}`)
    s = change(s, NAME, { props: { ...props(s), 'batch.maxFailedRecords': '-1', 'batch.failuresStep': 'report', 'mapping.price': 'supplier-locale' } })
    s = advance(runNow(s, NAME, FLOW), 10 * MINUTE)
    return mark(s, `batch-instance:${batches(s)[0].id}`)
  },
  answers: { 2: 2, 6: 0, 7: 3, 8: 1 },
}

export const LABS = [lab]
