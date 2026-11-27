// The guided lab scheduler-twice. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'

const NAME = 'invoice-mailer'
const FLOW = 'invoice-mail-flow'
const scheduleOf = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)
const lastRun = (s) => app(s, NAME)?.store?.lastRun

const lab = {
  id: 'p-fail-scheduler-twice',
  group: 'More production failures',
  title: 'The nightly job ran twice',
  minutes: 10,
  scenario: 'It is 09:00. Finance says every customer got each invoice twice last night. invoice-mailer emails the open invoices at 01:00. Last week it went from 1 to 2 replicas for the invoice API, and clustering was left off. Nothing failed and the logs have no ERROR line.',
  start() {
    const s = until(newPlatform({ clock: at(0, 12), apps: [newApp(NAME, { replicas: 2, vCores: 0.2, props: { 'smtp.host': 'smtp.brightmart.lab' } })] }), at(1, 9))
    s.mail.push({ t: at(1, 8, 40), to: OPS, subject: 'Invoices sent twice', body: 'Good morning. Brightmart customers write that they got each invoice of last night two times, a few seconds apart. Please make sure it does not happen tonight.', source: 'Finance' })
    return s
  },
  steps: [
    sawLogs(NAME),
    ask('Count the runs', 'Read the lines at 01:00. How many times did invoice-mail-flow start?', ['Once', 'Twice, once on each replica', 'Twice on the same replica, after a retry', 'It did not start'], 1, 'Two Starting lines at the same minute, each with a different replica name, and each sent 120 mails. The lab writes the replica name at the front of the line.'),
    ask('Find the cause', 'Why did both replicas run the job?', ['The cron expression fires twice a night', 'Without clustering each replica is its own Mule runtime and runs its own schedules', 'Rolling update left an old replica running', 'The mail server sent each mail again'], 1, 'On CloudHub 2.0 the schedules of an application run on all replicas independently when clustering is off. With clustering on they run only on the primary replica.'),
    { title: 'Turn on clustering', how: 'Runtime Manager, invoice-mailer, Settings, Runtime. Keep 2 replicas for the API, tick Run in Runtime Cluster Mode under Runtime Options, Apply Changes. The option needs at least 2 replicas.', done: (s) => Boolean(app(s, NAME)?.cluster) && app(s, NAME).replicas >= 2 && app(s, NAME).status === 'Running' },
    ask('Other fixes', 'Another team cannot use clustering. Which change also stops the double run and keeps the API on 2 replicas?', ['Run the cron every second night', 'Move the scheduled flow to its own application with 1 replica', 'Add a second scheduler to the same flow', 'Turn off Object Store V2'], 1, 'One replica means one scheduler. Going back to 1 replica for the whole application also works, but the API loses its second replica. Either way, make the job safe to run twice, for example by keeping a sent marker per invoice in a shared store.'),
    { title: 'Wait for the next night run', how: 'Move the clock to the next job with Next job. Do not use Run: the proof is that the schedule fires on its own at 01:00.', done: (s) => Boolean(scheduleOf(s)?.last) && !scheduleOf(s).last.manual && scheduleOf(s).last.t > at(1, 9) && lastRun(s)?.t === scheduleOf(s).last.t && lastRun(s).copies === 1 },
    ask('Prove one mail per invoice', 'Open Logs again and read the new 01:00 run. How many mails went out for the 120 invoices?', ['240, one per replica', '120, from the primary replica only', '60, split between the replicas', 'None, the cluster skipped the night'], 1, 'One Starting line, one replica name, 120 mails for 120 invoices. In a cluster only the primary replica runs the schedule.'),
  ],
  why: 'Replicas without clustering are separate Mule runtimes, and each one fires every schedule. Scaling an application for API traffic can therefore double its jobs without a single error. Turn on clustering, or keep the scheduled work in an application with 1 replica, and make the job safe to run twice anyway. A schedule can also be missed while the cluster elects a new primary. The lab runs the schedule once and writes the work of each replica into that one run.',
  docs: 'https://docs.mulesoft.com/cloudhub-2/ch2-clustering',
  solve(start) {
    const s = change(mark(mark(start, `logs:${NAME}`), 'inbox'), NAME, { cluster: true })
    return until(s, at(2, 1, 5))
  },
  answers: { 1: 1, 2: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
