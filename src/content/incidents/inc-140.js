export default {
  id: 'inc-140',
  category: 'incidents',
  title: 'A Partner Loses Its Connection When Another Team Adds a Truststore: TLS Handshakes Without SNI',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'tls', 'mtls', 'sni', 'private-space', 'banking'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-13 13:58:41 INFO  [runtime] exp-card-settlement: status RUNNING, 3 replicas STARTED', relevant: false },
      { text: '2026-10-13 14:02:10 INFO  [audit] private space prod-payments: TLS context b2b-partners created, truststore added, user m.okafor', relevant: true, why: 'The only change in the space. It is for a different domain, and the failures begin straight after it.' },
      { text: '2026-10-13 14:02:55 INFO  [exp-b2b-orders] GET /health 200 (3 ms) client verified CN=partner-qa', relevant: false },
      { text: '2026-10-13 14:03:18 ERROR [legacy-gateway] TLS handshake with settle.example-bank.com:443 failed: received fatal alert: unrecognized_name', relevant: true, why: 'The handshake fails before any HTTP request. Unrecognized name is the alert the docs give for a connection without SNI.' },
      { text: '2026-10-13 14:03:19 INFO  [exp-card-settlement] POST /v1/settlements 200 (88 ms) client=acquirer-two', relevant: true, why: 'Another client of the same app on the same domain still succeeds, so the app and the certificate are healthy.' },
      { text: '2026-10-13 14:11:40 INFO  [noc] openssl s_client -connect settle.example-bank.com:443 -servername settle.example-bank.com: Verify return code 0', relevant: true, why: 'With SNI, the handshake works.' },
      { text: '2026-10-13 14:12:02 ERROR [noc] openssl s_client -connect settle.example-bank.com:443 -noservername: alert unrecognized name', relevant: true, why: 'Without SNI, the same host fails. This one difference reproduces the fault.' },
      { text: '2026-10-13 14:15:00 INFO  [scheduler] settlement-file job completed, 18,204 records', relevant: false },
      { text: '2026-10-13 14:20:31 INFO  [monitoring] exp-card-settlement CPU 21%, heap 44%, no restarts', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'At least one custom domain in the private space now uses a truststore, so CloudHub 2.0 rejects TLS connections without SNI, and the legacy gateway does not send SNI',
          'The certificate for `settle.example-bank.com` expired at 14:02',
          'The new TLS context replaced the certificate of the settlement domain',
          'The new truststore does not contain the certificate of the legacy gateway, so client authentication failed on the settlement domain',
        ],
        answer: 0,
        explain: 'The rule applies to the private space, not to one context. A space with no truststore accepts a connection that omits SNI, and once any custom domain uses a truststore, such connections fail with the alert `unrecognized name`.',
      },
      {
        type: 'single',
        prompt: 'Which evidence best separates this from a certificate or application fault?',
        options: [
          'The same host fails with `-noservername` and works with `-servername`, and another client of the same app keeps working',
          'CPU is at 21%',
          'The settlement file job completed',
          'The health check of `exp-b2b-orders` passed',
        ],
        answer: 0,
        explain: 'A controlled test that changes only SNI proves the variable. An expired certificate would fail with or without SNI, and for all clients.',
      },
      {
        type: 'single',
        prompt: 'Settlement files are due at 16:00 and the partner cannot change its gateway today. What is the safest immediate action?',
        options: [
          'Remove the truststore from the new context, or postpone that go-live, so that no custom domain in the space uses a truststore, and confirm the legacy gateway can connect',
          'Add the certificate of the legacy gateway to the new truststore',
          'Enable Last-Mile Security on `exp-card-settlement`',
          'Restart all replicas of `exp-card-settlement`',
        ],
        answer: 0,
        explain: 'The docs state that a private space that does not use a truststore still accepts a connection without SNI. The trade-off is a delay for the mTLS project, which has not gone live. Adding a certificate does not help, because the client never sends a hostname.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix and prevention?',
        options: [
          'The partner upgrades its gateway to send the application hostname in the SNI extension',
          'If a client truly cannot send SNI, keep its traffic in a private space that does not use a truststore, and put mTLS domains elsewhere',
          'Test all existing clients with `-noservername` before adding a truststore to any custom domain',
          'Treat TLS context changes as changes to the whole private space in change control',
          'Change the read-response timeout to 3600 seconds',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Long term, every client should send SNI, which is what the docs ask for. The read-response timeout has nothing to do with a failed handshake.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Correlate the first failure with the private space audit entry',
          'Reproduce with and without SNI from a test client',
          'Decide with the mTLS project owner to remove the truststore for now',
          'Confirm the legacy gateway connects and settlement files flow',
          'Agree a date for the partner to send SNI, then reschedule the mTLS go-live',
        ],
        explain: 'Prove the cause first, then restore the partner, then plan the change so that the two projects no longer conflict.',
      },
    ],
  },
  description: `
## Symptoms
- Tuesday 14:03: \`legacy-gateway\`, an acquirer's old payment appliance, can no longer reach \`settle.example-bank.com\`. Its logs show a fatal TLS alert.
- Other clients of the same API work normally. Runtime Manager shows \`exp-card-settlement\` as RUNNING with 3 replicas, and no requests from the appliance reach the app.
- The acquirer must deliver settlement files by 16:00.

## Change / Context
- Private space \`prod-payments\` has served \`settle.example-bank.com\` for two years with a custom TLS context that has **no truststore**.
- At 14:02 another team added a new TLS context for \`b2b.example-bank.com\`, with a **truststore** for mutual TLS. This is for a different domain and a different app, so no one told the settlement team.
- The legacy appliance connects with an older TLS stack that does not send Server Name Indication (SNI). The vendor offers no quick update.

## Logs
\`\`\`
14:02:10 INFO  [audit] private space prod-payments: TLS context b2b-partners created, truststore added
14:03:18 ERROR [legacy-gateway] TLS handshake with settle.example-bank.com:443 failed:
         received fatal alert: unrecognized_name
14:03:19 INFO  [exp-card-settlement] POST /v1/settlements 200 (88 ms) client=acquirer-two
14:11:40 INFO  [noc] openssl s_client ... -servername settle.example-bank.com: Verify return code 0
14:12:02 ERROR [noc] openssl s_client ... -noservername: alert unrecognized name
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
    'If at least one custom domain in a private space uses a truststore, CloudHub 2.0 rejects a TLS connection that does not include SNI.',
    'The handshake fails with the alert unrecognized name, before any HTTP request reaches the app.',
    'A private space that does not use a truststore still accepts a connection that omits SNI.',
    'The effect crosses domains and apps in the same space, so a change for one team can break another.',
    'Compare openssl s_client with -servername and -noservername to prove the cause.',
    'Clients should send the application hostname in the SNI extension.',
    'Treat TLS context changes as changes to the whole private space.',
  ],
  solution: `
**Diagnosis.** The failure is at the TLS layer, because no HTTP request appears in the app. It started directly after a truststore was added, on a different domain. Other clients on the same domain succeed. A test with SNI works and a test without SNI fails with \`unrecognized name\`, the alert named in the TLS context documentation.

**Immediate mitigation.**
- Agree with the mTLS project to remove the truststore from \`b2b-partners\`, or to postpone that go-live.
- Check that no other custom domain in the space uses a truststore.
- Confirm that the legacy gateway connects, then watch the 16:00 file delivery.

**Root cause.** Once any custom domain in a private space uses a truststore, CloudHub 2.0 rejects TLS connections that do not include SNI, and that reached this custom domain too. The legacy gateway never sends it. This is documented behaviour, but nothing in the change process linked the new context to existing clients.

**Permanent fix.**
- The acquirer upgrades the appliance so that it sends the application hostname in the SNI extension.
- If that is impossible in the time available, keep clients without SNI in a private space that uses no truststore, and run mTLS domains in another. Weigh that against the extra entitlement, network connections and operating effort.

**Prevention.**
- Add an SNI test to partner onboarding.
- Keep an inventory of client TLS capabilities.
- Require a review of all clients in the space before adding a truststore.
- Include a TLS handshake check in synthetic monitoring, because a failure at this layer never appears in the app logs.
`,
  followUps: [
    { q: 'Why is there nothing in the application logs?', a: 'The handshake fails at the ingress layer, so no request is forwarded to the app. Ingress load balancer logs can be downloaded from the Advanced tab of the private space, and IP-specific log levels can help for one client.' },
    { q: 'Does this rule apply if the partner calls the cloudhub.io default domain?', a: 'The docs state the rule for TLS connections to the private space once a custom domain uses a truststore, and they do not exempt the default domain. Test it before relying on any exception.' },
    { q: 'Could the partner use the IP address of the ingress?', a: 'SNI carries a hostname, so a client connecting by IP address has nothing to send. Use the hostname, with DNS pointing at the private space.' },
  ],
}
