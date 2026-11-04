export default {
  id: 'inc-069',
  category: 'incidents',
  title: 'Supplier Invoices Stop Arriving After the Partner Rotates Its SFTP Host Key',
  level: 'INTERMEDIATE',
  tags: ['sftp', 'listener', 'host-key', 'authentication', 'partner', 'monitoring', 'b2b'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-11 02:00:00 INFO  [partner-notice] Supplier Nordline: SFTP platform migration window 01:00–03:00 CET, new host key fingerprint attached', relevant: true, why: 'The partner changed its SFTP server and host key during the night; nobody acted on the notice.' },
      { text: '2026-10-11 02:41:10 WARN  [sftp-listener nordline-invoices] Could not obtain connection: SFTP:CONNECTIVITY - reject HostKey: sftp.nordline.example (host key does not match known hosts entry)', relevant: true, why: 'Strict host-key checking rejects the new key: the listener cannot connect at all.' },
      { text: '2026-10-11 02:41:40 WARN  [sftp-listener nordline-invoices] Could not obtain connection: SFTP:CONNECTIVITY - reject HostKey: sftp.nordline.example', relevant: false },
      { text: '2026-10-11 06:00:00 INFO  [health] GET /api/health 200 (3 ms)', relevant: false },
      { text: '2026-10-11 07:15:22 INFO  [invoice-load] Supplier Acme Parts: 412 invoices loaded from /inbound/acme', relevant: false },
      { text: '2026-10-12 09:12:05 WARN  [sftp-listener nordline-invoices] Could not obtain connection: SFTP:CONNECTIVITY - Auth fail for user mule_ap (publickey)', relevant: true, why: 'After ops loosened host-key checking, the next layer fails: the new server does not recognise the app\'s public key for this user, so authentication fails.' },
      { text: '2026-10-12 09:30:00 INFO  [ap-dashboard] Nordline invoices received today: 0 (expected ~350)', relevant: true, why: 'The business symptom: no files for two days, and no alert fired because the flow never ran.' },
      { text: '2026-10-12 09:31:44 INFO  [runtime] Application ap-invoice-intake status: RUNNING, 2 workers healthy', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did Nordline invoices stop arriving without any alert?',
        options: [
          'The listener cannot connect (host key changed, then key authentication fails); connection failures in a polling source happen before any flow execution, so the flow error handler and its alert never run',
          'The partner stopped sending invoices',
          'The invoice flow has a DataWeave bug that drops the files',
          'The CloudHub workers are down',
        ],
        answer: 0,
        explain: 'The app is RUNNING and other suppliers load fine; only this connection fails. Errors in establishing the source connection are logged as warnings but do not create events, so on-error alerts in the flow are never triggered.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action?',
        options: [
          'Verify the new host key fingerprint with the partner out of band, update the trusted known hosts entry, confirm which public key / user the new server expects, then reprocess the backlog',
          'Disable host-key checking permanently so it never fails again',
          'Ask the partner to email the invoices as attachments from now on',
          'Restart the application until it connects',
        ],
        answer: 0,
        explain: 'Trust the new key only after checking the fingerprint through a separate channel (the notice, a call). Turning off host-key verification removes protection against impostor servers.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Monitoring on expected file arrivals per partner (e.g. "0 files by 08:00" alert), independent of the flow error handler',
          'An alert on repeated SFTP connection warnings from the listener in the log platform',
          'A partner change process: host-key and key rotations are announced, verified and applied before the cut-over',
          'Store several partners\' private keys in the source repository so they can be swapped quickly',
          'Disable strict host-key checking for all partners',
        ],
        answer: [0, 1, 2],
        explain: 'Detect absence of files and connection failures, and treat key rotation as a planned change. Keys in Git and disabled host-key checks weaken security.',
      },
      {
        type: 'order',
        prompt: 'Put the recovery steps in order.',
        items: [
          'Confirm scope: only the Nordline connection fails, other partners load',
          'Verify the new host key fingerprint and the expected user/public key with Nordline',
          'Update the known hosts entry and credentials through secure properties and redeploy',
          'Watch the listener connect and process the two days of waiting files',
          'Reconcile invoice counts with Nordline and inform accounts payable',
        ],
        explain: 'Scope first, verify trust, change configuration safely, then confirm the backlog is processed completely.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 09:30: accounts payable reports **no invoices from supplier Nordline since Saturday** (normally ~350 per day). Payment run is on Wednesday.
- The app \`ap-invoice-intake\` (CloudHub, 2 workers) shows RUNNING; invoices from 11 other suppliers arrive normally.
- No alert fired. The flow's error handler sends an email on any failure.

## Change / Context
- Nordline emailed a notice on Friday: **SFTP platform migration Saturday night**, new server with a **new host key** (fingerprint attached). The email went to a shared mailbox.
- The connection uses key-based authentication and a known hosts file stored with the app's secure properties.
- On Sunday an on-call engineer saw host-key warnings and tried "relaxing" the host-key check in a hotfix; the warnings changed to authentication failures.

## Logs
\`\`\`
2026-10-11 02:41:10 WARN  [sftp-listener nordline-invoices] Could not obtain connection: SFTP:CONNECTIVITY
  - reject HostKey: sftp.nordline.example (host key does not match known hosts entry)
2026-10-12 09:12:05 WARN  [sftp-listener nordline-invoices] Could not obtain connection: SFTP:CONNECTIVITY
  - Auth fail for user mule_ap (publickey)
2026-10-12 09:30:00 INFO  [ap-dashboard] Nordline invoices received today: 0 (expected ~350)
\`\`\`

## Your tasks
1. What is the most likely root cause, and why was there no alert?
2. What do you do right now?
3. What is the permanent fix?
4. How do you prevent this class of issue?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The partner moved to a new SFTP server with a new host key; strict host-key verification correctly refused to connect.',
    'After host-key checking was relaxed, key authentication failed: the new server did not have the public key / user mapping expected.',
    'Polling-source connection failures do not run the flow, so flow error handlers (and their alerts) never fire.',
    'Immediate: verify the new fingerprint out of band, update known hosts and credentials securely, process the backlog, reconcile counts.',
    'Prevention: file-arrival monitoring per partner, alerts on listener connection warnings, a managed process for partner key rotations; never disable host-key checking.',
  ],
  solution: `
**Diagnosis.** The listener has not connected since 02:41 on Saturday. First, the new server presented a **different host key** and strict host-key checking rejected it — the protection worked as designed. After Sunday's hotfix relaxed the check, the connection reached authentication and failed with **Auth fail (publickey)**: the new server does not recognise the app's public key for user \`mule_ap\`. No alert fired because a failing **source connection** never produces an event; the flow and its error handler never run.

**Immediate mitigation.**
- Verify the new host key fingerprint with Nordline through a separate channel and put it in the known hosts entry; **restore strict checking**.
- Confirm the expected username and public key on the new server (Nordline may need to re-import the key) and update secure properties if needed.
- Redeploy, confirm the listener connects and processes the ~700 waiting files; reconcile counts with Nordline before the payment run.

**Root cause.** A partner-side infrastructure change (host key and account migration) was announced but not handled, and monitoring only covered errors inside the flow.

**Permanent fix.**
- Partner change process: notices go to an owned queue/ticket, key rotations are validated in a test connection before the cut-over date.
- Alerts on repeated listener connection warnings (log-based alert).

**Prevention.** "Expected files" monitoring per partner (count and latest arrival time) that alerts on silence; a partner registry with contacts, fingerprints and key expiry dates; never ship hotfixes that disable host-key verification.
`,
  followUps: [
    { q: 'Why is disabling host-key checking dangerous?', a: 'Without it, the app will send its credentials to and accept files from any server answering on that address — including a man-in-the-middle. The host key is how SFTP proves the server identity.' },
    { q: 'How would you detect "no files" generically for many partners?', a: 'Record each file received (partner, name, time, rows) in a table or metrics; a scheduled check compares against each partner\'s expected schedule and alerts on gaps.' },
    { q: 'Could the reconnection strategy have helped?', a: 'It retries connections, which helps with short network blips; it cannot fix a changed host key or rejected credentials. Those need a configuration change, so the important part is that the failure is noticed.' },
  ],
}
