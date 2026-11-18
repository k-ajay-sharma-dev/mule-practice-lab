import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/mnt/ops-share/manifests/in'
const man = (id) => JSON.stringify({ manifestId: id, depot: 'ELL-DEPOT-3', stops: 14 })
const files = { [`${dir}/MAN_88120.json`]: man('MAN_88120'), [`${dir}/MAN_88121.json`]: man('MAN_88121') }
const dispatch = (respond) => [{ method: 'POST', path: '/dispatch/v1/manifests', respond }]
const stale = `${dir}/MAN_88090.json.claimed-w2`
const fresh = `${dir}/MAN_88119.json.claimed-w1`

export default {
  id: 'fl-186',
  category: 'flows',
  title: 'Two On Premises Workers Mount the Same Azure File Share: Claim Each Manifest With a Rename, Hand It Back on Failure, and Sweep Up Claims Left by a Crash',
  level: 'EXPERT',
  tags: ['myproject', 'azure-file-share', 'smb', 'claim', 'rename', 'concurrency', 'recovery', 'logistics'],
  estMinutes: 55,
  flowChecks: [
    { label: 'Each file is claimed with a rename before it is read', rule: { type: 'before', first: 'file-rename', then: 'file-read' } },
    { label: 'The claim and the work each have their own On Error Continue, so a lost claim is skipped', rule: { type: 'inside', component: 'on-error-continue', within: 'try', min: 2 } },
    { label: 'A claimed file is posted and then moved to processed', rule: { type: 'before', first: 'http-request', then: 'file-move', thenWhere: { targetPath: 'processed' }, outside: true } },
    { label: 'When the post fails, the file is renamed back so it is tried again', rule: { type: 'inside', component: 'file-rename', within: 'on-error-continue', min: 1 } },
    { label: 'A second scheduled flow sweeps up stale claims', rule: { type: 'flows', kind: 'flow', min: 2 } },
    { label: 'The sweeper hands back only claims older than 30 minutes', rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'PT30M' } } },
  ],
  simulation: {
    properties: { 'worker.id': 'w1' },
    systems: {
      files,
      // only the sweeper test puts the two claimed files on the share
      fileTimes: { [stale]: '2026-11-13T09:10:00Z', [fresh]: '2026-11-13T09:55:00Z' },
      http: dispatch({ status: 202, body: { status: 'QUEUED' } }),
    },
    tests: [
      {
        name: 'Two manifests waiting',
        about: 'This worker claims both, posts each once, and moves them to processed under their own names. No claimed file is left.',
        trigger: { schedule: { flow: 'manifest-worker' } },
        expect: {
          noError: true,
          calls: [{ method: 'POST', path: '/dispatch/v1/manifests', count: 2 }],
          files: { '/mnt/ops-share/manifests/processed/MAN_88120.json': { exists: true }, '/mnt/ops-share/manifests/processed/MAN_88121.json': { exists: true }, [`${dir}/*claimed*`]: { count: 0 } },
        },
      },
      {
        name: 'Dispatch is down',
        about: 'Both posts fail. Each file is renamed back to its own name, so either worker can take it on the next poll. Nothing reaches processed.',
        trigger: { schedule: { flow: 'manifest-worker' } },
        overrides: { systems: { http: dispatch({ fault: 'CONNECTIVITY' }) } },
        expect: { noError: true, files: { [`${dir}/MAN_88120.json`]: { exists: true }, [`${dir}/MAN_88121.json`]: { exists: true }, '/mnt/ops-share/manifests/processed/*': { count: 0 } } },
      },
      {
        name: 'A worker crashed holding a claim',
        about: 'Worker w2 died 50 minutes ago with a claim. The sweeper hands that file back. A claim taken 5 minutes ago is still being worked on and is left alone.',
        trigger: { schedule: { flow: 'claim-sweeper' } },
        overrides: { systems: { files: { [stale]: man('MAN_88090'), [fresh]: man('MAN_88119') } } },
        expect: { files: { [`${dir}/MAN_88090.json`]: { exists: true }, [stale]: { exists: false }, [fresh]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow('manifest-worker', source('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'MINUTES' }), [
      step('file-list', { directoryPath: dir, matcher: 'MAN_*.json', recursive: 'false' }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'fileName', value: '#[payload.attributes.fileName]' }),
        step('set-variable', { variableName: 'claimName', value: '#[payload.attributes.fileName ++ ".claimed-" ++ p("worker.id")]' }),
        step('set-variable', { variableName: 'claimed', value: '#[false]' }),
        scope('try', {}, [step('file-rename', { path: '#[payload.attributes.path]', to: '#[vars.claimName]' }), step('set-variable', { variableName: 'claimed', value: '#[true]' })], {
          errorHandlers: [handler('on-error-continue', { type: 'FILE:ILLEGAL_PATH, FILE:FILE_ALREADY_EXISTS' }, [step('logger', { level: 'DEBUG', message: '#[vars.fileName ++ " was claimed by another worker"]' })])],
        }),
        router('choice', {}, [
          route({ expression: '#[vars.claimed]' }, [
            scope(
              'try',
              {},
              [
                step('file-read', { path: `#["${dir}/" ++ vars.claimName]`, outputMimeType: 'application/json' }),
                step('http-request', { method: 'POST', path: '/dispatch/v1/manifests', responseTimeout: 30000 }),
                step('file-move', { sourcePath: `#["${dir}/" ++ vars.claimName]`, targetPath: '/mnt/ops-share/manifests/processed', renameTo: '#[vars.fileName]' }),
              ],
              {
                errorHandlers: [
                  handler('on-error-continue', { type: 'ANY' }, [
                    step('logger', { level: 'ERROR', message: '#[vars.fileName ++ " failed, handing it back: " ++ error.description]' }),
                    step('file-rename', { path: `#["${dir}/" ++ vars.claimName]`, to: '#[vars.fileName]' }),
                  ]),
                ],
              },
            ),
          ]),
        ]),
      ]),
    ]),
    flow('claim-sweeper', source('scheduler', { strategy: 'fixed-frequency', frequency: 10, timeUnit: 'MINUTES' }), [
      step('file-list', { directoryPath: dir, matcher: '*.claimed-*', recursive: 'false' }),
      scope('foreach', { collection: '#[payload]' }, [
        router('choice', {}, [
          route({ expression: '#[(payload.attributes.timestamp as LocalDateTime) < ((now() >> "UTC") as LocalDateTime - |PT30M|)]' }, [
            step('logger', { level: 'WARN', message: '#["Handing back stale claim " ++ payload.attributes.fileName]' }),
            step('file-rename', { path: '#[payload.attributes.path]', to: '#[payload.attributes.fileName replace /\\.claimed-.*$/ with ""]' }),
          ]),
        ]),
      ]),
    ]),
  ),
  description: `
Ellery Logistics, a fictional parcel carrier, plans routes in a tool that saves one manifest per van to an **Azure File Share**. Two on premises Mule workers mount the share over SMB at \`/mnt/ops-share\`, because the dispatch system they call is on premises and CloudHub cannot mount SMB anyway. They are separate runtimes, not a Mule cluster.

New manifests appear in \`manifests/in\` as \`MAN_<id>.json\`. Each must be posted once to \`POST /dispatch/v1/manifests\`, then moved to \`manifests/processed\` under its own name. A van that gets two manifests leaves with two drivers' work.

Each worker has a property \`worker.id\` (\`w1\`, \`w2\`).

**Requirements**
- Every minute, each worker looks for \`MAN_*.json\` files.
- A file must be worked on by one worker only, without a shared database or a cluster lock.
- If the post fails, the file must become available again for either worker.
- If a worker dies while it holds a file, the file must not be stuck for ever. Hand back any claim older than 30 minutes.

**Design the flows.**
`,
  answerTemplate: `## Why two workers clash

## Claiming a file

## Working on a claimed file

## Handing back

## Claims left by a crash
`,
  keyPoints: [
    'Two separate runtimes polling one folder both see every file. Without a claim, both post it.',
    'A rename is the claim. Only one rename of MAN_88120.json can succeed; the other worker finds the name gone and skips the file. Test that the share and your client behave that way before trusting it.',
    'Put the worker ID in the claimed name. Support can then see who holds what, and a stuck claim names the worker to look at.',
    'On failure, rename the file back to its own name. A file in an error folder would wait for a person, while a transient outage only needs another try.',
    'A sweeper hands back claims older than any real run. It is the only way out for a file whose worker died between the claim and the move.',
  ],
  solution: `
**manifest-worker** (every minute):
1. **File List** \`MAN_*.json\`. **For Each** file:
2. **Set Variable** \`fileName\`, \`claimName\` (\`<name>.claimed-<worker.id>\`), \`claimed = false\`.
3. **Try**: **File Rename** to \`claimName\`, then \`claimed = true\`. **On Error Continue** for \`FILE:ILLEGAL_PATH, FILE:FILE_ALREADY_EXISTS\`: DEBUG, skip.
4. **Choice** claimed: **Try**: **File Read** the claimed file, **HTTP Request** POST, **File Move** to \`processed\` renamed to \`fileName\`. **On Error Continue** (ANY): ERROR log, **File Rename** back to \`fileName\`.

**claim-sweeper** (every 10 minutes):
1. **File List** \`*.claimed-*\`. **For Each**: **Choice** last modified more than 30 minutes ago: WARN, **File Rename** to the name without the claim suffix.

**Is 30 minutes safe?** It must be longer than the slowest real post plus the move. If the dispatch call can take 10 minutes on a bad day, 30 leaves room. Too short, and the sweeper hands back a file a live worker is still on.

**Repeats are still possible.** If a worker posts and dies before the move, the sweeper hands the file back and it is posted again. Make the dispatch system ignore a manifestId it has seen.
`,
  followUps: [
    {
      q: 'Why not use the File listener with "primary node only"?',
      a: 'That setting needs a Mule cluster. Two separate runtimes each think they are primary. The rename claim works without one.',
    },
    {
      q: 'Does a rename keep the last modified time?',
      a: 'Usually, which matters for the sweeper: it measures how long ago the file last changed, not how long ago it was claimed. Write the claim time into a small marker or the claim name if you need it exact.',
    },
  ],
}
