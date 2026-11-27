// The guided lab retry-storm. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform, runNow, setBackend, viewMessages } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { BACKENDS } from '../platform-led.js'
import { retryPolicy } from './retry-storm.pkg.js'

const NAME = 'stock-update-sync'
const QUEUE = 'stock-updates'
const DLQ = 'stock-updates-dlq'
const NORMAL = BACKENDS.oracle.ms

const sync = (s) => app(s, NAME)
const policy = (s) => retryPolicy({ ...sync(s)?.props, ...sync(s)?.secrets })
// a few retries with a real wait between them, and a whole retry time that stays short
const sane = (s) => {
  const { max, wait } = policy(s)
  return max >= 1 && max <= 5 && wait >= 1000 && wait <= 30000 && sync(s)?.status === 'Running'
}
const db = (s) => ({ up: true, ms: NORMAL, ...s.backends?.oracle })
const recovered = (s) => db(s).up && db(s).ms === NORMAL && sane(s) && (s.backends?.oracle?.t ?? -1) >= sync(s).updated
const replay = (s) => sync(s)?.schedules.find((x) => x.flow === 'replay-dlq-flow')?.last
const replayed = (s) => recovered(s) && Boolean(replay(s)?.ok) && replay(s).t >= s.backends.oracle.t

const lab = {
  id: 'p-fail-retry-storm',
  group: 'More production failures',
  title: 'Retries that hammer a struggling backend',
  minutes: 15,
  scenario:
    'stock-update-sync takes stock updates from the queue stock-updates and writes them to the warehouse database on Oracle. The write sits in an Until Successful scope with retry.max 50 and retry.waitMs 0. Since 08:10 the database is slow after a storage fault, and the database team says it cannot recover. Find out why, stop the storm, and bring every update in.',
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      apps: [newApp(NAME, { props: { 'warehouse.db.host': 'wms-ora01.brightmart.lab', 'queue.name': QUEUE, 'dlq.name': DLQ, 'retry.max': '50', 'retry.waitMs': '0' } })],
      queues: [
        { name: QUEUE, type: 'Standard queue', dlq: DLQ, attempts: 3, messages: [] },
        { name: DLQ, type: 'Standard queue', dlq: '', attempts: 10, messages: [] },
      ],
      queueTraffic: [{ queue: QUEUE, everyMinutes: 1 }],
      mail: [
        {
          t: at(1, 8, 40),
          to: OPS,
          subject: 'Warehouse database: please stop the retries',
          body: 'Since the storage fault at 08:10 every query is slow. stock-update-sync now sends about 150 calls a minute, where 1 or 2 is normal. Each call holds a session until it times out, so the database never gets the room to catch up. We will bring it back to normal speed as soon as those retries have calmed down.',
          source: 'Warehouse DBA',
        },
      ],
    })
    return until(setBackend(s, 'oracle', { ms: 8000 }), at(1, 9))
  },
  steps: [
    { title: 'See the failures in Monitoring', how: `Monitoring, Built-in dashboards, ${NAME}. Every Mule message fails, one a minute, and each one three times.`, done: (s) => Boolean(s.seen[`dash:${NAME}`]) },
    { title: 'Read the mail of the database team', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    sawLogs(NAME),
    ask(
      'Count the calls',
      'Each error block says how many calls Until Successful made, and the WARN line before it gives the delivery attempt. Delivery attempts before reroute is 3 on stock-updates. How many calls reach the database for one stock update?',
      ['3', '50', '51', '153'],
      3,
      'maxRetries 50 is 50 retries after the first attempt, so 51 calls per delivery. Anypoint MQ delivers the message 3 times, so 51 times 3 is 153 calls for one update.',
    ),
    ask(
      'Why retries made it worse',
      'The database was slow before the retries started. Why did it not recover on its own?',
      ['The retries made the database faster', 'Each retry came at once and held another session, so the load grew while the database was weakest', 'The queue was full', 'Until Successful retries only on connectivity errors'],
      1,
      'With millisBetweenRetries 0 the next call follows the timeout at once. A slow system gets many times its normal load exactly when it can take the least.',
    ),
    ask(
      'Reconnection or retry',
      'The database config also has a reconnection strategy. Why does it not stop this storm?',
      ['It retries forever', 'It is about getting a connection. Here the connection works and the query is slow, so it is the Until Successful scope that repeats the call', 'Reconnection strategies do not exist in Mule 4'],
      1,
      'A reconnection strategy deals with connecting to the system. The calls in this flow are made again by the retry scope around the operation.',
    ),
    {
      title: 'Set a sane retry policy',
      how: `Runtime Manager, ${NAME}, Settings, Properties. retry.max 3 and retry.waitMs 2000, then Apply Changes. A few retries with a wait between them, and after the last one MULE:RETRY_EXHAUSTED sends the message back to the queue and from there to ${DLQ}.`,
      done: sane,
    },
    {
      title: 'Let the database recover',
      how: 'Move the clock a few minutes, then open Backends in the menu under Lab tools and set Oracle to Normal. In the lab this stands for the database team bringing it back once the storm has stopped, so do it after the fix.',
      done: recovered,
    },
    { title: 'Look at the dead letters', how: `MQ, ${DLQ}, Message Browser, Get Messages. These are the updates that failed while the database was slow.`, done: (s) => Boolean(s.seen[`mq:${DLQ}`]) },
    { title: 'Replay the dead letters', how: `Schedules of ${NAME}, select replay-dlq-flow, Run. Replay only after the database is back, or the messages return to the dead letter queue.`, done: replayed },
    {
      title: 'Prove that the storm is over',
      how: 'Move the clock 5 minutes. Both queues are empty, the log shows each stock update written with 1 call, and no message fails.',
      done: (s) => {
        if (!replayed(s) || s.clock < s.backends.oracle.t + 5 * MINUTE || !s.queues.every((q) => q.messages.length === 0)) return false
        const since = s.events.filter((e) => e.k === 'msg' && e.app === NAME && e.t > s.backends.oracle.t)
        return since.some((e) => e.s === 'ok') && since.every((e) => e.s === 'ok')
      },
    },
  ],
  why: 'A retry helps with a short hiccup and hurts a system that is already slow. Retry a few times with a wait between the tries, count the retries of every layer together because they multiply, and after the last one give the message to a dead letter queue. Replay it once the system is healthy. In the lab the calls happen in an instant and the database recovers when you set it to Normal. In a real flow Until Successful runs synchronously and holds the message for retries times the wait.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/until-successful-scope',
  solve(start) {
    let s = mark(mark(mark(start, `dash:${NAME}`), 'inbox'), `logs:${NAME}`)
    s = change(s, NAME, { props: { ...sync(s).props, 'retry.max': '3', 'retry.waitMs': '2000' } })
    s = advance(s, 5 * MINUTE)
    s = setBackend(s, 'oracle', { up: true, ms: NORMAL })
    s = viewMessages(s, DLQ)
    s = runNow(s, NAME, 'replay-dlq-flow')
    return advance(s, 5 * MINUTE)
  },
  answers: { 3: 3, 4: 1, 5: 1 },
}

export const LABS = [lab]
