export default {
  id: 'ms-268',
  category: 'mulesoft',
  title: 'Quotas, Tiers, Snapshots and Soft Delete for an Azure File Share Used by Integrations',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'quota', 'access-tiers', 'snapshots', 'soft-delete', 'operations'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'An integration share reaches its quota during the night run. What happens to the next write?',
      options: [
        'Azure grows the quota up to the storage account limit and bills it',
        'The write fails with a share full error that the flow must handle',
        'The write succeeds and the share is flagged as over quota in metrics',
        'The write is held in a queue until space is freed on the share',
      ],
      answer: 1,
      explain: 'The quota is a hard limit you set. Monitor usage and raise it, or clean up, before it is reached.',
    },
    {
      type: 'single',
      prompt: 'A standard integration share sits on the cool tier and takes about two million small reads and writes a day. Most of its bill is transaction charges. Which change helps most?',
      options: [
        'Move the share to the transaction optimized tier, priced for heavy traffic',
        'Move the share to the archive tier, which has the lowest price per GB',
        'Move the share to the cold tier, which sits below cool in price per GB',
        'Raise the share quota, which lowers the price of each transaction',
      ],
      answer: 0,
      explain: 'Standard shares offer transaction optimized, hot and cool tiers. Cool has cheap storage and dear transactions, and transaction optimized is the reverse, so it suits a busy share. Archive and cold are Blob Storage tiers, not Azure Files tiers. The quota on a standard share is a size limit, not a price setting.',
    },
    {
      type: 'single',
      prompt: 'A bad run overwrote 40 store files with empty content at 03:10. A share snapshot was taken at 02:00. What can you do?',
      options: [
        'Nothing, because a snapshot can only restore the whole share',
        'Copy the 40 files back from the read only 02:00 snapshot',
        'Undelete the 40 files with file level soft delete',
        'Fail over to the secondary region, which still holds the old files',
      ],
      answer: 1,
      explain: 'Snapshots are taken at share level and can be browsed. You can copy single files back from them without touching the rest of the share. Azure Files soft delete works on whole shares, not single files, and geo replication copies the bad writes to the secondary region too.',
    },
    {
      type: 'multi',
      prompt: 'A cleanup script deletes 300 files inside the live integration share by mistake. Share soft delete is on with 14 days of retention, and a snapshot runs every night at 01:00. What is true?',
      options: [
        'The 300 files can be undeleted for 14 days, as with blob soft delete',
        'Share soft delete does not help, since it covers deleting the whole share',
        'Files that were in last night’s snapshot can be copied back from it',
        'The secondary region of a geo redundant account still holds the files',
        'Files created after 01:00 and then deleted cannot come from the snapshot',
      ],
      answer: [1, 2, 4],
      explain: 'Share soft delete protects against deleting the share itself, not single files inside it. For single files, snapshots are the tool, and they hold only what existed when they were taken. Geo replication copies the deletes to the secondary region too.',
    },
    {
      type: 'single',
      prompt: 'The archive directory grows by 20 GB a month. How do old files get removed?',
      options: [
        'A lifecycle management rule on the share, as in Blob Storage',
        'A scheduled flow or script deletes files past the retention period',
        'Moving the share to the cool tier, which ages out old files',
        'Share soft delete, which removes files after its retention period',
      ],
      answer: 1,
      explain: 'Azure Files has no Blob style lifecycle rules, so the integration needs its own cleanup job. Plan the housekeeping job with the integration. Dated archive directories make it a matter of deleting whole folders.',
    },
    {
      type: 'single',
      prompt: 'Which alert stops a full share from failing the next run?',
      options: [
        'An alert when a flow fails with a share full error',
        'An alert on share capacity at about 80 percent of the quota',
        'An alert when the share transaction count rises sharply',
        'An alert on the storage account availability metric',
      ],
      answer: 1,
      explain: 'Alert early enough for someone to clean up or raise the quota during working hours.',
    },
  ],
  description: `
Thornbury Freight uses one Azure file share for several integrations: inbound partner files, an archive and some reports. One night the share filled up and three flows failed. A week later a faulty run overwrote store files with empty content.

**Questions**
1. What is a share quota and what happens when it is reached?
2. Which tiers exist and how would you choose?
3. How do snapshots and soft delete protect the data?
4. What housekeeping and monitoring would you add?
`,
  answerTemplate: `## Quota

## Tiers

## Snapshots and soft delete

## Housekeeping and monitoring
`,
  keyPoints: [
    'A full share fails writes. The quota is a hard limit.',
    'Standard tiers: transaction optimized, hot, cool. Premium runs on SSD.',
    'Snapshots are read only copies of the whole share, good for single file recovery.',
    'Share soft delete restores a deleted share within the retention period.',
    'No Blob style lifecycle rules, so schedule your own cleanup.',
    'Alert on capacity well before the quota.',
  ],
  solution: `
**1. Quota.** Each share has a quota, the most data it may hold. When it is reached, writes fail with an error that the share is full. Flows must treat this as an alert, not a silent retry.

**2. Tiers.** Standard shares can be transaction optimized, hot or cool. The tier changes the price of storage and of each transaction. A share with many small reads and writes all day fits transaction optimized or hot. A share that holds old archives and is rarely read fits cool. Premium shares run on SSD for low latency and are a separate account type. Check current prices before choosing.

**3. Snapshots and soft delete.** A share snapshot is a read only copy of the whole share at a point in time, and only changes take space. Take one before a risky run or on a schedule, and copy single files back when a run overwrites them. Share soft delete keeps a deleted share for a retention period so it can be restored. It does not keep single deleted files.

**4. Housekeeping and monitoring.** Write archives into dated directories and run a scheduled job that deletes those past retention, since Azure Files has no lifecycle rules like Blob Storage. Alert on the capacity metric at around 80 percent of the quota, and on runs that fail with a full share error. Keep different integrations in separate shares, so one cannot fill the space of another.
`,
  followUps: [
    {
      q: 'Why separate shares per integration?',
      a: 'Each gets its own quota, SAS scope and snapshots. One noisy feed cannot fill the share of another, and access stays narrow.',
    },
    {
      q: 'How often would you take snapshots?',
      a: 'Daily on a schedule, plus one before risky runs or deployments, kept for a week or two. Azure Backup can manage the schedule and retention.',
    },
    {
      q: 'Does changing the tier move data?',
      a: 'It changes billing for the share. A tier change can take time and can have its own cost, so check the docs and do it outside the busy window.',
    },
  ],
}
