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
        'Azure raises the quota on its own',
        'The write fails with an error that the share is full, and the flow must handle it',
        'The oldest file is deleted to make room',
        'The write goes to another share',
      ],
      answer: 1,
      explain: 'The quota is a hard limit you set. Monitor usage and raise it, or clean up, before it is reached.',
    },
    {
      type: 'single',
      prompt: 'On standard storage, which tier is meant for a share with many small reads and writes all day?',
      options: ['Cool', 'Archive', 'Transaction optimized', 'Premium cold'],
      answer: 2,
      explain: 'Standard shares offer transaction optimized, hot and cool tiers. Premium shares run on SSD and are a separate account type.',
    },
    {
      type: 'single',
      prompt: 'A bad run overwrote 40 store files with empty content at 03:10. A share snapshot was taken at 02:00. What can you do?',
      options: [
        'Nothing, snapshots only hold metadata',
        'Copy the 40 files back from the 02:00 snapshot, which is a read only copy of the share at that time',
        'Restore the whole storage account',
        'Ask each store to resend',
      ],
      answer: 1,
      explain: 'Snapshots are taken at share level and can be browsed. You can copy single files back from them.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about protection on Azure Files are true?',
      options: [
        'Soft delete keeps a deleted share for a retention period',
        'A soft deleted share can be restored within that period',
        'Soft delete keeps each deleted file separately, like blob soft delete',
        'Snapshots help when files are overwritten or deleted inside a live share',
      ],
      answer: [0, 1, 3],
      explain: 'Share soft delete protects against deleting the share itself. For single files, snapshots are the tool.',
    },
    {
      type: 'single',
      prompt: 'The archive directory grows by 20 GB a month. How do old files get removed?',
      options: [
        'A lifecycle rule on the share, as in Blob Storage',
        'Azure Files has no Blob style lifecycle rules, so a scheduled flow or script deletes files older than the retention period',
        'Azure deletes files after 30 days',
        'They never need removing',
      ],
      answer: 1,
      explain: 'Plan the housekeeping job with the integration. Dated archive directories make it a matter of deleting whole folders.',
    },
    {
      type: 'single',
      prompt: 'Which alert stops a full share from failing the next run?',
      options: [
        'An alert when a run fails',
        'An alert on the share capacity metric at around 80 percent of the quota',
        'A weekly email of all file names',
        'No alert is possible',
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
