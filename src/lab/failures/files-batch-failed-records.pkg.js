// The sample applications of the files-batch-failed-records lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, line, muleError, needs, warn } from '../platform-log.js'

const NAME = 'loyalty-members-load'
const JOB = 'loyalty-members-load'
export const FLOW = 'loyalty-members-flow'
export const HOST = 'sftp.harbor.lab'
export const FILE = '/in/loyalty-members.csv'
export const TOTAL = 18400 // members in the nightly file
export const BAD = 37 // members with an email that cannot be valid
const AGGREGATOR = 200 // the Batch Aggregator of upsert-crm sends one bulk upsert per 200 records
const FAILURES_SIZE = 500 // the Batch Aggregator of collect-failures
const BASE = Date.UTC(2026, 10, 2) // day 0 of the lab clock
const ENGINE = 'com.mulesoft.mule.runtime.module.batch.engine.DefaultBatchEngine'
const INSTANCE = '7c2e'
const number = (n) => n.toLocaleString('en-US')
const int = (value, fallback) => (String(value ?? '').trim() !== '' && Number.isInteger(Number(value)) ? Number(value) : fallback)
const pick = (value, list, fallback) => (list.includes(String(value ?? '').trim()) ? String(value).trim() : fallback)
const dayOf = (now) => new Date(BASE + now).toISOString().slice(0, 10)
export const errorFileOf = (now) => `/error/loyalty-members-${dayOf(now)}-failed.csv`
// the rows of the bad members, the first one in the third block of 100
const ROWS = Array.from({ length: BAD }, (_, i) => 212 + i * 493)
const badMember = (row, i) => ({ row, member: `LM-${String(40000 + row).padStart(6, '0')}`, email: i % 3 === 0 ? '' : i % 3 === 1 ? `member${row}@` : `member ${row}@harbor-mail.example`, error: i % 3 === 0 ? 'email is required' : 'email is not a valid address' })

export function settingsOf(props) {
  const max = int(props['batch.maxFailedRecords'], 0)
  return {
    max: max < 0 ? -1 : max,
    blockSize: Math.max(1, int(props['batch.blockSize'], 100)),
    failures: pick(props['batch.failuresStep'], ['none', 'error-file'], 'none'),
    report: pick(props['batch.onComplete'], ['none', 'report'], 'none'),
  }
}
// the limit lets the job finish with the bad records of a normal night
export const limitOk = (set) => set.max === -1 || set.max >= BAD

export const PACKAGES = {
  [NAME]: {
    note: 'A Batch Job that loads the loyalty members of Harbor Outfitters from /in/loyalty-members.csv on sftp.harbor.lab into the CRM at 01:30. Step validate-and-map checks each member, step upsert-crm sends bulk upserts with a Batch Aggregator of 200. batch.maxFailedRecords (0 is the default, -1 has no limit) and batch.blockSize are attributes of the Batch Job. batch.failuresStep error-file adds the step collect-failures with acceptPolicy ONLY_FAILURES, which writes the failed records to /error. batch.onComplete report logs the totals in On Complete and writes a summary to /error.',
    boot: needs('sftp.host', 'sftp.user', 'sftp.password', 'batch.maxFailedRecords', 'batch.blockSize'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 30 1 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [FLOW]: ({ props, systems, now }) => {
        const set = settingsOf(props)
        const log = [info(`Starting ${FLOW}. maxFailedRecords ${set.max}, blockSize ${set.blockSize}, batch.failuresStep ${set.failures}, batch.onComplete ${set.report}`)]
        const sftp = systems.files(props['sftp.host'], { user: props['sftp.user'], password: props['sftp.password'] })
        const read = sftp.read(FILE)
        if (!read.ok) {
          const error = { flow: FLOW, file: NAME, at: 1, name: 'Read members file', dsl: '<sftp:read doc:name="Read members file" config-ref="SFTP_Config" path="/in/loyalty-members.csv">', type: read.type ?? 'SFTP:CONNECTIVITY', message: read.error }
          log.push(muleError(error))
          return { ok: false, ms: 3000, errorType: error.type, log }
        }
        log.push(
          info(`Created instance '${INSTANCE}' for batch job '${JOB}'`, ENGINE),
          info(`Starting loading phase for instance '${INSTANCE}' of job '${JOB}'`, ENGINE),
          info(`Finished loading phase for instance ${INSTANCE} of job ${JOB}. ${number(TOTAL)} records were loaded`, ENGINE),
          info(`Started execution of instance '${INSTANCE}' of job '${JOB}'`, ENGINE),
          line('ERROR', `Found error processing record on step 'validate-and-map' for job instance '${INSTANCE}' of job '${JOB}'.\nThis is the first record to show this exception on this step for this job instance. Subsequent records with the same failures will not be logged for performance and log readability reasons:\nError type            : VALIDATION:INVALID_EMAIL\nMessage               : "Member LM-040212: email is required"`, 'com.mulesoft.mule.runtime.module.batch.internal.engine.threading.BatchRecordWork'),
        )

        // a limit the failures pass stops the instance: the blocks already taken finish, the rest is never processed
        const stopped = set.max !== -1 && BAD > set.max
        const failed = stopped ? set.max + 1 : BAD
        const processed = stopped ? Math.min(TOTAL, Math.ceil(ROWS[set.max] / set.blockSize) * set.blockSize) : TOTAL
        const good = processed - failed
        if (stopped) log.push(warn(`instance '${INSTANCE}' of job '${JOB}' has reached the max allowed number of failed records. Record will be added to failed list and the instance will be removed from execution pool.`, ENGINE))
        log.push(info(`Step upsert-crm: the Batch Aggregator of ${AGGREGATOR} sent ${number(Math.ceil(good / AGGREGATOR))} bulk upserts to the CRM.`))

        let errorFile = null
        if (set.failures === 'error-file') {
          const bad = ROWS.slice(0, failed).map(badMember)
          const body = `row,memberId,email,error\n${bad.map((m) => `${m.row},${m.member},"${m.email}",${m.error}`).join('\n')}\n`
          const path = errorFileOf(now)
          const w = sftp.write(path, body, { mode: 'OVERWRITE' })
          if (w.ok) {
            errorFile = path
            log.push(info(`Step collect-failures (acceptPolicy ONLY_FAILURES): a Batch Aggregator of ${FAILURES_SIZE} wrote ${failed} failed ${failed === 1 ? 'record' : 'records'} with their error to ${path}.`))
          } else log.push(warn(`Step collect-failures could not write ${path}: ${w.error}`))
        }

        log.push(info(`Finished execution for instance '${INSTANCE}' of job '${JOB}'. Total Records processed: ${number(processed)}. Successful records: ${number(good)}. Failed Records: ${failed}`, ENGINE))
        let summary = null
        if (set.report === 'report') {
          summary = errorFileOf(now).replace(/-failed\.csv$/, '-summary.txt')
          const text = `job ${JOB} instance ${INSTANCE}\nloadedRecords ${TOTAL}\nprocessedRecords ${processed}\nsuccessfulRecords ${good}\nfailedRecords ${failed}\n${errorFile ? `failed records in ${errorFile}` : 'failed records were not kept'}\n`
          sftp.write(summary, text, { mode: 'OVERWRITE' })
          const where = errorFile ? `The failed records are in ${errorFile}.` : 'The failed records themselves were not kept.'
          log.push((failed ? warn : info)(`On Complete: loaded ${number(TOTAL)}, processed ${number(processed)}, successful ${number(good)}, failed ${failed}.${stopped ? ` ${number(TOTAL - processed)} records were never processed: the job stopped at maxFailedRecords ${set.max}.` : ''} ${where} Summary written to ${summary}.`))
        }

        const last = { ...set, stopped, processed, good, failed, errorFile, summary }
        return { ok: !stopped, ms: stopped ? 40000 : 6 * 60000, errors: stopped ? 1 : 0, log, batch: { total: TOTAL, processed, ok: good, failed }, store: { last } }
      },
    },
  },
}
