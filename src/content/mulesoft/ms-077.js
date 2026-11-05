export default {
  id: 'ms-077',
  category: 'mulesoft',
  title: 'Azure Blob Storage with Mule: Containers, Virtual Folders, SAS Tokens and Large Files',
  level: 'INTERMEDIATE',
  tags: ['azure', 'blob-storage', 'cloud-storage', 'security', 'sas', 'streaming', 'connectors'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'Scanned claim documents must be stored as `claims/2026/11/CLM-88120/invoice.pdf`. How is that "folder" structure represented in Azure Blob Storage?',
      options: [
        'One container (e.g. claims) and a blob whose name contains the path 2026/11/CLM-88120/invoice.pdf — folders are virtual prefixes',
        'You must first create directories 2026, 11 and CLM-88120 with a create-directory operation',
        'Each folder level is a separate container',
        'Folders are separate storage accounts',
      ],
      answer: 0,
      explain: 'A storage account holds containers; containers hold blobs. The "/" in a blob name is just part of the name, and listing by prefix makes it look like folders.',
    },
    {
      type: 'single',
      prompt: 'Which connection choice follows least privilege for an upload-only archive integration?',
      options: [
        'SAS Token connection with a token limited to the archive container, write/create permissions and an expiry, rotated before it expires',
        'Access Key connection with the storage account key, because it never expires',
        'Share the account key with every app that uses the storage account',
        'Make the container public so no credentials are needed',
      ],
      answer: 0,
      explain: 'An account key gives full control of the whole storage account. A SAS token can be scoped to a container, permissions and a time window — but you must manage its renewal.',
    },
    {
      type: 'single',
      prompt: 'Uploads suddenly fail with HTTP 403 `AuthenticationFailed` and a message that the signature is not valid in the specified time frame. Nothing was deployed. Most likely cause?',
      options: [
        'The SAS token has expired',
        'The container is full',
        'The blob name contains slashes',
        'The file is larger than the Mule heap',
      ],
      answer: 0,
      explain: 'A SAS token carries its own start and expiry time; after expiry Azure rejects the request with 403 AuthenticationFailed. Track expiry dates and rotate tokens ahead of time.',
    },
    {
      type: 'multi',
      prompt: 'An app archives video evidence files of up to 2 GB from SFTP to Azure Blob. Which practices help?',
      options: [
        'Keep the content as a stream from sftp:read to the Upload Blob operation, without transforming it in DataWeave',
        'Avoid logging or converting the payload (for example to Base64 or a String) on the way',
        'Store metadata (case id, hash, size) in the index database, not in the file content',
        'Load the file into a Java byte array first so the upload is faster',
      ],
      answer: [0, 1, 2],
      explain: 'Mule streams payloads; anything that reads the whole payload into memory (logging, conversion, byte arrays) breaks that and risks out-of-memory errors with large files.',
    },
    {
      type: 'match',
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
      prompt: 'How should the integration react to the connector\'s error types?',
      options: [
        'Retry AZURE-STORAGE:CONNECTIVITY a few times with backoff; treat authentication/permission failures as non-retryable and alert; handle RETRY_EXHAUSTED by parking the message for replay',
        'Retry every error forever, because cloud storage is always eventually available',
        'Ignore errors; Azure stores the file anyway',
        'Convert all errors to HTTP 200 for the caller',
      ],
      answer: 0,
      explain: 'Network blips are transient; an expired or wrong credential will fail every time, so retrying only delays the alert. Exhausted retries need a durable place to replay from.',
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
    'Access Key = full control of the account; SAS token = scoped permissions and expiry — prefer SAS (or managed identities where supported) and rotate before expiry.',
    'An expired SAS token gives HTTP 403 AuthenticationFailed — monitor token expiry dates.',
    'Stream large files end to end; avoid Base64, String conversion and payload logging.',
    'Errors: AZURE-STORAGE:CONNECTIVITY (retry with backoff), EXECUTION (inspect: auth/permission errors are not retryable), RETRY_EXHAUSTED (park for replay and alert).',
  ],
  solution: `
**1. Organisation.** Containers by purpose and lifecycle: \`claims-documents\`, \`repair-videos\`. Blob names carry the hierarchy: \`2026/11/CLM-88120/invoice.pdf\`. "Folders" are prefixes — listing with a blob path of \`2026/11/CLM-88120/\` returns that claim's documents. One container per claim creates millions of containers and makes access policies and lifecycle rules unmanageable.

**2. Credentials.** The account key gives full control over every container in the account, so a leaked properties file is a full breach. Use a **SAS Token** connection scoped to the container with only the required permissions (create/write for archiving, read/list for retrieval) and an expiry; store it as a secure property; rotate it before expiry with a calendar/alert. Where your platform supports managed identities or Azure AD-based access, they avoid long-lived secrets altogether.

**3. Large files.** Base64 inflates the content by about a third and, like logging the payload or converting to a String, forces the whole file into memory. Keep the payload as a stream from \`sftp:read\` straight to **Upload Blob**, log only metadata (name, size, hash, claim id), and keep concurrency low for the video job so several 2 GB transfers do not compete for the worker's resources.

**4. Errors.**
- \`AZURE-STORAGE:CONNECTIVITY\`: retry 3 times with backoff.
- \`AZURE-STORAGE:EXECUTION\`: inspect the HTTP status — 403 AuthenticationFailed or permission errors are configuration problems: alert, do not retry; 404 on download means the document is missing.
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
