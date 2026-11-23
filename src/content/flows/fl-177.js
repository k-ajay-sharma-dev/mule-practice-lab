import { design, flow, handler, source, step } from '../../flow/dsl.js'

const dataPath = '/mnt/opsshare/exports/stock_20261113.json'
const markerPath = '/mnt/opsshare/exports/stock_20261113.json.ready'
const snapshot = JSON.stringify({ snapshotId: 'SNAP-20261113', site: 'ASHBY-01', items: [{ sku: 'FZ-PEAS-1KG', pallets: 42 }, { sku: 'FZ-CHIPS-2KG', pallets: 17 }] })

export default {
  id: 'fl-177',
  category: 'flows',
  title: 'A Marker File Says the Export Is Complete: Read the Stock Snapshot Named by the Marker From a Mounted Azure File Share, Then Tidy Both',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'smb', 'marker-file', 'partial-files', 'file-listener', 'warehouse'],
  estMinutes: 15,
  flowChecks: [
    { label: 'The listener watches for .ready marker files in /mnt/opsshare/exports', rule: { type: 'source', component: 'file-listener', where: { directory: '/mnt/opsshare/exports', matcher: '.ready' } } },
    { label: 'The data file named by the marker is read before the snapshot is posted', rule: { type: 'before', first: 'file-read', then: 'http-request', thenWhere: { method: 'POST' } } },
    { label: 'The data file is moved to processed after the post', rule: { type: 'before', first: 'http-request', then: 'file-move', thenWhere: { targetPath: 'processed' }, outside: true } },
    { label: 'The marker is deleted after the data file is moved', rule: { type: 'before', first: 'file-move', firstWhere: { targetPath: 'processed' }, then: 'file-delete' } },
    { label: 'A marker with no data file is moved to the error folder', rule: { type: 'inside', component: 'file-move', within: 'on-error-continue', where: { targetPath: 'error' } } },
  ],
  simulation: {
    systems: {
      files: { [dataPath]: snapshot, [markerPath]: '' },
      http: [{ method: 'POST', path: '/warehouse/v1/stock-snapshots', respond: { status: 202, body: { status: 'ACCEPTED' } } }],
    },
    tests: [
      {
        name: 'The export is complete',
        about: 'The marker arrives after the data file. The snapshot is posted once, the data file goes to processed, and the marker is gone.',
        trigger: { file: { path: markerPath } },
        expect: {
          noError: true,
          calls: [{ method: 'POST', path: '/warehouse/v1/stock-snapshots', count: 1, has: { snapshotId: 'SNAP-20261113' } }],
          files: { '/mnt/opsshare/exports/processed/stock_20261113.json': { exists: true }, [dataPath]: { exists: false }, [markerPath]: { exists: false } },
        },
      },
      {
        name: 'A marker with no data file',
        about: 'Someone deleted the export by hand. Nothing is posted and the marker goes to the error folder, so it is not picked up on every poll.',
        trigger: { file: { path: markerPath } },
        overrides: { systems: { files: { [dataPath]: null } } },
        expect: { calls: [{ method: 'POST', path: '/warehouse/v1/stock-snapshots', count: 0 }], files: { [markerPath]: { exists: false }, '/mnt/opsshare/exports/error/*': { count: 1 } } },
      },
      {
        name: 'The warehouse API is down',
        about: 'The post fails. Both files stay where they are, so the next poll tries again.',
        trigger: { file: { path: markerPath } },
        overrides: { systems: { http: [{ method: 'POST', path: '/warehouse/v1/stock-snapshots', respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { error: 'HTTP:CONNECTIVITY', files: { [dataPath]: { exists: true }, [markerPath]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'stock-snapshot-on-marker',
      source('file-listener', { directory: '/mnt/opsshare/exports', matcher: '*.ready', postAction: 'none', timeBetweenSizeCheck: 0, watermarkMode: 'DISABLED' }),
      [
        step('set-variable', { variableName: 'markerPath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'dataPath', value: '#[attributes.path replace /\\.ready$/ with ""]' }),
        step('file-read', { path: '#[vars.dataPath]', outputMimeType: 'application/json' }),
        step('http-request', { method: 'POST', path: '/warehouse/v1/stock-snapshots', responseTimeout: 30000 }),
        step('file-move', { sourcePath: '#[vars.dataPath]', targetPath: '/mnt/opsshare/exports/processed' }),
        step('file-delete', { path: '#[vars.markerPath]' }),
      ],
      [
        handler('on-error-continue', { type: 'FILE:ILLEGAL_PATH' }, [
          step('logger', { level: 'ERROR', message: '#["Marker " ++ vars.markerPath ++ " has no data file"]' }),
          step('file-move', { sourcePath: '#[vars.markerPath]', targetPath: '/mnt/opsshare/exports/error' }),
        ]),
      ],
    ),
  ),
  description: `
Ashby Cold Store, a fictional frozen food warehouse, exports a stock snapshot every hour. The warehouse system writes it to an **Azure File Share** that is mounted over SMB on the integration host at \`/mnt/opsshare\`.

Large snapshots take a while to copy. The warehouse team agreed a rule: first write \`stock_20261113.json\`, then, when it is complete, write an empty marker file with the same name plus \`.ready\`. The marker means "the data file is finished".

Mule posts each snapshot to the stock API, \`POST /warehouse/v1/stock-snapshots\`.

**Requirements**
- Start from the marker, never from the data file.
- Read the data file the marker names and post it.
- Then move the data file to \`/mnt/opsshare/exports/processed\` and delete the marker.
- A marker whose data file is missing goes to \`/mnt/opsshare/exports/error\`.
- If the post fails, leave both files so a later poll tries again.

**Facts**
- Post the data file's JSON as it is.
- The listener gives the marker's full path in \`attributes.path\`. File Read gives the data file's content as the payload.
- The stock API answers **202** with \`{ "status": "ACCEPTED" }\`. The flow does not need that body.
- File Read on a path that does not exist raises **FILE:ILLEGAL_PATH**.
- An API that cannot be reached raises **HTTP:CONNECTIVITY**. Do not catch it: the run must end with that error.

**Design the flow.**
`,
  answerTemplate: `## Why a marker file

## Finding the data file

## Posting and tidying up

## When something is missing or down
`,
  keyPoints: [
    'A marker file is written after the data file is complete. Listening for the marker means the flow never sees a half copied export.',
    'The data file\'s path is the marker\'s path without .ready. Keep both paths in variables: the HTTP Request replaces the attributes.',
    'Move the data file first and delete the marker last. If the flow stops in between, an orphan marker stands out, and the data file is already safe in processed.',
    'A marker with no data file would be picked up on every poll. Move it to an error folder so support sees it once.',
    'If the API is down, nothing moves. The listener finds the marker again on its next poll.',
  ],
  solution: `
1. **File On New or Updated File** on \`/mnt/opsshare/exports\`, pattern \`*.ready\`, no post action.
2. **Set Variable** \`markerPath\` and \`dataPath\` (the marker path without \`.ready\`).
3. **File Read** \`vars.dataPath\` as JSON.
4. **HTTP Request** POST \`/warehouse/v1/stock-snapshots\`.
5. **File Move** \`vars.dataPath\` to \`/mnt/opsshare/exports/processed\`.
6. **File Delete** \`vars.markerPath\`.
7. **On Error Continue** \`FILE:ILLEGAL_PATH\`: ERROR log, then **File Move** the marker to \`/mnt/opsshare/exports/error\`.

**Why no size check.** The marker is empty and written in one go. The size check matters for the data file, and the marker convention already covers it.

**Other ways to get the same promise.** The writer can copy to a temporary name and rename when done, and the listener matches only the final name. Both need the writer's help. When the writer cannot change, compare the size or the last modified time twice before reading.
`,
  followUps: [
    {
      q: 'The marker arrives before the data file has finished copying. Whose bug is it?',
      a: 'The writer\'s. The marker is a promise that the data is complete. Ask for the marker to be written only after the data file is closed, and log the case when the data file fails to parse.',
    },
    {
      q: 'Why not delete the data file instead of moving it?',
      a: 'Processed files are evidence when the warehouse asks what was sent. Keep them for a while and purge old ones on a schedule.',
    },
  ],
}
