export default {
  id: 'ms-256',
  category: 'mulesoft',
  title: 'Lifecycle Rules for a Claim Check Container: Processed Prefixes, Index Tags, Tiering and Deletion',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'lifecycle-management', 'access-tiers', 'blob-index-tags', 'claim-check', 'product-data-hub'],
  estMinutes: 22,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which can a lifecycle management rule filter on?',
      options: ['Blob type', 'A name prefix', 'Blob index tags', 'User metadata such as status=PROCESSED'],
      answer: [0, 1, 2],
      explain: 'Rules filter by blob type, prefix and index tags. User metadata is not a filter, which shapes how a hub marks processed files.',
    },
    {
      type: 'match',
      prompt: 'Match each rule action to what it does.',
      pairs: [
        ['tierToCool', 'Moves matching blobs to the Cool tier'],
        ['tierToArchive', 'Moves matching blobs to the Archive tier'],
        ['delete', 'Deletes matching blobs'],
        ['daysAfterModificationGreaterThan', 'The age condition for an action, counted from the last change'],
      ],
      explain: 'Each action has a condition, such as days since modification, since creation, or since last access when access tracking is on.',
    },
    {
      type: 'single',
      prompt: 'The hub marks each loaded blob by setting metadata. A rule deletes blobs 30 days after modification. What changes the clock?',
      options: [
        'Nothing, metadata is separate',
        'Setting the metadata counts as a modification, so the 30 days start from the time the blob was marked',
        'Only downloads change it',
        'Only the upload',
      ],
      answer: 1,
      explain: 'Any write to the blob, including metadata and properties, updates Last-Modified. That can be useful: the age then counts from processing.',
    },
    {
      type: 'single',
      prompt: 'How can the hub make processed blobs visible to a lifecycle rule?',
      options: [
        'Set user metadata only',
        'Set a blob index tag such as status=processed, or move the blob to a processed/ prefix by copy and delete',
        'Rename the container',
        'Lower the blob size',
      ],
      answer: 1,
      explain: 'Rules can match index tags and prefixes. Either gives the rule a way to tell processed blobs from open ones.',
    },
    {
      type: 'single',
      prompt: 'A team adds a rule and checks an hour later. Nothing has moved. Why?',
      options: [
        'The rule is broken',
        'Lifecycle rules run in the background on their own schedule, and a new rule can take a day or more to act',
        'Rules only run on weekends',
        'Rules need a restart of the account',
      ],
      answer: 1,
      explain: 'Lifecycle management is not instant. Do not rely on it for anything that must happen within minutes.',
    },
    {
      type: 'single',
      prompt: 'An inbound blob was never processed because its notification was lost. The rule deletes all inbound blobs after 30 days. What is the risk?',
      options: [
        'None',
        'The unprocessed file is deleted before anyone notices it was missed',
        'The rule skips it',
        'The rule archives it instead',
      ],
      answer: 1,
      explain: 'Deletion rules should only match blobs known to be processed. Open blobs need a sweep and an alert, not a silent delete.',
    },
  ],
  description: `
Kestrel Home Supply runs a product data hub. Partners upload GS1 style JSON files to an \`inbound\` container in Azure Blob Storage, and a JMS notification tells the hub to load each one. After a successful load, the hub sets the blob metadata \`status\` to \`PROCESSED\`.

The container has grown to 4 TB. Finance asks for processed files to move to cheaper storage after 30 days and be deleted after a year. Audit says unprocessed files must never be deleted silently.

**Questions**
1. What can lifecycle rules match, and what can they do?
2. Why is the current metadata marker not enough for a rule?
3. How would you mark processed blobs, and which rules would you write?
4. What must you watch out for?
`,
  answerTemplate: `## Lifecycle rules

## The metadata problem

## Marking and rules

## Watch outs
`,
  keyPoints: [
    'Rules filter by blob type, prefix and blob index tags, not by user metadata.',
    'Actions move blobs to cooler tiers or delete them after an age condition.',
    'Any write, including metadata, resets Last-Modified.',
    'Mark processed blobs with an index tag or a processed prefix so rules can match them.',
    'Rules run in the background and are not instant.',
    'Never let a rule delete unprocessed inbound files. Sweep and alert on those instead.',
  ],
  solution: `
**1. Lifecycle rules.** A lifecycle policy is a set of rules on the storage account. Each rule filters blobs by type, by name prefix such as \`inbound/processed/\`, and by blob index tags. Its actions move blobs to Cool, Cold or Archive, or delete them, when a condition is met, such as days since the last modification.

**2. The metadata problem.** User metadata is not a rule filter. A rule cannot tell \`status=PROCESSED\` from an open file, so a rule on the whole container would also move or delete files the hub has not loaded.

**3. Marking and rules.** Two options. Set a blob index tag such as \`status=processed\` together with the metadata, and filter rules on that tag. Or copy the blob to a \`processed/\` prefix and delete the original, and filter on that prefix. Then write two rules for processed blobs: move to Cool after 30 days since modification, and delete after 365 days. Since marking a blob updates Last-Modified, the 30 days count from processing.

**4. Watch outs.** Rules run in the background and can take a day or more to act, so do not count on them for quick clean up. Open inbound blobs stay out of every rule, and the hub's sweep finds old unprocessed files and alerts support. Check minimum storage periods before moving to cooler tiers, and confirm early deletion charges do not cancel the savings. Test a new rule on a small prefix first.
`,
  followUps: [
    {
      q: 'Why might the team prefer the index tag over a processed prefix?',
      a: 'Setting a tag does not move the file, so the blob name in the job log stays valid. A copy and delete changes the name and doubles the writes.',
    },
    {
      q: 'Audit wants deleted files to be recoverable for 14 days. What helps?',
      a: 'Turn on soft delete for blobs with a 14 day retention. A deleted blob can then be restored within that window.',
    },
    {
      q: 'How do you prove the rule did what finance expected?',
      a: 'Compare blob inventory reports before and after, by tier and prefix. They show counts and sizes per tier without listing the container by hand.',
    },
  ],
}
