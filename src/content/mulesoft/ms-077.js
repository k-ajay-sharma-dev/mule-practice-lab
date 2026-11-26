export default {
  id: 'ms-077',
  category: 'mulesoft',
  title: 'Azure Blob Storage with Mule: Containers, Virtual Folders, SAS Tokens and Large Files',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure', 'blob-storage', 'cloud-storage', 'security', 'sas', 'streaming', 'connectors'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'Scanned claim documents must be stored as `claims/2026/11/CLM-88120/invoice.pdf`. How is that "folder" structure represented in Azure Blob Storage?',
      options: [
        'Container `claims`, blob name `2026/11/CLM-88120/invoice.pdf`',
        'Container `claims`, with directory objects 2026, 11 and CLM-88120 made before the upload',
        'Nested containers `claims`, `2026` and `11`, each holding the next level',
        'Container `claims`, blob name `invoice.pdf`, with year, month and claim id as blob metadata',
      ],
      answer: 0,
      explain: 'A storage account holds containers, and containers hold blobs. The "/" in a blob name is only part of the name, and listing by prefix makes it look like folders. A flat Blob Storage account has no directory objects to create first. Containers do not nest. Keeping the path only in metadata makes every claim\'s `invoice.pdf` the same blob name, so files overwrite each other.',
    },
    {
      type: 'single',
      prompt: 'Which connection choice follows least privilege for an upload-only archive integration?',
      options: [
        'A SAS token scoped to the container, with create and write, and an expiry',
        'The account access key in a secure property, rotated every 90 days',
        'A container SAS token with read, write and delete, valid for a year',
        'An account SAS token for the Blob service, with create and write, and an expiry',
      ],
      answer: 0,
      explain: 'A container SAS with only create and write, and a time window, grants no more than the upload needs. You rotate it before it expires. The account key gives full control of the whole account, however well it is stored and rotated. Read and delete are not needed for an upload-only job. An account SAS reaches every container in the account, not only the archive container.',
    },
    {
      type: 'single',
      prompt: 'Uploads suddenly fail with HTTP 403 `AuthenticationFailed` and a message that the signature is not valid in the specified time frame. Nothing was deployed. Most likely cause?',
      options: [
        'The SAS token has expired',
        'The access key was rotated in the portal',
        'The container has reached its size limit',
        'The storage firewall now blocks the worker IP',
      ],
      answer: 0,
      explain: 'The message about the time frame points at the token\'s validity window; a rotated key gives a signature mismatch instead. A SAS token carries its own start and expiry time; after expiry Azure rejects the request with 403 AuthenticationFailed. Track expiry dates and rotate tokens ahead of time.',
    },
    {
      type: 'single',
      prompt: 'A Mule app copies large video files from an SFTP server to Azure Blob Storage, and big uploads crash the worker. Which change fixes that?',
      options: [
        'Pass the `sftp:read` stream to Upload Blob, with no transform in between',
        'Move the app to a larger replica size so the heap can hold a 2 GB file',
        'Use an in-memory repeatable stream on `sftp:read`, sized to 2 GB',
        'Split the file into 100 MB parts in DataWeave, then upload each part',
      ],
      answer: 0,
      explain: 'Mule streams payloads, so a file that goes from `sftp:read` to Upload Blob untouched never sits whole in memory. A bigger replica only moves the limit, and several 2 GB files at once still fill the heap. An in-memory stream of 2 GB holds the whole file in memory. Splitting in DataWeave reads the content, which loses the streaming benefit.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each requirement to the operation you would use.',
      pairs: [
        ['Store a document received in the payload', 'Upload Blob'],
        ['Show all documents for claim CLM-88120', 'List Blobs In Container (with blob path claims/2026/11/CLM-88120/)'],
        ['Skip the upload when the document is already archived', 'Is Blob Exists'],
        ['Return a document to the claims portal', 'Download Blob'],
      ],
      explain: 'These operations of the Microsoft Azure Storage connector cover the usual archive use cases; the blob path acts as a prefix filter for listing.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How should the integration react to the connector\'s error types?',
      options: [
        'Retry CONNECTIVITY with backoff; alert on auth errors and do not retry them',
        'Retry CONNECTIVITY and EXECUTION three times each with backoff, then alert',
        'No retry in the flow; the reconnection strategy covers every error type',
        'Retry nothing; park each failed document for manual replay and alert',
      ],
      answer: 0,
      explain: 'Retry AZURE-STORAGE:CONNECTIVITY a few times with backoff, treat authentication and permission failures as non-retryable, and handle RETRY_EXHAUSTED by parking the message for replay. EXECUTION includes 403 auth failures, which fail on every try, so retrying them only delays the alert. A reconnection strategy deals with connection problems, not with errors the operation returns. Parking everything at once turns each short network blip into manual work.',
    },
  ],
  description: `
An insurer is moving its claims document archive from an on-prem file share to **Azure Blob Storage** (storage account \`stclaimsarchiveprod\`). Mule apps on CloudHub 2.0 will:
- receive documents from the claims portal (PDF/JPG, up to 25 MB) and archive them;
- pull nightly batches of **repair-shop videos (up to 2 GB)** from a partner SFTP server;
- list and download documents for a claim when a handler opens it.

The first proof of concept:
- used the **Microsoft Azure Storage connector** with an **Access Key** connection (the account key in a properties file);
- created one container per claim;
- base64-encoded files before upload "for safety";
- logged the payload for debugging.

Large uploads crash the worker.

**Questions**
1. How should containers and blob names be organised?
2. Access Key vs SAS token: which do you use and how do you manage it?
3. Why do large uploads crash, and how do you fix them?
4. How do you handle the connector's errors?
`,
  answerTemplate: `## Containers and blob naming

## Credentials

## Large files

## Error handling
`,
  keyPoints: [
    'Storage account → containers → blobs; folders are virtual prefixes in the blob name (claims/2026/11/CLM-88120/invoice.pdf).',
    'Use a few containers by purpose/retention (claims, videos), not one per claim.',
    'Access Key = full control of the account; SAS token = scoped permissions and expiry. Prefer SAS (or managed identities where supported) and rotate before expiry.',
    'An expired SAS token gives HTTP 403 AuthenticationFailed, so monitor token expiry dates.',
    'Stream large files end to end; avoid Base64, String conversion and payload logging.',
    'Errors: AZURE-STORAGE:CONNECTIVITY (retry with backoff), EXECUTION (inspect: auth/permission errors are not retryable), RETRY_EXHAUSTED (park for replay and alert).',
  ],
  solution: `
**1. Organisation.** Containers by purpose and lifecycle: \`claims-documents\`, \`repair-videos\`. Blob names carry the hierarchy: \`2026/11/CLM-88120/invoice.pdf\`. "Folders" are prefixes: listing with a blob path of \`2026/11/CLM-88120/\` returns that claim's documents. One container per claim creates millions of containers and makes access policies and lifecycle rules unmanageable.

**2. Credentials.** The account key gives full control over every container in the account, so a leaked properties file is a full breach. Use a **SAS Token** connection scoped to the container with only the required permissions (create/write for archiving, read/list for retrieval) and an expiry; store it as a secure property; rotate it before expiry with a calendar/alert. Where your platform supports managed identities or Azure AD-based access, they avoid long-lived secrets altogether.

**3. Large files.** Base64 inflates the content by about a third and, like logging the payload or converting to a String, forces the whole file into memory. Keep the payload as a stream from \`sftp:read\` straight to **Upload Blob**, and log only metadata (name, size, hash, claim id). Keep concurrency low for the video job so several 2 GB transfers do not compete for the worker's resources.

**4. Errors.**
- \`AZURE-STORAGE:CONNECTIVITY\`: retry 3 times with backoff.
- \`AZURE-STORAGE:EXECUTION\`: inspect the HTTP status. 403 AuthenticationFailed or permission errors are configuration problems: alert, do not retry; 404 on download means the document is missing.
- \`AZURE-STORAGE:RETRY_EXHAUSTED\`: move the job item to an error queue / error folder for replay and alert.
- Use **Is Blob Exists** (or a deterministic blob name) to make re-runs idempotent.
`,
  followUps: [
    {
      q: 'How would you give the claims portal direct download links without proxying 2 GB videos through Mule?',
      a: 'Have a System API issue short-lived, read-only SAS URLs for a single blob; the browser downloads directly from Azure. Mule handles authorisation, not the bytes.',
    },
    {
      q: 'How do you verify the archived file is intact?',
      a: 'Calculate a hash (e.g. SHA-256) while streaming or take it from the source, store it with the metadata, and compare on retrieval or in a periodic integrity check.',
    },
    {
      q: 'Why not mount Azure Files and use the File connector instead?',
      a: 'On CloudHub you cannot mount file shares on workers; and blob storage gives lifecycle policies, tiers and HTTP access that fit an archive better. The Blob connector (or REST API) is the integration point.',
    },
  ],
}
