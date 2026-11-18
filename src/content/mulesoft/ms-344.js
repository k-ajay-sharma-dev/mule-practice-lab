export default {
  id: 'ms-344',
  category: 'mulesoft',
  title: 'Replays and Audits From a Claim Check Store: Soft Delete, Versioning, Immutability and Retention Trade Offs',
  level: 'EXPERT',
  tags: ['myproject', 'azure-blob', 'claim-check', 'replay', 'retention', 'design'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each Blob Storage feature to what it protects against.',
      pairs: [
        ['Blob soft delete', 'A blob deleted by mistake can be restored within the retention days'],
        ['Blob versioning', 'An overwrite keeps the earlier content as a version'],
        ['Immutability policy', 'Nobody can change or delete the blob until the period ends'],
        ['Lifecycle management', 'Old blobs move to cheaper tiers or are deleted on a schedule'],
      ],
      explain: 'They solve different problems and can be combined. Check which ones your account type supports.',
    },
    {
      type: 'single',
      prompt: 'A sender reuses the same blob name for every daily item file. Which risk does that create for replays?',
      options: [
        'None',
        'A replay of last Tuesday reads today\'s content, because the name now points to new bytes',
        'The blob grows forever',
        'The queue fills up',
      ],
      answer: 1,
      explain: 'Ask for unique names, or turn on versioning and record the version ID in the job log.',
    },
    {
      type: 'single',
      prompt: 'Audit wants proof of what a supplier sent for 7 years. The hub keeps blobs 30 days. What is a good design?',
      options: [
        'Keep everything hot for 7 years',
        'After processing, copy the original to an archive container with a time based immutability policy and a lifecycle rule to a cold or archive tier',
        'Store the files in the job log table',
        'Email them to the auditors',
      ],
      answer: 1,
      explain: 'The working container stays small. The archive container is locked and cheap.',
    },
    {
      type: 'multi',
      prompt: 'What should the job log store so a replay reads exactly what the first run read?',
      options: [
        'Container and blob name',
        'Version ID or ETag of the blob that was read',
        'Content length and checksum',
        'The SAS token used',
      ],
      answer: [0, 1, 2],
      explain: 'With these the replay can prove it read the same bytes. Tokens never belong in a log.',
    },
    {
      type: 'single',
      prompt: 'A lifecycle rule moved processed blobs to the Archive tier after 7 days. Support needs to replay a 10 day old file now. What happens?',
      options: [
        'It reads at once',
        'The blob must be rehydrated first, which can take hours, so the replay waits',
        'The blob is lost',
        'It reads at hot tier cost',
      ],
      answer: 1,
      explain: 'Pick the archive age from how often old replays happen, not only from cost.',
    },
    {
      type: 'single',
      prompt: 'Which statement about immutability and the hub\'s own cleanup is right?',
      options: [
        'The hub can still delete locked blobs',
        'A locked policy blocks deletes until it ends, so cleanup jobs must skip that container',
        'Immutability only applies to Archive tier',
        'It makes blobs read only for other accounts only',
      ],
      answer: 1,
      explain: 'Test with an unlocked policy first. A locked policy cannot be shortened.',
    },
  ],
  description: `
Fenwick Supply's product data hub receives item files as blobs and loads them into Oracle. Three requests arrived in one month. A buyer wants a file from last Tuesday replayed after a code map fix. Audit wants 7 years of proof of what suppliers sent. And finance wants storage costs down.

Today the hub keeps all blobs hot in one container for 30 days, and senders reuse blob names.

**Questions**
1. What goes wrong with replays today?
2. How do you design storage for replays, audit and cost together?
3. What should the job log record about each blob?
4. Which trade offs do you explain to the business?
`,
  answerTemplate: `## Replay problems today

## Storage design

## What the job log records

## Trade offs
`,
  keyPoints: [
    'Reused names make old replays read new content.',
    'Unique names or versioning keep each delivery.',
    'Record container, name, version or ETag, size and checksum.',
    'Split a working container from a locked archive container.',
    'Lifecycle rules cut cost but Archive needs hours to rehydrate.',
    'Locked immutability cannot be shortened and blocks cleanup.',
  ],
  solution: `
**1. Replay problems today.** A reused name means the blob now holds the latest file, not Tuesday's. After 30 days the content is gone. A replay cannot prove it read the same bytes.

**2. Storage design.** Ask senders for unique names, or turn on versioning. Keep a working container for files in flight, with soft delete as a safety net. After a successful load, copy the original to an archive container with a time based immutability policy for the audit period. Add lifecycle rules: cool after some weeks, archive after some months, delete after the policy ends.

**3. What the job log records.** Container, blob name, version ID or ETag, content length, checksum and the run ID. A replay reads that exact version and compares the checksum.

**4. Trade offs.** Archive tier is the cheapest store but needs hours to rehydrate, so recent files stay in cool. Versioning keeps every overwrite and adds cost. A locked immutability policy cannot be shortened, so agree the period with legal before locking. Explain these as choices with costs, not as defaults.
`,
  followUps: [
    {
      q: 'Why copy to a second container instead of locking the working one?',
      a: 'The hub needs to move, mark and delete files in flight. A lock on the working container would block that.',
    },
    {
      q: 'How does a replay find the right file?',
      a: 'From the job log row of the original run: it holds the archive path and version, so support picks a run, not a file name.',
    },
    {
      q: 'Does soft delete replace backups?',
      a: 'No. It helps with mistakes within its retention days. It does not cover a deleted account or a region outage, so think about redundancy too.',
    },
  ],
}
