export default {
  id: 'inc-074',
  category: 'incidents',
  title: 'Document Archive Uploads Fail With 403 AuthenticationFailed After the SAS Token Expires',
  level: 'INTERMEDIATE',
  tags: ['azure', 'blob-storage', 'sas', 'credentials', 'monitoring', 'retry', 'insurance'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-01 00:00:07 INFO  [doc-archive] Upload Blob claims-documents/2026/10/CLM-77310/estimate.pdf OK (412 KB)', relevant: false },
      { text: '2026-11-01 00:00:12 ERROR [doc-archive] Upload Blob failed: status 403 AuthenticationFailed - Signature not valid in the specified time frame: Start [2025-11-01T00:00:00Z] - Expiry [2026-11-01T00:00:00Z]', relevant: true, why: 'The SAS token\'s expiry is midnight UTC on 1 November; every request after that is rejected.' },
      { text: '2026-11-01 00:00:12 WARN  [doc-archive] Retry 1/5 for CLM-77311/photo-01.jpg', relevant: true, why: 'The flow retries an authentication error that will fail the same way every time.' },
      { text: '2026-11-01 00:05:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-01 00:06:31 ERROR [doc-archive] Retries exhausted for CLM-77311/photo-01.jpg, message moved to doc.archive.dlq', relevant: true, why: 'Documents are not lost — they are parked in the DLQ and can be replayed once the credential is fixed.' },
      { text: '2026-11-01 08:40:15 INFO  [claims-portal] Handler opened CLM-77290: 6 documents listed', relevant: false },
      { text: '2026-11-01 09:02:44 WARN  [monitoring] doc.archive.dlq depth 4,812 (threshold 100)', relevant: true, why: 'The first alert came nine hours later, from the DLQ depth, not from the credential expiry.' },
      { text: '2026-11-01 09:10:00 INFO  [runtime] doc-archive: 2 replicas RUNNING, CPU 12%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the failing uploads?',
        options: [
          'The SAS token used by the connector expired at 2026-11-01T00:00:00Z, so Azure rejects every request with 403 AuthenticationFailed',
          'The container ran out of space',
          'Azure Blob Storage was down for nine hours',
          'The documents were too large',
        ],
        answer: 0,
        explain: 'The error text gives the token\'s validity window, and failures begin exactly at its expiry. An outage would not return an authentication error.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action?',
        options: [
          'Generate a new SAS token with the same scope (container, permissions) and a planned expiry, update the secure property, redeploy, then replay the DLQ',
          'Switch the connection to the storage account key permanently so it never expires',
          'Purge the DLQ and ask handlers to re-upload documents',
          'Increase retries from 5 to 50',
        ],
        answer: 0,
        explain: 'Restore access with an equally scoped credential, then replay the parked messages. The account key would grant full control of the whole storage account.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix and prevention?',
        options: [
          'Track every SAS token\'s expiry in a credential register and alert 30 and 7 days before it',
          'Rotate tokens on a schedule with overlap (new token deployed before the old one expires)',
          'Treat 403 authentication/authorisation failures as non-retryable: alert immediately instead of retrying',
          'Alert on the upload error rate, not only on DLQ depth',
          'Generate SAS tokens with a 50-year expiry',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Make expiry visible, rotate before it, and classify errors so a credential problem pages someone in minutes. Very long-lived tokens defeat the purpose of SAS.',
      },
      {
        type: 'order',
        prompt: 'Order the recovery steps.',
        items: [
          'Confirm from the 403 message that the token expired at midnight UTC',
          'Create a new SAS token scoped to the container with the required permissions',
          'Store it as a secure property and redeploy doc-archive',
          'Test one upload and one download',
          'Replay the 4,812 DLQ messages at a controlled rate and reconcile counts',
        ],
        explain: 'Confirm, fix the credential safely, verify, then replay the backlog without overloading the storage account or the app.',
      },
    ],
  },
  description: `
## Symptoms
- Saturday 1 November 09:00: claims handlers report that documents uploaded since midnight **do not appear** on claims. The DLQ \`doc.archive.dlq\` has 4,812 messages.
- \`doc-archive\` is RUNNING and healthy; downloads of older documents also fail.

## Change / Context
- \`doc-archive\` (CloudHub 2.0) archives claim documents in **Azure Blob Storage** using the Microsoft Azure Storage connector with a **SAS Token** connection.
- The SAS token was created one year ago by an engineer who has since left; it is stored as a secure property. Nobody recorded its expiry.
- The flow retries any connector error 5 times with backoff, then moves the message to the DLQ. The only alert is on DLQ depth above 100.

## Logs
\`\`\`
00:00:07 INFO  [doc-archive] Upload Blob claims-documents/2026/10/CLM-77310/estimate.pdf OK
00:00:12 ERROR [doc-archive] Upload Blob failed: status 403 AuthenticationFailed
          - Signature not valid in the specified time frame:
            Start [2025-11-01T00:00:00Z] - Expiry [2026-11-01T00:00:00Z]
00:06:31 ERROR [doc-archive] Retries exhausted, message moved to doc.archive.dlq
09:02:44 WARN  [monitoring] doc.archive.dlq depth 4,812 (threshold 100)
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
    'A SAS token carries its own validity window; after expiry Azure returns 403 AuthenticationFailed ("Signature not valid in the specified time frame").',
    'Failures started exactly at the expiry time and affect uploads and downloads — a credential issue, not an outage.',
    'Retrying authentication errors only delays detection; they should alert immediately.',
    'Immediate: new SAS token with the same scope, secure property, redeploy, verify, replay the DLQ at a controlled rate.',
    'Prevention: credential register with expiry alerts, rotation with overlap, error-rate alerts, documented ownership; avoid falling back to the account key.',
  ],
  solution: `
**Diagnosis.** The 403 response states the token's window: valid until **2026-11-01T00:00:00Z**. The first failure is at 00:00:12 and everything after fails, uploads and downloads alike. The SAS token expired.

**Immediate mitigation.**
- Create a new SAS token for the \`claims-documents\` container with the same permissions (create/write/read/list as needed) and an expiry that fits the rotation policy.
- Store it as a secure property, redeploy, test one upload and one download.
- Replay the 4,812 DLQ messages at a controlled rate; reconcile counts per claim and tell the claims team when everything is visible.

**Root cause.** A time-limited credential was introduced without recording its expiry or an owner. Error handling treated an authentication failure as transient, so the only signal was a DLQ depth alert hours later.

**Permanent fix.**
- Classify errors: retry connectivity problems; for HTTP 401/403 from the connector, stop retrying, alert immediately and park the message.
- Rotate SAS tokens on a schedule with overlap: new token deployed well before the old one expires.

**Prevention.** A credential register (SAS tokens, certificates, client secrets, SFTP keys) with owners and expiry alerts 30 and 7 days ahead; alerts on the upload error rate within minutes; where your platform supports identity-based access to Azure Storage, consider it to avoid long-lived shared secrets.
`,
  followUps: [
    { q: 'Why not just switch to the storage account key?', a: 'It never expires but gives full control of every container in the account; if leaked, an attacker can read or delete the whole archive. Scoped, expiring SAS tokens with proper rotation are the safer choice.' },
    { q: 'How would you rotate without downtime?', a: 'Create the new token while the old one is still valid, deploy it, and verify traffic succeeds with it. Only then let the old one expire (or revoke it if it was a policy-based token).' },
    { q: 'Could clock skew cause the same error?', a: 'Yes, if the SAS start time is in the future relative to Azure\'s clock you get the same message right after creation. That is why tokens are often created with a start time a few minutes in the past.' },
  ],
}
