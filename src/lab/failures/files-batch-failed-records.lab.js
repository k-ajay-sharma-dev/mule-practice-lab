// The guided lab files-batch-failed-records. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { defaultSystems, putFile } from '../platform-systems.js'
import { BAD, FILE, FLOW, HOST, limitOk, settingsOf, TOTAL } from './files-batch-failed-records.pkg.js'

const NAME = 'loyalty-members-load'
const PROPS = { 'sftp.host': HOST, 'sftp.user': 'mule_stock', 'batch.maxFailedRecords': '-1', 'batch.blockSize': '100', 'batch.failuresStep': 'none', 'batch.onComplete': 'none' }
const SAMPLE = 'memberId,name,email,store,joined\nLM-040001,Ana Ruiz,ana.ruiz@brightmart-mail.example,014,2026-10-30\nLM-040002,Tom Berg,tom.berg@brightmart-mail.example,021,2026-10-31\n'

const number = (n) => n.toLocaleString('en-US')
const loader = (s) => app(s, NAME)
const running = (s) => loader(s)?.status === 'Running'
const set = (s) => settingsOf({ ...loader(s)?.props, ...loader(s)?.secrets })
const last = (s) => loader(s)?.store?.last
const configured = (x) => Boolean(x) && limitOk(x) && x.failures === 'error-file' && x.report === 'report' && x.blockSize <= 1000
const rows = (s, path) => (s.systems?.servers?.[HOST]?.files?.[path]?.content ?? '').trim().split('\n').length - 1

const lab = {
  id: 'p-files-batch-failed-records',
  group: 'Files, SFTP and batch',
  title: 'A batch job that loses members without a word',
  minutes: 20,
  scenario:
    'loyalty-members-load is a Batch Job that loads the members of the Brightmart Outfitters loyalty card from /in/loyalty-members.csv on sftp.brightmart.lab into the CRM at 01:30. Last month the job stopped at the first bad record each night, so a developer set maxFailedRecords to -1. Since then every run is green. Now new members call the stores because their card has no points. Make every failed member visible, keep them in a file the CRM team can work from, and keep the good members loading.',
  start() {
    let s = newPlatform({
      clock: at(0, 12),
      apps: [newApp(NAME, { props: { ...PROPS }, secrets: { 'sftp.password': 'lab' } })],
      systems: defaultSystems(at(1, 9)),
      mail: [
        {
          t: at(1, 8, 20),
          to: OPS,
          subject: 'New members without points',
          body: 'For about a month, members who joined in a store tell us their card shows no points and they are not in the CRM. The stores say the sign up worked. Your load job is green every night. Can you tell us which members are missing, and why?',
          source: 'Brightmart Outfitters Loyalty Team',
        },
      ],
    })
    s = putFile(s, HOST, FILE, SAMPLE, { size: 1310720, owner: 'pos' })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of the loyalty team', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      ...sawLogs(NAME),
      how: `Runtime Manager, Applications, ${NAME}, Logs. Find the run of 01:30 and read the lines of the batch engine from Created instance to Finished execution.`,
    },
    ask(
      'Green and still losing members',
      `The Finished execution line says ${number(TOTAL)} processed, ${number(TOTAL - BAD)} successful, ${BAD} failed. Why did nobody notice?`,
      [
        'The CRM hid the errors',
        'With maxFailedRecords -1 the job goes on past every failed record, and the flow that started it ended without an error. Nothing reads the failed count, the records are kept nowhere, and the batch engine logs only the first record of each kind of error',
        'The log level is set to WARN',
        'The failed records went to a dead letter queue',
      ],
      1,
      'A failed record does not fail the flow. The batch engine counts it, logs the first one of each error on each step, and moves on. When the job ends, the records are gone and only the counts are in the result. -1 is fine, as long as something reports and keeps the failures.',
    ),
    ask(
      'Back to the default',
      'Someone suggests to set maxFailedRecords back to 0, the default. What would happen tonight?',
      [
        'The bad members would be skipped and the rest loaded',
        'The job would stop at the first failed record, row 212, in the third block. The blocks already taken finish and every later member is never processed, which is the incident of last month',
        'The job would retry each bad record',
        'Nothing changes, 0 means no limit',
      ],
      1,
      '0 allows no failed record. When the count goes over maxFailedRecords the instance stops: the blocks the threads already took finish, and the rest of the 18,400 members are never processed. A limit above 0, for example 500, lets a normal night through and still stops a file that is broken from top to bottom.',
    ),
    ask(
      'Where to catch the records',
      'Why not write the failed members to a file in On Complete?',
      [
        'On Complete runs before the steps',
        'On Complete gets a BatchJobResult with the counts and the errors of each step, not the records. The records must be caught in a Batch Step with acceptPolicy ONLY_FAILURES, which receives only the records that failed in an earlier step',
        'On Complete cannot write to SFTP',
        'On Complete runs once per block',
      ],
      1,
      'A Batch Job has three phases: Load and Dispatch puts the records into queues, Process runs each record through the steps in blocks, and On Complete runs once at the end with the totals in the payload. A record that failed skips the later steps with the default acceptPolicy NO_FAILURES and reaches a step with ONLY_FAILURES. ALL takes every record.',
    ),
    {
      title: 'Catch and report the failed members',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set batch.failuresStep to error-file: a last step collect-failures with acceptPolicy ONLY_FAILURES and a Batch Aggregator of 500 writes each failed member with its error to /error on ${HOST}. Set batch.onComplete to report: On Complete logs loaded, successful and failed records and writes a summary next to the file. Keep batch.maxFailedRecords at -1, or a limit of at least ${BAD} such as 500. Apply Changes.`,
      done: (s) => running(s) && configured(set(s)),
    },
    {
      title: 'Run it and open the error file',
      how: `Schedules, ${FLOW}, Run. Then open SFTP and FTP, connect to ${HOST} as mule_stock and look in /error. The failed file has ${BAD} members with their error, and the summary has the totals.`,
      done: (s) => {
        const x = last(s)
        return running(s) && configured(x) && !x.stopped && x.failed === BAD && Boolean(x.errorFile && x.summary) && rows(s, x.errorFile) === BAD && Boolean(s.seen[`sftp:${HOST}`])
      },
    },
    ask(
      'One failure in an aggregator',
      'upsert-crm sends 200 members at a time with a Batch Aggregator. One night the CRM refuses a whole bulk request because of one duplicate member. What happens to the other 199?',
      [
        'Only the duplicate fails',
        'The aggregator fails as a whole, so all 200 records of that group are failed records. If one bad member must not take the group down, use a bulk call that accepts the good records and answers per record',
        'The 199 are retried one at a time',
        'The job stops at once',
      ],
      1,
      'A Batch Aggregator works on the group, so its error lands on every record in it. A bulk API that accepts part of a request and answers per record lets the good members through, and you write only the bad one to the error file. A smaller aggregator size limits the damage and costs more calls.',
    ),
    ask(
      'Block size',
      'To make the job faster, someone wants blockSize 20,000. What is the cost?',
      [
        'None, larger is always faster',
        'Each thread takes a whole block into memory, so the heap holds up to 20,000 records per thread, and with 18,400 records one block takes the whole file, so one thread does all the work',
        'The block size limits the number of failed records',
        'The aggregator size must be the same as the block size',
      ],
      1,
      'The default block size is 100. Larger blocks mean fewer reads and writes of the batch queues and more heap per thread. When a block is larger than the job, the threads have nothing to share. Change it after a measurement, not before.',
    ),
  ],
  why: 'A Batch Job has a Load and Dispatch phase, a Process phase where blocks of records (100 by default) go through the steps, and an On Complete phase with the totals. maxFailedRecords decides when the job stops: 0, the default, stops at the first failed record, -1 never stops, and a number in between stops a file that is broken throughout. A record that fails does not fail the flow, and when the job ends only counts remain. So a job that may go on past failures needs two more things: a step with acceptPolicy ONLY_FAILURES that keeps each failed record and its error where people work, such as /error on the SFTP server or a blob, and an On Complete that reports successful and failed records. A Batch Aggregator fails as a whole group. The numbers of records and the bad rows are lab values.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/batch-processing-concept',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `logs:${NAME}`)
    s = change(s, NAME, { props: { ...loader(s).props, 'batch.failuresStep': 'error-file', 'batch.onComplete': 'report' } })
    s = runNow(s, NAME, FLOW)
    return mark(s, `sftp:${HOST}`)
  },
  answers: { 2: 1, 3: 1, 4: 1, 7: 1, 8: 1 },
}

export const LABS = [lab]
