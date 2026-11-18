import { design, flow, source, step } from '../../flow/dsl.js'

const name = 'WEEKLY_POS_2026W46.dat'
const file = `/landing/${name}`
const data = 'H|2026W46|BRINDLE\nD|0101|TENT-2P-OLV|2\nD|0102|JKT-RAIN-M|5\nT|2'

export default {
  id: 'fl-264',
  category: 'flows',
  title: 'Hand a 4 GB File to the Planning Platform on the Same SFTP Server Without Pulling It Through a Transform: Copy and Move by Command, Then a Small Marker File',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'sftp', 'server-side-copy', 'marker-file', 'planning'],
  estMinutes: 25,
  flowChecks: [
    {
      label: 'The file is copied to /archive/weekly on the server, and no step reads or rewrites its content',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'sftp-copy', where: { targetPath: '/archive/weekly' } },
          { type: 'absent', component: 'sftp-read' },
          { type: 'absent', component: 'transform' },
          { type: 'absent', component: 'sftp-write', where: { path: '.dat' } },
        ],
      },
    },
    { label: 'The file is moved to /planning/pickup after the archive copy', rule: { type: 'before', first: 'sftp-copy', then: 'sftp-move', thenWhere: { targetPath: '/planning/pickup' } } },
    { label: 'A .ok marker is written after the move', rule: { type: 'before', first: 'sftp-move', then: 'sftp-write', thenWhere: { path: '.ok' } } },
  ],
  simulation: {
    systems: { files: { [file]: data } },
    tests: [
      {
        name: 'A weekly file',
        about: 'The file is copied to the archive and moved to the pickup folder, both on the server. The marker follows, and the landing folder is empty.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          files: {
            [`/archive/weekly/${name}`]: { exists: true },
            [`/planning/pickup/${name}`]: { exists: true, has: 'T|2' },
            [`/planning/pickup/${name}.ok`]: { exists: true },
            [file]: { exists: false },
          },
        },
      },
      {
        name: 'The same week again',
        about: 'The vendor resends week 46 with a fix. The archive already has a copy under that name; the new one replaces it and the hand off goes through.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [`/archive/weekly/${name}`]: 'H|2026W46|BRINDLE\nT|0' } } },
        expect: { noError: true, files: { [`/archive/weekly/${name}`]: { has: 'T|2' }, [`/planning/pickup/${name}.ok`]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow('weekly-pos-handoff', source('sftp-listener', { directory: '/landing', matcher: 'WEEKLY_POS_*.dat', postAction: 'none', timeBetweenSizeCheck: 60000 }), [
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('set-variable', { variableName: 'size', value: '#[attributes.size]' }),
      step('sftp-copy', { sourcePath: '#[attributes.path]', targetPath: '/archive/weekly', overwrite: 'true' }),
      step('sftp-move', { sourcePath: '#["/landing/" ++ vars.fileName]', targetPath: '/planning/pickup', overwrite: 'true' }),
      step('set-payload', { value: '#[(vars.size as String) ++ "\\n"]' }),
      step('sftp-write', { path: '#["/planning/pickup/" ++ vars.fileName ++ ".ok"]', mode: 'OVERWRITE' }),
      step('logger', { level: 'INFO', message: '#["Handed off " ++ vars.fileName ++ " (" ++ (vars.size as String) ++ " bytes)"]' }),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, receives a weekly point of sale extract from its till vendor: \`WEEKLY_POS_<week>.dat\`, about **4 GB**. The vendor uploads it to \`/landing\` on Brindle's **SFTP server**. The planning platform collects it from \`/planning/pickup\` on the **same server**, once a marker \`<file name>.ok\` is there. A copy must stay in \`/archive/weekly\`.

The current flow reads the file and writes it twice, to the archive and to pickup. That moves 8 GB through the Mule worker, takes 40 minutes, and fails when the network between the worker and the server is slow.

**Requirements**
- Pick up the file once the vendor has finished.
- Keep a copy in \`/archive/weekly\`. A resent week replaces the old copy.
- Put the file in \`/planning/pickup\`, then write the \`.ok\` marker. The marker holds the file size.
- No step may read or rewrite the 4 GB of content.

**Design the flow.**
`,
  answerTemplate: `## Why the old flow was slow

## Copy and move on the server

## The marker
`,
  keyPoints: [
    'A Move is a rename on the server. Mule sends the command, and the bytes never cross the network to the worker.',
    'The listener hands the flow a stream it does not have to read. If no step touches the payload, the content is not pulled.',
    'Whether a copy is a true server side copy depends on the connector and the server. Check it with a large test file and watch the worker\'s network traffic.',
    'The marker is written after the move, so the platform never collects a file that is still being placed.',
    'attributes.size gives the size for the marker without reading the file.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/landing\`, \`WEEKLY_POS_*.dat\`, size check wait 60 seconds.
2. **Set Variable** \`fileName\` and \`size\` from the attributes.
3. **SFTP Copy** to \`/archive/weekly\`, overwrite true.
4. **SFTP Move** to \`/planning/pickup\`.
5. **Set Payload** the size, **SFTP Write** \`<file name>.ok\`.

**Different servers.** When the pickup folder is on another server, the bytes must travel. Then stream them in one pass (read and write without a Transform in between), or let a managed transfer tool on the servers do it and have Mule only start and watch the transfer.
`,
  followUps: [
    {
      q: 'Is SFTP Copy always done on the server?',
      a: 'Not always. SFTP has no standard copy command, so a connector may download and upload the bytes behind the scenes. A Move (rename) on the same server is always done on the server. Test it before you rely on it.',
    },
    {
      q: 'The archive folder is on a slower disk and the copy takes 10 minutes. Does it matter?',
      a: 'Only for order: the move waits for it. If the platform is waiting, move first, then copy from /planning/pickup to the archive, as long as the platform does not delete the file too soon.',
    },
  ],
}
