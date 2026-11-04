export default {
  id: 'inc-076',
  category: 'incidents',
  title: 'Operations Alert Emails Fail After the Mail Relay Moves to TLS on Port 465',
  level: 'INTERMEDIATE',
  tags: ['email', 'smtp', 'tls', 'connectivity', 'configuration', 'production'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-02 18:00:04 INFO  [deploy] alert-notifier v3.2.1 started; smtp.host=relay-new.corp.example smtp.port=25', relevant: true, why: 'The release changed the host, but the port stayed at 25 and the connection type did not change.' },
      { text: '2026-11-02 18:04:10 ERROR [alert-notifier] EMAIL:CONNECTIVITY Could not connect to relay-new.corp.example:25 (connection refused)', relevant: true, why: 'The new relay does not accept connections on 25. The network path to the host is not the issue, because it answers and refuses.' },
      { text: '2026-11-02 18:05:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-02 18:30:12 INFO  [alert-notifier] Alert ALR-4471 created severity=HIGH source=billing', relevant: false },
      { text: '2026-11-02 19:10:44 INFO  [deploy] alert-notifier v3.2.2 started; smtp.host=relay-new.corp.example smtp.port=465', relevant: true, why: 'The hotfix changed only the port. The flow still uses an SMTP connection, with no TLS configuration.' },
      { text: '2026-11-02 19:12:51 ERROR [alert-notifier] EMAIL:SEND Error while sending email: could not complete SMTP greeting with relay-new.corp.example:465', relevant: true, why: 'A plain SMTP conversation is being attempted on a port that expects TLS from the start.' },
      { text: '2026-11-02 19:13:02 INFO  [mail-relay] relay-new listening: 465/tcp TLS required; 25/tcp closed', relevant: true, why: 'This is the requirement: the new relay needs a TLS connection on 465, which means SMTPS.' },
      { text: '2026-11-02 19:15:00 INFO  [metrics] alert-notifier cpu=4% heap=28%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the failures?',
        options: [
          'The app still uses an SMTP connection, while the new relay needs SMTPS on 465 with a TLS configuration',
          'The relay is overloaded, so the timeouts must be raised above 5 seconds',
          'The alert email bodies are not text',
          'The app credentials have expired',
        ],
        answer: 0,
        explain: 'The first error came from a closed port, and the second from speaking plain SMTP to a TLS port. SMTPS is a separate connection type, so changing the port number alone cannot fix this.',
      },
      {
        type: 'single',
        prompt: 'What does the release need?',
        options: [
          'Change the configuration to an SMTPS connection on port 465 with a TLS configuration that trusts the relay certificate',
          'Keep the SMTP connection and raise the connection timeout',
          'Change the connection to IMAPS on port 993',
          'Ask the relay team to retry failed mail from their side',
        ],
        answer: 0,
        explain: 'The secure variant takes a TLS configuration, and the trust store must accept the certificate the relay presents. IMAPS is for reading mail, not sending it.',
      },
      {
        type: 'multi',
        prompt: 'High-severity alerts were not emailed for two hours. Which actions belong in the recovery and prevention?',
        options: [
          'Review the alerts raised during the window and notify the on-call team about them',
          'Add a second notification channel for high-severity alerts',
          'Alert on EMAIL:CONNECTIVITY, EMAIL:SEND and EMAIL:RETRY_EXHAUSTED from this app',
          'Test a real send against the new relay in a lower environment before any relay change',
          'Disable the error handler, so failed sends stop filling the logs',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Close the gap first and then make the alert path itself observable. An alerting app that fails quietly is the worst place for a silent failure.',
      },
      {
        type: 'order',
        prompt: 'Order the troubleshooting steps.',
        items: [
          'Read the error types and compare them with what changed in each release',
          'Confirm from the relay team which ports and TLS mode are accepted',
          'Change to an SMTPS connection with a TLS configuration, on port 465',
          'Send a test email and confirm that it arrives',
          'Handle the alerts that were missed while email was down',
        ],
        explain: 'Understand the requirement before changing anything else. Two guesses have already been released, and each one cost time.',
      },
    ],
  },
  description: `
## Symptoms
- Since 18:00 on Monday, \`alert-notifier\` has sent no emails. The on-call team did not hear about a billing incident for two hours.
- The app is RUNNING and passes health checks. Alerts are still being created.

## Change / Context
- Network services replaced the corporate mail relay on Monday. The change notice said "new hostname, TLS required".
- \`alert-notifier\` uses \`email:send\` with an **SMTP** connection. Release v3.2.1 changed the host property only. Hotfix v3.2.2 changed the port to 465.

## Logs
\`\`\`
18:00:04 INFO  [deploy] alert-notifier v3.2.1 started; smtp.host=relay-new.corp.example smtp.port=25
18:04:10 ERROR [alert-notifier] EMAIL:CONNECTIVITY Could not connect to relay-new.corp.example:25 (connection refused)
19:10:44 INFO  [deploy] alert-notifier v3.2.2 started; smtp.host=relay-new.corp.example smtp.port=465
19:12:51 ERROR [alert-notifier] EMAIL:SEND Error while sending email: could not complete SMTP greeting with relay-new.corp.example:465
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'SMTP uses port 25 and SMTPS uses port 465. They are separate connection types.',
    'Changing the port on an SMTP connection does not add TLS. SMTPS takes a TLS configuration.',
    'The first failure was a closed port and the second was plain SMTP on a TLS port. Both trace back to one change.',
    'Immediate: switch to SMTPS, verify with a real email, then handle the alerts missed.',
    'Prevention: test real sends before relay changes, alert on EMAIL errors, and give critical alerts a second channel.',
  ],
  solution: `
**Diagnosis.** The two failures have one cause.
- v3.2.1 kept port 25, which is closed on the new relay. The result was \`EMAIL:CONNECTIVITY\`.
- v3.2.2 moved to 465 but kept the **SMTP** connection, so the app tried plain SMTP on a port that requires TLS. The result was \`EMAIL:SEND\`.

The exact wording varies by server, so rest the diagnosis on the change and the relay's requirements, not on the message text.

**Immediate mitigation.**
- Change the configuration to an **SMTPS** connection on **465** with a TLS configuration. If the relay uses an internal CA, include it in the trust store.
- Send a test email and confirm it arrives.
- Review the alerts from the window, and pass any still open to the on-call team.

**Root cause.** A change to the relay's security mode was treated as a change of hostname. The connection type is part of the configuration, and the change notice did not state the port or TLS mode.

**Permanent fix.**
- Keep the host and port in properties per environment, and use the SMTPS connection type in every environment that requires it.
- Add a reconnection strategy, and handle \`EMAIL:CONNECTIVITY\`, \`EMAIL:SEND\` and \`EMAIL:RETRY_EXHAUSTED\` explicitly, so a failed alert is parked for a retry and not lost.

**Prevention.** Run a real send in a lower environment before any relay change. Monitor the alert path itself, and give high-severity alerts a second channel that does not depend on email.
`,
  followUps: [
    { q: 'Would raising the timeouts have helped?', a: 'No. Connection, read and write timeouts default to 5 seconds, but the fault is the protocol, not the speed. A longer timeout just makes each failure take longer.' },
    { q: 'What if the certificate is not trusted?', a: 'The TLS handshake fails even with the right connection type. Add the issuing CA to the trust store in the TLS configuration, rather than switching off validation.' },
    { q: 'How would you test this without emailing real users?', a: 'Send to a monitored test mailbox from a lower environment through the same relay, using the same connection type and TLS configuration as production.' },
  ],
}
