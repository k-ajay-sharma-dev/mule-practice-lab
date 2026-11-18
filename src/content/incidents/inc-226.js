export default {
  id: 'inc-226',
  category: 'incidents',
  title: "The Store Feed Works On Premises but Finds No Files After the Move to CloudHub",
  level: 'BEGINNER',
  tags: ["myproject","azure-file-share","mount","cloudhub"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:00 INFO  [store-feed] Poll directory=Z:/inbound/stores found=0", relevant: true, why: "The app reads a drive letter that only existed on the old server." },
      { text: "2026-11-18 06:00:00 INFO  [store-feed] Runtime=CloudHub 2.0 worker=store-feed-1", relevant: true, why: "The app now runs in CloudHub." },
      { text: "2026-11-18 06:00:01 INFO  [ops] Files waiting on share \\\\brindlefiles\\inbound\\stores count=212", relevant: true, why: "The files are on the share, not on the worker." },
      { text: "2026-11-18 06:05:00 WARN  [planning-export] No store files received for 2026-11-18", relevant: true, why: "The downstream export is missing data." },
      { text: "2026-11-18 23:59:00 INFO  [store-feed] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the feed find no files?",
        options: [
          "The path was a mapped drive on the old Windows server, and the CloudHub worker has no such mount",
          "The share is empty",
          "The files are locked",
          "The poll runs too early",
        ],
        answer: 0,
        explain: "Z: was an SMB mount on the old host. A CloudHub worker cannot mount an SMB share.",
      },
      {
        type: 'single',
        prompt: "Which way can a CloudHub app read the share?",
        options: [
          "Call the Azure Files REST API over HTTPS with a SAS or an identity",
          "Mount the share in the worker with net use",
          "Ask Azure to copy files into the worker disk",
          "Read Z: with more permissions",
        ],
        answer: 0,
        explain: "The REST API works over HTTPS and needs no mount.",
      },
      {
        type: 'multi',
        prompt: "What other options are there?",
        options: [
          "Keep a small hybrid worker on a host that can mount the share",
          "Have the producer also write the files to blob storage",
          "Use a file transfer service to push files to SFTP",
          "Store the files inside the app jar",
        ],
        answer: [0,1,2],
        explain: "Each removes the need to mount SMB inside CloudHub.",
      },
      {
        type: 'single',
        prompt: "What should the migration checklist have caught?",
        options: [
          "Every file path and mount the app depends on",
          "The app colour scheme",
          "The number of flows",
          "The log level",
        ],
        answer: 0,
        explain: "Mapped drives and local paths are host dependencies.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Confirm the files are on the share",
          "Run the old on premises app again for today",
          "Switch the feed to the Azure Files REST API",
          "Test with a copy of yesterday’s files",
          "Add host dependencies to the migration checklist",
        ],
        explain: "Restore the feed, fix the design, then stop it repeating.",
      },
    ],
  },
  description: `
## Symptoms
- After moving the store feed to CloudHub 2.0, every poll finds zero files.
- The planning export reports no store data for today.

## Change / Context
- On the old Windows server the share was mapped as drive Z:.
- The app config still says Z:/inbound/stores.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:00:00 INFO  [store-feed] Poll directory=Z:/inbound/stores found=0
2026-11-18 06:00:00 INFO  [store-feed] Runtime=CloudHub 2.0 worker=store-feed-1
2026-11-18 06:00:01 INFO  [ops] Files waiting on share \\\\brindlefiles\\inbound\\stores count=212
2026-11-18 06:05:00 WARN  [planning-export] No store files received for 2026-11-18
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
    "A mapped drive is a property of the host, not of the app.",
    "CloudHub workers cannot mount SMB shares.",
    "The Azure Files REST API works over HTTPS.",
    "A hybrid worker can keep SMB access.",
    "List host dependencies before a migration.",
    "Watch for zero file runs.",
  ],
  solution: `
**Diagnosis.** The app polls Z:, a drive that was mapped on the old server. The CloudHub worker has no such mount, so it finds nothing.

**Immediate mitigation.**
- Run the old app for today, or copy today’s files where the new app can reach them.

**Root cause.** The migration did not account for the SMB mount the app relied on.

**Permanent fix.**
- Read the share through the Azure Files REST API, or keep a hybrid worker that can mount it.

**Prevention.** Inventory paths and mounts before migrating, and alert when a feed finds zero files on a business day.
`,
  followUps: [
    { q: "Why can CloudHub not mount SMB?", a: "Workers are managed containers. You cannot add OS level mounts to them, and port 445 is often blocked anyway." },
    { q: "How do you authenticate to the REST API?", a: "With a SAS token or an identity, kept in secure properties." },
    { q: "Is blob storage better here?", a: "Often yes for apps, because the connector and HTTPS access are first class." },
    { q: "How do you notice sooner?", a: "Alert when a daily feed processes zero files." },
  ],
}
