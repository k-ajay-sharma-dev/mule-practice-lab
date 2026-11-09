import { design, flow, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-108',
  category: 'flows',
  title: 'Daily HR File Backup: Read a File and Write a Copy',
  level: 'BEGINNER',
  tags: ['file', 'scheduler', 'csv', 'archive', 'hr'],
  estMinutes: 10,
  flowChecks: [
    {
      label: 'The flow runs on a cron schedule at 06:00',
      rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: { oneOf: ['0 0 6 ', '0 0 06 '] } } },
    },
    {
      label: 'File Read reads /data/hr/in/employees.csv',
      rule: { type: 'exists', component: 'file-read', where: { path: '/data/hr/in/employees.csv' } },
    },
    {
      label: 'File Write writes /data/hr/backup/employees.csv and replaces the old copy',
      rule: { type: 'exists', component: 'file-write', where: { path: '/data/hr/backup/employees.csv', mode: 'OVERWRITE' } },
    },
    {
      label: 'The original file stays where it is',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'file-read' },
          { type: 'absent', component: ['file-move', 'file-delete', 'file-rename'] },
          { type: 'absent', component: 'file-write', where: { path: '/data/hr/in/' } },
        ],
      },
    },
    {
      label: 'The file is read before it is written',
      rule: { type: 'before', first: 'file-read', then: 'file-write' },
    },
    {
      label: 'A Logger records that the copy finished',
      rule: { type: 'before', first: 'file-write', then: 'logger' },
    },
  ],
  referenceFlow: design(
    flow('hr-file-backup', source('scheduler', { strategy: 'cron', expression: '0 0 6 * * ?' }), [
      step('file-read', { path: '/data/hr/in/employees.csv' }),
      step('file-write', { path: '/data/hr/backup/employees.csv', mode: 'OVERWRITE' }),
      step('logger', { level: 'INFO', message: 'Backup of employees.csv finished' }),
    ]),
  ),
  description: `
An HR system drops a staff list at \`/data/hr/in/employees.csv\` every night. The HR team wants a safe copy in another folder in case the original is damaged.

**Requirements**
- Run every morning at **06:00**. Use a Scheduler with a **cron** expression. Cron is a short text pattern that describes a time of day or a calendar schedule.
- Read \`/data/hr/in/employees.csv\` with File Read.
- Write the content to \`/data/hr/backup/employees.csv\` with File Write.
- Today's copy replaces yesterday's copy.
- Log one line when the copy is finished.

The original file stays where it is.

**Design the flow.**
`,
  answerTemplate: `## When it runs

## Reading the file

## Writing the copy

## Replacing yesterday's copy
`,
  keyPoints: [
    'A Scheduler starts the flow by itself. No request or new file is needed.',
    'File Read puts the content of the file into the payload.',
    'File Write writes the payload by default, so nothing is needed between the two steps.',
    'OVERWRITE replaces an existing file. CREATE_NEW would fail on the second day because the file already exists.',
    'File Read leaves the original in place. Nothing is moved or deleted.',
  ],
  solution: `
1. **Scheduler**: strategy \`cron\`, expression \`0 0 6 * * ?\`. The fields are seconds, minutes, hours, day of month, month and day of week, so this means 06:00 every day.
2. **File Read**: path \`/data/hr/in/employees.csv\`. The content is now the payload.
3. **File Write**: path \`/data/hr/backup/employees.csv\`, mode \`OVERWRITE\`. It writes the payload.
4. **Logger**: one INFO line saying the backup finished.

No Transform is needed, because the copy must match the original. Nothing about the content changes.

If File Read fails, the flow stops there and the Write does not run, so yesterday's copy stays in place.
`,
  followUps: [
    {
      q: 'HR now wants to keep one copy per day. What changes?',
      a: 'Build the file name from the date, for example with an expression that adds today\'s date to the name. Each day then writes a different file and nothing is replaced.',
    },
    {
      q: 'The File connector also has a Copy operation. When is that a better fit?',
      a: 'When the flow does not need to look at the content. Copy names a source and a target and needs no separate read step. Read and Write suit cases where the content is used or changed on the way.',
    },
    {
      q: 'Why use a Scheduler here and not the On New or Updated File source?',
      a: 'HR asked for a copy at a fixed time. The file source would start the flow when the file appears, which is a good fit if the copy should happen as soon as the file lands.',
    },
  ],
}
