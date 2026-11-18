import { design, flow, scope, source, step } from '../../flow/dsl.js'

const dir = '/mnt/timetables/published'
const old = `${dir}/TT_20261110.json`
const a = `${dir}/TT_20261113_0600.json`
const b = `${dir}/TT_20261113_0900.json`
const tt = (id) => JSON.stringify({ timetableId: id, services: [{ headcode: '2P14', from: 'PELLOW', to: 'HARTCOMBE', departs: '06:42' }] })
const post = (respond) => [{ method: 'POST', path: '/journey-planner/v1/timetables', respond }]
const marks = { 'share-marks': { 'timetable-mark': '2026-11-12T18:00:00' } }

export default {
  id: 'fl-183',
  category: 'flows',
  title: 'A Read Only Azure File Share That Keeps Every File: Process Each New Timetable Once With a Watermark, and Never Let a Failure Skip a File',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'smb', 'watermark', 'object-store', 'polling', 'read-only', 'transport'],
  estMinutes: 40,
  flowChecks: [
    { label: 'The watermark is read before the folder is listed', rule: { type: 'before', first: 'os-retrieve', then: 'file-list', thenWhere: { directoryPath: dir } } },
    { label: 'Only files newer than the watermark are kept, oldest first', rule: { type: 'exists', component: 'transform', where: { script: { all: ['timestamp', 'orderBy'] } } } },
    { label: 'Each new file is posted to the journey planner inside the loop', rule: { type: 'inside', component: 'http-request', within: 'foreach', where: { path: '/journey-planner/v1/timetables' } } },
    { label: 'The watermark moves to each file\'s time right after that file is posted', rule: { type: 'before', first: 'http-request', then: 'os-store', outside: true } },
    { label: 'The watermark is stored inside the loop, one file at a time', rule: { type: 'inside', component: 'os-store', within: 'foreach' } },
  ],
  simulation: {
    systems: {
      files: { [old]: tt('TT-1110'), [a]: tt('TT-1113A'), [b]: tt('TT-1113B') },
      fileTimes: { [old]: '2026-11-10T05:10:00Z', [a]: '2026-11-13T06:00:00Z', [b]: '2026-11-13T09:00:00Z' },
      http: post({ status: 201, body: { status: 'LOADED' } }),
      objectStore: marks,
    },
    tests: [
      {
        name: 'Two new timetables',
        about: 'Both files from today are posted, oldest first. The file from Tuesday was sent before and is not sent again. The watermark ends at the newest file\'s time, and every file stays on the share.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          calls: [
            { method: 'POST', path: '/journey-planner/v1/timetables', count: 2 },
            { method: 'POST', path: '/journey-planner/v1/timetables', count: 0, has: { timetableId: 'TT-1110' } },
          ],
          stored: [{ store: 'share-marks', key: 'timetable-mark', value: '2026-11-13T09:00:00' }],
          files: { [old]: { exists: true }, [a]: { exists: true }, [b]: { exists: true } },
        },
      },
      {
        name: 'The next poll',
        about: 'Five minutes later nothing new has arrived. Nothing is posted a second time.',
        triggers: [{ schedule: {} }, { afterMs: 300000, schedule: {} }],
        expect: { calls: [{ method: 'POST', path: '/journey-planner/v1/timetables', count: 2 }] },
      },
      {
        name: 'The journey planner refuses the first file',
        about: 'The 06:00 file is refused. The run stops there and the watermark stays where it was, so the next poll sends the 06:00 file again before the 09:00 one. Posting 09:00 now would move the watermark past 06:00 and lose it.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ method: 'POST', path: '/journey-planner/v1/timetables', responses: [{ status: 503, body: { message: 'busy' } }, { status: 201, body: { status: 'LOADED' } }] }] } },
        expect: { calls: [{ method: 'POST', path: '/journey-planner/v1/timetables', count: 1 }], stored: [{ store: 'share-marks', key: 'timetable-mark', value: '2026-11-12T18:00:00' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('timetables-from-share', source('scheduler', { strategy: 'fixed-frequency', frequency: 5, timeUnit: 'MINUTES' }), [
      step('os-retrieve', { key: 'timetable-mark', defaultValue: '2000-01-01T00:00:00', objectStore: 'share-marks' }),
      step('set-variable', { variableName: 'mark', value: '#[payload]' }),
      step('file-list', { directoryPath: dir, matcher: 'TT_*.json', recursive: 'false' }),
      step('transform', {
        script: '%dw 2.0\noutput application/java\n---\n(payload filter ((f) -> (f.attributes.timestamp as String) > vars.mark)) orderBy ((f) -> f.attributes.timestamp as String)',
      }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'fileTime', value: '#[payload.attributes.timestamp as String]' }),
        step('set-payload', { value: '#[read(payload.payload as String, "application/json")]' }),
        step('http-request', { method: 'POST', path: '/journey-planner/v1/timetables', responseTimeout: 30000 }),
        step('os-store', { key: 'timetable-mark', value: '#[vars.fileTime]', objectStore: 'share-marks' }),
      ]),
    ]),
  ),
  description: `
Pellow Rail, a fictional train operator, publishes timetable files to an **Azure File Share** owned by the timetabling team. The share is mounted **read only** over SMB on the integration host at \`/mnt/timetables\`. Files such as \`TT_20261113_0600.json\` appear in \`published\` several times a day. The timetabling team keeps every file there for a year, and nobody else may move, rename or delete them.

Mule posts each new file to the journey planner: \`POST /journey-planner/v1/timetables\`, with the file's JSON as the body. Each file must be posted once, in the order the files were published.

**Requirements**
- Every 5 minutes, find the files that are new since the last one posted.
- Keep the time of the newest file posted in the Object Store \`share-marks\` under \`timetable-mark\`.
- Post the new files oldest first.
- If a post fails, the next poll must send that file again. A later file must never move the watermark past it.

**Design the flow.** Say why moving files to a processed folder is not an option, and what replaces it.
`,
  answerTemplate: `## Why a watermark

## Finding the new files

## Posting in order

## When a post fails
`,
  keyPoints: [
    'When you cannot move or delete files, the folder never empties. Something must remember what was already done: a watermark is the newest file time handled.',
    'Sort the new files by time and post them oldest first. The watermark then only ever moves forward over files that were sent.',
    'Store the watermark after each file, not once at the end. A crash after file 3 of 5 then resends 4 and 5, not all five.',
    'Do not catch the error per file and carry on. If file 2 fails and file 3 succeeds, the watermark jumps past file 2 and it is never sent.',
    'The File listener can keep a watermark too (watermark mode on modified time). The List with your own watermark gives you control of the order and of where it is kept.',
  ],
  solution: `
1. **Scheduler** every 5 minutes.
2. **Retrieve** \`timetable-mark\` from \`share-marks\`, with an old default. **Set Variable** \`mark\`.
3. **File List** \`/mnt/timetables/published\`, \`TT_*.json\`.
4. **Transform**: keep the files whose timestamp is after \`vars.mark\`, ordered by timestamp.
5. **For Each** file: **Set Variable** \`fileTime\`, **Set Payload** the file's JSON, **HTTP Request** POST, **Store** \`fileTime\` as \`timetable-mark\`.

No error handler: a failed post ends the run, the watermark stays on the last file sent, and the next poll starts from there.

**Two files with the same time.** If two files share a timestamp and the run stops between them, the second is skipped by a strict "after". Store the time and the file name, and compare both, or use "at or after" and let the journey planner ignore a repeat.

**A file still being written.** Combine the watermark with a short quiet time: only take files that have not changed for a minute.
`,
  followUps: [
    {
      q: 'Someone restores an old file with a new modified time. What happens?',
      a: 'It looks new and is posted again. The journey planner should ignore a timetableId it already has. A watermark finds what is new on the share, not what is new to the business.',
    },
    {
      q: 'The integration host is rebuilt. What must come with it?',
      a: 'The watermark. A persistent Object Store in CloudHub or a database row survives; an in memory store would restart from the default and post a year of files.',
    },
  ],
}
