export default {
  id: 'ms-343',
  category: 'mulesoft',
  title: 'Blob Downloads Failing With 403, 404 or 409: What to Check First',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'production-support', 'claim-check', 'http-errors', 'troubleshooting'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each status from Blob Storage to a likely cause.',
      pairs: [
        ['403 AuthenticationFailed', 'An expired SAS token, a wrong key, or a client clock that is far off'],
        ['403 AuthorizationPermissionMismatch', 'The identity can sign in but has no data role on the container'],
        ['404 BlobNotFound', 'A wrong name, wrong container, or a blob deleted before it was read'],
        ['409 LeaseIdMissing or a lease conflict', 'Another process holds a lease on the blob'],
      ],
      explain: 'The error code in the response body says much more than the status alone. Log it.',
    },
    {
      type: 'single',
      prompt: 'Downloads started failing with 403 at midnight on the first of the month, with no release. What do you check first?',
      options: [
        'The size of the blobs, in case a monthly size quota was reached',
        'The expiry of the SAS token or the rotation date of the account key',
        'The access tier, in case a lifecycle rule moved the blobs to Cool overnight',
        'The Mule runtime version, in case a patch was applied overnight',
      ],
      answer: 1,
      explain: 'Compare them with what the app properties hold. A failure on a date boundary with no change points at something that expired.',
    },
    {
      type: 'single',
      prompt: 'The claim check message names a blob, and the download returns 404, but the blob is in the portal. What is a common cause?',
      options: [
        'The portal shows a cached listing, and the blob is already gone',
        'Blob names are case sensitive, or the name was URL encoded twice',
        'The blob has an active lease, so the service hides it from other readers',
        'The blob is in the Cool tier, which cannot be read directly',
      ],
      answer: 1,
      explain: 'Double encoding happens when the name in the message is already encoded and the code encodes it again. Cool tier blobs can be read directly. Compare the exact name in the message with the name in the listing, character by character.',
    },
    {
      type: 'multi',
      prompt: 'Downloads from CloudHub fail with 403, but the same key works from a laptop. What could it be?',
      options: [
        'A storage firewall that allows the office IP but not the CloudHub egress IPs',
        'Public network access turned off on the account, so only its private endpoint is allowed',
        'The blob being in the Archive tier, which refuses reads from outside Azure',
        'The blob not existing at that path in the container',
        'A SAS token that expired overnight',
      ],
      answer: [0, 1],
      explain: 'The key is fine, so look at the network rules. A firewall that allows only the office IP, or an account that accepts only its private endpoint, refuses the CloudHub request with 403. An Archive tier blob gives a different error that says it must be rehydrated first, and it would fail from the laptop too. A missing blob gives 404, not 403. An expired token would also fail from the laptop.',
    },
    {
      type: 'single',
      prompt: 'The sender writes the blob and sends the queue message at the same moment. Some downloads get 404 and work on retry. What is the fix?',
      options: [
        'Ask the sender to upload under a lease, so readers wait until it is released',
        'Ask the sender to send the message only after the upload is committed',
        'Download from the secondary region, which gets the blob sooner',
        'Read through the Blob REST API, which waits for uncommitted blocks to commit',
      ],
      answer: 1,
      explain: 'Keep a short retry with a limit for safety. The claim ticket must not leave before the content is stored.',
    },
    {
      type: 'single',
      prompt: 'Which detail should the error log line hold for a failed download?',
      options: [
        'The full URL with its SAS token, so the call can be repeated',
        'Message ID, container, blob name, status, error code and request ID',
        'Message ID, blob URL and status, leaving out the error code to keep lines short',
        'Message ID, response body and the request headers, including Authorization',
      ],
      answer: 1,
      explain: 'The request ID lets the storage team find the call on their side. Never log the SAS token.',
    },
  ],
  description: `
Marrow & Pine Home runs a hub that reads item files from Azure Blob Storage with a claim check: a queue message names the blob and the hub downloads it. This week support saw three kinds of failures: some 403 errors in the morning, a few 404 errors for blobs that clearly exist, and one 409.

**Questions**
1. How do you tell the 403 errors apart?
2. Why can a 404 happen for a blob you can see?
3. What does a 409 on a download point to?
4. What should the hub log, and what should it never log?
`,
  answerTemplate: `## 403 errors

## 404 for a blob that exists

## 409 on a download

## Logging
`,
  keyPoints: [
    'Read the error code in the body, not only the status.',
    '403 can be an expired SAS, a wrong key, clock skew, a missing role or a firewall.',
    '404 can be case, encoding, the wrong container, or timing.',
    '409 often points to a lease held by another process.',
    'The sender must publish the message after the upload is committed.',
    'Log the request ID and blob name, never the SAS token.',
  ],
  solution: `
**1. 403 errors.** Read the error code. AuthenticationFailed points at the credential: an expired SAS token, a rotated key, or a clock far from the real time. AuthorizationPermissionMismatch means an identity without a data role. A firewall block can also show as 403, often as AuthorizationFailure, when the app comes from an IP the storage account does not allow.

**2. 404 for a blob that exists.** Blob names are case sensitive. A name already URL encoded in the message may be encoded again. The container may be wrong for this environment. Or the message arrived before the upload finished.

**3. 409 on a download.** A plain read usually works under a lease, so a 409 tends to come from a write or delete step, such as marking the blob processed while another process holds a lease on it. Find who holds it, and check whether two consumers handle the same message.

**4. Logging.** Log the message ID, container, blob name, status, error code and the request ID from the response. Never log the URL with its SAS token, or any key.
`,
  followUps: [
    {
      q: 'How do you check clock skew on a worker?',
      a: 'Compare the Date header of a storage response with the worker time in the log. A difference of several minutes can break signed requests.',
    },
    {
      q: 'Which of these errors should be retried?',
      a: 'A 404 caused by timing gets a few short retries. A 403 from a credential or firewall needs a fix, so retrying only adds noise.',
    },
    {
      q: 'How do you make SAS expiry less of a surprise?',
      a: 'Prefer a managed identity or service principal with a role. If SAS is needed, record the expiry date and alert some weeks before it.',
    },
  ],
}
