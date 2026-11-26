// The guided lab sas-expired. See platform-labs.js for the shape of a lab.
import { addMonAlert, at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { cleanSas, NEW_SAS, OLD_SAS } from './sas-expired.pkg.js'

const NAME = 'document-archive'
const FLOW = 'archive-flow'
const last = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last
const ranOk = (s, since) => Boolean(last(s)?.ok) && last(s).t >= since

const MAIL = {
  t: at(0, 15),
  to: OPS,
  subject: 'New SAS token for container invoices',
  body: [
    'Hello team,',
    'the SAS token that document-archive uses for container invoices in the storage account harborarchive ends at 00:00 UTC on 3 November.',
    'Here is the new token. It is valid until 3 February and allows create and write on that container only:',
    NEW_SAS,
    'Please keep it in a protected place. Storage team',
  ].join('\n\n'),
  source: 'Storage team',
}

const lab = {
  id: 'p-fail-sas-expired',
  group: 'More production failures',
  title: 'The SAS token expired',
  minutes: 12,
  scenario:
    'It is 09:00 on Tuesday. Finance cannot find the invoices of Monday in the archive. document-archive uploads PDF invoices to the Azure Blob container invoices at 01:00. It uses the HTTP connector with a SAS token in the property blob.sas. The application is Running. The Inbox has a mail from the storage team.',
  start: () =>
    until(
      newPlatform({
        clock: at(0, 0, 30),
        apps: [newApp(NAME, { props: { 'blob.account': 'harborarchive', 'blob.container': 'invoices', 'blob.sas': OLD_SAS }, store: { through: -2 } })],
        mail: [MAIL],
      }),
      at(1, 9),
    ),
  steps: [
    sawLogs(NAME),
    ask(
      'Read the answer of Azure',
      'The upload failed with 403 and the code AuthenticationFailed. What does the AuthenticationErrorDetail tell you?',
      ['The container does not exist', 'The token expired: its signed expiry time is earlier than the time of the request', 'The token has no write permission', 'The storage firewall blocks the CloudHub address'],
      1,
      'The detail compares the signed expiry time of the token with the start time, which is the time of the request when the token has no st. Expiry came first, so Azure refuses the signature. A missing container gives 404, a missing permission gives AuthorizationPermissionMismatch, and a firewall gives AuthorizationFailure.',
    ),
    { title: 'Find the new token', how: 'Open the Inbox from the menu and read the mail of the storage team.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Store it as a protected property',
      how: 'Runtime Manager, document-archive, Settings, Properties. Put the new token in blob.sas and protect it, so nobody can read it back. Remove the plain entry. Apply Changes.',
      done: (s) => {
        const a = app(s, NAME)
        return cleanSas(a?.secrets['blob.sas']) === NEW_SAS && !a.props['blob.sas'] && a.status === 'Running'
      },
    },
    { title: 'Upload the missed invoices', how: 'Schedules, archive-flow, Run. The log lists the invoices of Monday as uploaded.', done: (s) => ranOk(s, at(1, 9)) && (app(s, NAME).store?.through ?? -9) >= 0 },
    {
      title: 'Make the next failure loud',
      how: 'Monitoring, Alerts, Create Alert. Resource type Application, document-archive. Metric Message Error Count, Above 0 for each of the last 1 consecutive minutes. Add a recipient.',
      done: (s) => s.monAlerts.some((a) => a.enabled && a.name_ === NAME && a.metric === 'Message Error Count' && a.operator === 'Above' && Number(a.threshold) === 0 && Number(a.minutes) === 1 && a.recipients),
    },
    { title: 'Watch the next night', how: 'Move the clock past 01:00 on Wednesday. The job must succeed on its own.', done: (s) => ranOk(s, at(2, 0)) && !last(s).manual },
    ask(
      'Stop the next expiry',
      'The new token ends on 3 February. What keeps that day from being the next outage?',
      [
        'Ask for a token with an expiry far in the future and full permissions on the account',
        'Put the token in the project files so it is versioned with the code',
        'Rotate it on a calendar well before expiry, keep it scoped to one container with create and write, and plan a move to Microsoft Entra ID or a user delegation SAS',
        'Turn the alert off once the new token works',
      ],
      2,
      'A long lived token with wide rights is a bigger risk if it leaks. Rotate before expiry and keep the alert as the safety net. Microsoft recommends Microsoft Entra ID, with managed identities for apps in Azure. CloudHub runs outside your Azure tenant, so in practice that means an app registration with OAuth client credentials, which also needs a secret or certificate to rotate. A user delegation SAS is signed with Entra credentials and its key lasts at most 7 days, so something must create it on a schedule.',
    ),
  ],
  why: 'A SAS token always has an expiry, and the day it passes every request answers 403 AuthenticationFailed while the application stays Running. Read the AuthenticationErrorDetail, store the new token as a protected property, catch up the missed files, and add an alert so the next expiry is not silent. The lab simplifies the token check: the real service validates the signature with the account key.',
  docs: 'https://learn.microsoft.com/en-us/troubleshoot/azure/azure-storage/blobs/authentication/storage-troubleshoot-403-errors',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), 'inbox')
    const a = app(s, NAME)
    const { 'blob.sas': _old, ...props } = a.props
    s = change(s, NAME, { props, secrets: { ...a.secrets, 'blob.sas': NEW_SAS } })
    s = runNow(s, NAME, FLOW)
    s = addMonAlert(s, { title: 'Archive failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
    return until(s, at(2, 1, 5))
  },
  answers: { 1: 1, 7: 2 },
}

export const LABS = [lab]
