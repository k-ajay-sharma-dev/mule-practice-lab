import { design, flow, scope, source, step } from '../../flow/dsl.js'

const a = '/returns/out/RET_SUP-HAYDEN_20261113_01.csv'
const b = '/returns/out/RET_SUP-HAYDEN_20261113_02.csv'
const files = {
  [a]: 'return_id,store,sku,qty,reason\nR-5501,0101,LAMP-OAK-S,2,DAMAGED',
  [b]: 'return_id,store,sku,qty,reason\nR-5502,0103,RUG-JUTE-L,1,WRONG_ITEM',
  '/returns/out/readme.txt': 'Files are kept for 7 days.',
}

export default {
  id: 'fl-201',
  category: 'flows',
  title: 'Collect Return Files From a Supplier\'s FTP Server on a Schedule: List, Copy to the Local Landing Folder, Then Delete',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'ftp-list', 'scheduler', 'foreach', 'landing-folder', 'supplier'],
  estMinutes: 20,
  flowChecks: [
    { label: 'A Scheduler starts the collection at a fixed frequency', rule: { type: 'source', component: 'scheduler', where: { strategy: 'fixed-frequency' } } },
    { label: 'The return CSV files in /returns/out are listed', rule: { type: 'exists', component: 'ftp-list', where: { directoryPath: '/returns/out', matcher: '.csv' } } },
    { label: 'Each file is written to /data/returns/landing inside a For Each', rule: { type: 'inside', component: 'file-write', within: 'foreach', where: { path: '/data/returns/landing/' } } },
    { label: 'A file is deleted from the FTP server only after its local copy is written', rule: { type: 'before', first: 'file-write', then: 'ftp-delete' } },
  ],
  simulation: {
    systems: { files },
    tests: [
      {
        name: 'Two return files are waiting',
        about: 'Both CSV files land in the local folder and are removed from the supplier\'s server. The readme stays.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: {
            '/data/returns/landing/RET_SUP-HAYDEN_20261113_01.csv': { exists: true, has: 'R-5501' },
            '/data/returns/landing/RET_SUP-HAYDEN_20261113_02.csv': { exists: true, has: 'R-5502' },
            [a]: { exists: false },
            [b]: { exists: false },
            '/returns/out/readme.txt': { exists: true },
          },
        },
      },
      {
        name: 'The landing disk is full',
        about: 'The local write fails. Both files must still be on the supplier\'s server for the next run.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'file' } } },
        expect: { files: { [a]: { exists: true }, [b]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow('collect-supplier-returns', source('scheduler', { strategy: 'fixed-frequency', frequency: 15, timeUnit: 'MINUTES' }), [
      step('ftp-list', { directoryPath: '/returns/out', matcher: '*.csv', recursive: 'false' }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'ftpPath', value: '#[payload.attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[payload.attributes.fileName]' }),
        step('set-payload', { value: '#[payload.payload]' }),
        step('file-write', { path: '#["/data/returns/landing/" ++ vars.fileName]', mode: 'OVERWRITE' }),
        step('ftp-delete', { path: '#[vars.ftpPath]' }),
        step('logger', { level: 'INFO', message: '#["Collected " ++ vars.fileName]' }),
      ]),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, gets return authorisations from a supplier. The supplier will not send files anywhere: it puts them on **its own FTP server**, folder \`/returns/out\`, named \`RET_<supplier>_<date>_<n>.csv\`. It also keeps a \`readme.txt\` there.

Marrow & Pine's returns application reads files from a local folder, \`/data/returns/landing\`. The supplier asks that collected files be **deleted** from its server.

**Requirements**
- Check the supplier's server every 15 minutes.
- Copy every \`.csv\` file to the landing folder with the same name, then delete it from the server.
- A file must never be deleted before its copy is safe.

**Design the flow.** Say why you used a Scheduler and FTP List here instead of the FTP listener.
`,
  answerTemplate: `## Why List on a schedule

## Copying each file

## Deleting safely
`,
  keyPoints: [
    'FTP List returns one entry per file, each with its own payload and attributes. A For Each takes them one at a time.',
    'Keep the path and name in variables before Set Payload replaces the entry with its content.',
    'Write first, delete second. If the write fails, the file is still on the server for the next run.',
    'The matcher *.csv keeps the readme out. Listing a folder you do not own needs that filter.',
    'A Scheduler with List suits a server you visit at set times. The listener suits a folder you watch all the time; both poll in the end.',
  ],
  solution: `
1. **Scheduler**, every 15 minutes.
2. **FTP List** \`/returns/out\`, matcher \`*.csv\`.
3. **For Each** file:
   - **Set Variable** \`ftpPath\` and \`fileName\` from \`payload.attributes\`.
   - **Set Payload** \`payload.payload\` (the file content).
   - **File Write** \`/data/returns/landing/<fileName>\`.
   - **FTP Delete** \`ftpPath\`.

**A copy that fails** stops the loop with an error. The files not yet copied wait for the next run, and nothing is lost.

**Cluster.** On two nodes, run the Scheduler on the primary node only, or both nodes list and copy the same files.
`,
  followUps: [
    {
      q: 'The supplier writes files slowly. How do you avoid copying half a file?',
      a: 'Skip files changed in the last minute or two, using attributes.timestamp, or agree on a temporary name that the matcher ignores. FTP List has no size check of its own.',
    },
    {
      q: 'Why not let one failed file skip to the next?',
      a: 'You could wrap the loop body in a Try with On Error Continue. Then log and alert, because a file that fails every time would sit on the server unnoticed.',
    },
  ],
}
