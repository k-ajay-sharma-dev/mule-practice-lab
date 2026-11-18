export default {
  id: 'cs-137',
  category: 'case-studies',
  title: 'Payroll Bureau Taking Timesheets From 500 Client Companies in Every Format They Have',
  level: 'ADVANCED',
  tags: ['canonical-model', 'file', 'onboarding', 'validation', 'payroll'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Clients send CSV, Excel, fixed width files and API calls. How do you stop 500 custom flows?',
      options: [
        'Turn every input into one canonical timesheet early, with a small mapping per format, then run one shared process',
        'Write a full flow for each client',
        'Ask all 500 clients to switch to one format first',
        'Let payroll staff retype the files',
      ],
      answer: 0,
      explain: 'A canonical model keeps the custom part small: one mapping per format. Validation, rules and loading are shared by everyone.',
    },
    {
      type: 'single',
      prompt: 'Many clients use the same few HR tools. How do you use that?',
      options: [
        'Build one mapping per tool export and reuse it for every client on that tool, with client settings for the small differences',
        'Copy the mapping for each client and edit it',
        'Ignore the tools and map each file by hand',
        'Support only one tool',
      ],
      answer: 0,
      explain: 'Most of the 500 clients will fall into a handful of known exports. A mapping per export, with per-client settings, covers most of them.',
    },
    {
      type: 'multi',
      prompt: 'Which three checks must run before a timesheet reaches payroll?',
      options: [
        'Every employee ID exists for that client',
        'Hours are within sensible limits, such as no more than 24 in a day',
        'The pay period matches the one being run',
        'The file name is in capital letters',
      ],
      answer: [0, 1, 2],
      explain: 'Wrong people, impossible hours and the wrong period all lead to wrong pay. These are the checks that protect employees.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Three rows in a file of 800 fail validation. What happens?',
      options: [
        'Hold the three rows, load the rest, and send the client a clear report of what to fix before the cut off',
        'Reject the whole file without saying why',
        'Load the three rows anyway with zero hours',
        'Delete the three rows',
      ],
      answer: 0,
      explain: 'Most people get paid on time, and the client knows exactly which rows to fix. Zero hours would mean people are not paid.',
    },
    {
      type: 'match',
      prompt: 'Match each part to its job.',
      pairs: [
        ['Format mapping', 'Turns one client format into the canonical timesheet'],
        ['Client settings', 'Holds small per-client differences such as column names'],
        ['Validation', 'Checks people, hours and period'],
        ['Client report', 'Tells the client what was loaded and what to fix'],
      ],
      explain: 'Each part has one job, so a new client usually needs settings, not code.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Design the canonical timesheet with payroll',
        'Build validation and loading once',
        'Build mappings for the most common exports',
        'Move clients in groups by export type',
        'Offer an upload portal or API for clients with no tool',
      ],
      explain: 'Define the target, build the shared core, cover the big groups, then the long tail.',
    },
  ],
  description: `
**Context.** A payroll bureau runs pay for **500 client companies**. Each pay period, clients send timesheets. Today staff open each file and key it into the payroll engine.

**Facts gathered so far**
- Clients send CSV, Excel, fixed width text and a few use an API. Some email files.
- About 70% of clients use one of six HR or rostering tools.
- Every client has its own cut off, two days before pay day.
- Errors found after the cut off mean people are paid late or wrongly.
- The payroll engine has an import API that takes one employee timesheet at a time.

**Opinions**
- Operations: "Every client is special."
- Sales: "We cannot force clients to change format."
- Payroll lead: "I care that people are paid right and on time."

**Your task.** Design how timesheets get from 500 clients into payroll, how errors are handled, and how you move clients over.
`,
  answerTemplate: `## Decision

## Canonical timesheet

## Intake channels

## Mappings and client settings

## Validation and errors

## Loading into payroll

## Moving clients over

## Risks
`,
  keyPoints: [
    'One canonical timesheet, with a small mapping per format.',
    'Reuse a mapping per HR tool export, with client settings for differences.',
    'Validate people, hours and period before payroll.',
    'Hold bad rows, load good ones, and report clearly before the cut off.',
    'A new client should need settings, not code.',
    'Move clients in groups by export type.',
  ],
  solution: `
**Decision.** One intake platform with a canonical timesheet. Every format is mapped to it, then one shared process validates and loads.

**Canonical timesheet.** Client ID, pay period, employee ID, date, hours by type and approvals. Agreed with payroll.

**Intake channels.** SFTP folders per client, an upload portal, and an API. Emailed files are moved to the portal over time.

**Mappings and client settings.** One mapping per HR tool export and per generic format. Settings per client hold column names, date formats and pay codes.

**Validation and errors.** Check employees, hours and period. Good rows load, bad rows are held, and the client gets a report with each problem and how to fix it. Reminders go out as the cut off nears.

**Loading into payroll.** Each employee timesheet is loaded once, keyed by client, period and employee, so a resent file does not double hours.

**Moving clients over.** Start with the biggest tool group, then the next. Clients with no tool use the portal template.

**Risks.** Clients with odd pay rules, files resent with changes, and late files close to cut off.
`,
  followUps: [
    { q: 'What if a client resends a corrected file?', a: 'Replace that client\'s timesheets for the period, keyed by employee, and report what changed.' },
    { q: 'How do you handle a brand new format?', a: 'If it is close to a known one, use settings. If not, build a new mapping, which then serves every client with that format.' },
    { q: 'Why not load the whole file or nothing?', a: 'One bad row would stop 799 people being paid. Holding only the bad rows protects everyone else.' },
    { q: 'What do you measure?', a: 'Files received before cut off, rows held per client, and corrections after the cut off.' },
  ],
}
