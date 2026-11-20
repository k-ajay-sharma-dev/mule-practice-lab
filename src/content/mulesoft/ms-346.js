export default {
  id: 'ms-346',
  category: 'mulesoft',
  title: 'Publishing Plan Files to an Azure File Share That Store Systems Read: Open Handles, Overwrites and Swapping In a New File',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'planning-platform', 'outbound', 'file-locks', 'design'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'The flow overwrites order_plan.csv on the share each night while a store system has it open over SMB. What can happen?',
      options: [
        'Nothing, since a writer always wins over a reader on SMB',
        'The write can fail with a sharing violation, or the reader sees old and new rows',
        'The share keeps a copy of the old file for the open reader',
        'The reader is disconnected and nothing else changes',
      ],
      answer: 1,
      explain: 'SMB readers can hold handles with share modes that block writers. What exactly happens depends on how the reader opened the file.',
    },
    {
      type: 'order',
      prompt: 'Put a safe publish of the new plan file in order.',
      items: [
        'Write the new content to a temporary name in the same folder, such as order_plan.csv.tmp',
        'Check the size and row count of the temporary file',
        'Rename the temporary file over the final name, or rename the old one away first if replacing is not allowed',
        'Write a small ready file with the plan date and row count',
      ],
      explain: 'Readers then see either the whole old file or the whole new file.',
    },
    {
      type: 'single',
      prompt: 'The rename fails because a store reader still has the old file open. What is a reasonable approach?',
      options: [
        'Force close the reader’s handle each night before the rename',
        'Retry a few times with a short wait, then alert',
        'Write the new rows into the open file in place',
        'Skip that night and publish two plans the next night',
      ],
      answer: 1,
      explain: 'Forcing handles closed is a last resort agreed with the store team. Azure Files lets admins list and force close handles, but closing a reader mid read can break the store system.',
    },
    {
      type: 'multi',
      prompt: 'Which designs avoid or reduce fights with open handles?',
      options: [
        'Write each night to a new dated name and let readers pick the newest ready file',
        'Write to a dated folder and switch a small pointer file to it',
        'Ask readers to copy the file locally and close it at once',
        'Overwrite the same file with a single large write call',
      ],
      answer: [0, 1, 2],
      explain: 'Dated names also keep history for audits and replays.',
    },
    {
      type: 'single',
      prompt: 'Stores read the share over SMB, and the Mule app writes over REST. Which detail matters for the rename?',
      options: [
        'None, since SMB and REST keep their locks apart',
        'SMB locks also apply to REST calls, so an open handle can block a REST rename',
        'REST calls ignore all locks, so the rename always succeeds',
        'SMB clients cannot see files written over REST until they remount',
      ],
      answer: 1,
      explain: 'Both go to the same file service, so the same locks apply. Check the docs for how your API version reports it.',
    },
    {
      type: 'single',
      prompt: 'How do you prove each store got the plan?',
      options: [
        'Assume it worked once the write and rename succeed',
        'Have stores write an ack file, and report stores with no ack by a cut off',
        'Check the last access time of each file on the share',
        'Email every store and ask them to reply once they have it',
      ],
      answer: 1,
      explain: 'A status update works as well as an ack file. Publishing is half the job. Knowing who read it is the other half.',
    },
  ],
  description: `
Larkfield Grocers gets store order plans from the planning platform and publishes one file per region to an Azure File Share. Store back office systems read the files over SMB in the early morning. Twice this month a store ordered from half a file, and once the nightly write failed because "the file is in use".

**Questions**
1. What goes wrong when you overwrite a file that readers have open?
2. How do you publish a new file so readers see all or nothing?
3. What do you do when the old file is still open?
4. Which design avoids the problem, and how do you know stores read the plan?
`,
  answerTemplate: `## Overwriting an open file

## Publishing all or nothing

## When the old file is open

## A better design and proof of reading
`,
  keyPoints: [
    'Open SMB handles can block writes and renames.',
    'Readers can see mixed content during an overwrite.',
    'Write to a temporary name, check it, then rename.',
    'SMB locks also affect REST calls on the same file.',
    'Dated names and a ready file avoid the clash.',
    'Ack files show which stores read the plan.',
  ],
  solution: `
**1. Overwriting an open file.** A reader over SMB may hold the file open with a share mode that blocks writers, so the write fails. If it does not block, the reader can get part old and part new rows, which is what the half orders were.

**2. All or nothing.** Write to a temporary name in the same folder. Check its size and row count. Then rename it to the final name, and write a ready file with the plan date and count. Readers only open files that have a ready file.

**3. When the old file is open.** The rename can fail because of that handle, even though the app writes over REST and the store reads over SMB. Retry a few times, then alert. Closing a store's handle by force is a last resort agreed with the store team.

**4. A better design.** Publish a new dated file each night, such as order_plan_20261118.csv, plus a ready file. Readers pick the newest ready plan. No file is ever overwritten, and history is kept. Ask store systems to write an ack, and report stores without one by a cut off time.
`,
  followUps: [
    {
      q: 'How do you clean up old dated files?',
      a: 'A scheduled job deletes plans older than an agreed number of days, skipping any file that still has no ack.',
    },
    {
      q: 'Why put the temporary file in the same folder?',
      a: 'A rename within one share is quick. Moving across shares is a copy, which brings back the half file problem.',
    },
    {
      q: 'What would you monitor?',
      a: 'Publish time, row counts, rename retries and the number of stores without an ack, with an alert before the stores open.',
    },
  ],
}
