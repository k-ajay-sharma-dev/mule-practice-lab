// The guided lab smtp-auth. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, HOUR, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, OPS, propsValue, sawLogs, until, withSecret } from '../platform-kit.js'

const NAME = 'sales-summary-mail'
const FLOW = 'sales-summary-flow'
const NEW_PASSWORD = 'Sales-App-2611'

const lastRun = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last
const ranOk = (s) => Boolean(lastRun(s)?.ok)
const hasAlert = (s) => s.monAlerts.some((a) => a.name_ === NAME && a.resource === 'Application' && a.metric === 'Message Error Count' && a.operator === 'Above' && Number(a.threshold) === 0 && Number(a.minutes) === 1 && a.enabled && a.recipients)

const lab = {
  id: 'p-fail-smtp-auth',
  group: 'More production failures',
  title: 'The daily email stopped',
  minutes: 12,
  scenario: 'sales-summary-mail sends the sales summary of the day before to 38 store managers at 06:30 through the Email connector. It is Tuesday 10:00 and a store manager asks where the summary went. Nobody else noticed: the job has no alert. The mail team wrote to the team on Monday.',
  start: () =>
    until(
      newPlatform({
        clock: at(0, 5),
        apps: [newApp(NAME, { props: { 'smtp.host': 'smtp.mail.brightmart.lab', 'smtp.port': '587', 'smtp.user': 'sales-reports@brightmart.example' }, secrets: { 'smtp.password': 'Sales-Old-0926' } })],
        mail: [
          {
            t: at(0, 4),
            to: OPS,
            subject: 'App password for sales-reports',
            body: 'From Monday 06:00 the mail server accepts only app passwords for sales-reports@brightmart.example. The old password stops working then. The practice app password is Sales-App-2611. Nothing else changes: smtp.mail.brightmart.lab, port 587, STARTTLS.',
            source: 'Mail team',
          },
        ],
      }),
      at(1, 10),
    ),
  steps: [
    { title: 'Find the failed runs', how: `Runtime Manager, Applications, ${NAME}, Schedules. Look at the last run of ${FLOW}. The application is Running, the job is not.`, done: (s) => Boolean(s.seen[`schedules:${NAME}`]) },
    sawLogs(NAME),
    ask(
      'Read the error',
      'The error type is EMAIL:SEND and the message holds 535 5.7.8. What does the mail server say?',
      ['It could not be reached', 'It refused the login of the account', 'The mailbox of a store manager is full', 'The summary is too large'],
      1,
      '535 is the SMTP reply for a failed login. The connection worked and the server answered, so the host and the port are right. The user or the password is not accepted.',
    ),
    { title: 'Find the new password', how: 'Open the Inbox from the menu and read the mail of the mail team.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Store it as a protected property',
      how: 'Settings, Properties. Set smtp.password to the app password and keep it protected, so nobody can read it after the deployment. Apply Changes.',
      done: (s) => app(s, NAME)?.secrets['smtp.password'] === NEW_PASSWORD && !app(s, NAME).props['smtp.password'] && app(s, NAME).status === 'Running',
    },
    ask(
      'Port and TLS',
      'A teammate wants to try port 465 too, with the same SMTP connection. What happens?',
      ['Nothing changes, both ports work the same way', 'It cannot connect: 465 wants TLS from the first byte, which is the SMTPS connection with a TLS context', 'The server lets the job in without a password', 'The mail goes out without encryption'],
      1,
      'Port 587 starts in plain text and upgrades with STARTTLS. In the Email connector that is the SMTP connection with the property mail.smtp.starttls.enable set to true. Port 465 is TLS from the start, which is the SMTPS connection with a TLS context. A port that does not match the connection type fails to connect, before any login. Keep 587.',
    ),
    { title: 'Send the missed summary', how: `Schedules, ${FLOW}, Run. The log shows the summary sent to 38 store managers.`, done: (s) => ranOk(s) && propsValue(app(s, NAME), 'smtp.port') === '587' },
    {
      title: 'Add an alert for failed runs',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${NAME}. Metric Message Error Count, Above 0 for each of the last 1 consecutive minutes, with a recipient. A deployment alert stays silent here, because the application never stops.`,
      done: hasAlert,
    },
    { title: 'Prove it the next morning', how: 'Move the clock to the next job at 06:30. The run succeeds on its own and the alert stays OK.', done: (s) => hasAlert(s) && ranOk(s) && !lastRun(s).manual },
  ],
  why: 'The error type and the SMTP reply code decide where to look. A 535 means the server was reached and refused the login, so the credentials changed. A connection error means host, port or TLS. A job that fails without an alert fails in silence, so every scheduled job needs a Message Error Count alert. In the lab the summary shows in the log only, not in the Inbox, and the port is the only TLS setting it reads.',
  docs: 'https://docs.mulesoft.com/email-connector/latest/email-troubleshooting',
  solve(start) {
    let s = mark(mark(mark(start, `schedules:${NAME}`), `logs:${NAME}`), 'inbox')
    s = withSecret(s, NAME, 'smtp.password', NEW_PASSWORD)
    s = runNow(s, NAME, FLOW)
    s = addMonAlert(s, { title: 'Sales summary failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
    return advance(s, 21 * HOUR)
  },
  answers: { 2: 1, 5: 1 },
}

export const LABS = [lab]
