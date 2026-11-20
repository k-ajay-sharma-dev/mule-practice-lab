import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/mnt/telemetry/archive'
const oldA = `${dir}/PUMPS_20260830.csv`
const oldB = `${dir}/PUMPS_20260911.csv`
const recent = `${dir}/PUMPS_20261101.csv`
const edge = `${dir}/PUMPS_20261010.csv`
const snap = (respond) => [{ method: 'PUT', path: '/telemetry', respond }]

export default {
  id: 'fl-184',
  category: 'flows',
  title: 'Purge Old Telemetry From an Azure File Share Only After a Share Snapshot Succeeded: REST for the Snapshot, the Mount for the Files',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'snapshot', 'rest', 'smb', 'retention', 'scheduler', 'utilities'],
  estMinutes: 35,
  flowChecks: [
    { label: 'The purge runs every Sunday at 03:00', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: { all: ['0 0 3', 'SUN'] } } } },
    { label: 'A share snapshot is taken through the REST API first', rule: { type: 'exists', component: 'http-request', where: { method: 'PUT', path: 'snapshot' } } },
    { label: 'The archive is listed only after the snapshot call', rule: { type: 'before', first: 'http-request', then: 'file-list', thenWhere: { directoryPath: dir } } },
    { label: 'Files are deleted one by one inside the loop, behind an age test', rule: { type: 'inside', component: 'file-delete', within: 'choice' } },
    { label: 'Files are chosen by their last modified time', rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'timestamp' } } },
  ],
  simulation: {
    systems: {
      files: { [oldA]: 'pump,flow\nP1,12.1', [oldB]: 'pump,flow\nP1,11.8', [edge]: 'pump,flow\nP1,12.0', [recent]: 'pump,flow\nP1,12.4' },
      fileTimes: { [oldA]: '2026-08-30T23:50:00Z', [oldB]: '2026-09-11T23:50:00Z', [edge]: '2026-10-10T23:50:00Z', [recent]: '2026-11-01T23:50:00Z' },
      http: snap({ status: 201, body: null }),
    },
    tests: [
      {
        name: 'A normal Sunday',
        about: 'The snapshot is taken. The three files older than 30 days are deleted, the one from 34 days ago among them, and the file from this month stays.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          calls: [{ method: 'PUT', path: '/telemetry', count: 1 }],
          files: { [oldA]: { exists: false }, [oldB]: { exists: false }, [edge]: { exists: false }, [recent]: { exists: true } },
        },
      },
      {
        name: 'The snapshot is refused',
        about: 'The snapshot call answers 403. Nothing is deleted, because without a snapshot a wrong delete could not be undone.',
        trigger: { schedule: {} },
        overrides: { systems: { http: snap({ status: 403, body: '<Error><Code>AuthorizationPermissionMismatch</Code></Error>' }) } },
        expect: { error: 'HTTP:FORBIDDEN', files: { [oldA]: { exists: true }, [oldB]: { exists: true }, [edge]: { exists: true }, [recent]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow('telemetry-archive-purge', source('scheduler', { strategy: 'cron', expression: '0 0 3 ? * SUN' }), [
      step('set-payload', { value: '#[""]' }),
      step('http-request', { method: 'PUT', path: '/telemetry?restype=share&comp=snapshot', responseTimeout: 60000 }),
      step('logger', { level: 'INFO', message: 'Share snapshot taken, starting the purge' }),
      step('file-list', { directoryPath: dir, matcher: '*.csv', recursive: 'false' }),
      scope('foreach', { collection: '#[payload]' }, [
        router('choice', {}, [
          route({ expression: '#[(payload.attributes.timestamp as LocalDateTime) < ((now() >> "UTC") as LocalDateTime - |P30D|)]' }, [
            step('file-delete', { path: '#[payload.attributes.path]' }),
          ]),
        ]),
      ]),
    ]),
  ),
  description: `
Saltmarsh Water, a fictional water company, keeps pump telemetry exports on an **Azure File Share** \`telemetry\`. An on premises Mule runtime mounts it over SMB at \`/mnt/telemetry\`. The folder \`archive\` grows by thousands of files a week, and the share is near its quota.

Files older than 30 days may be deleted. Last year a purge script with a wrong date test deleted a whole year, and there was no way back.

Azure Files can take a **share snapshot**: a read only copy of the whole share at that moment, kept until it is deleted. Snapshots are made through the REST API, not over SMB: \`PUT /telemetry?restype=share&comp=snapshot\` on the file endpoint, with a SAS or identity that may manage the share.

**Requirements**
- Every Sunday at 03:00, take a share snapshot.
- Only if it worked, list \`/mnt/telemetry/archive\` and delete each file whose last modified time is more than 30 days ago.
- If the snapshot fails, delete nothing and fail the run.

**Facts**
- The HTTP Request configuration points at the file endpoint. Send an empty body with the PUT. Azure answers 201 when the snapshot is made.
- List \`*.csv\` in the archive folder, not its subfolders.
- Each item File List returns has \`attributes.timestamp\`, the last modified time in UTC without a zone, and \`attributes.path\`.
- Inside a For Each, test the age in a **Choice** and put the **File Delete** in that route. Compare with the current UTC time minus 30 days.
- A refused snapshot raises an HTTP error such as \`HTTP:FORBIDDEN\`. Do not catch it.

**Design the flow.** Say why the flow mixes REST and the mount.
`,
  answerTemplate: `## Why a snapshot first

## REST for the snapshot, the mount for the files

## Choosing what to delete

## When the snapshot fails
`,
  keyPoints: [
    'A snapshot is a cheap way back. If the age test is wrong, files can be copied back from the snapshot.',
    'Share level actions, such as a snapshot or a quota change, are made through the REST API or the management plane. The mount is for reading and writing files.',
    'The order is the design: snapshot, then list, then delete. A failed snapshot call ends the run before the list.',
    'Delete by the file\'s own last modified time, in UTC, and test the rule on a copy before the first real run.',
    'Snapshots are not free and not kept for ever by default. Delete old snapshots on a schedule too, or they fill the quota you were trying to free.',
  ],
  solution: `
1. **Scheduler**, cron \`0 0 3 ? * SUN\`.
2. **Set Payload** empty, **HTTP Request** PUT \`/telemetry?restype=share&comp=snapshot\` with \`x-ms-version\`. The response header \`x-ms-snapshot\` names the snapshot: log it.
3. **File List** \`/mnt/telemetry/archive\`, \`*.csv\`.
4. **For Each** file: **Choice** older than 30 days, **File Delete** its path.

**A dry run.** Add a property that switches the delete for a Logger, and run it once to see the list.

**Large folders.** Thousands of files in one list is fine; millions is not. Split the archive into dated subfolders so the purge deletes whole old folders.
`,
  followUps: [
    {
      q: 'How would you restore one file from the snapshot?',
      a: 'A snapshot appears as a read only version of the share. On Windows it shows under Previous Versions; over REST a GET with the sharesnapshot query parameter reads the file as it was. Copy it back into the live share.',
    },
    {
      q: 'Could a storage lifecycle policy do this purge?',
      a: 'Lifecycle management rules are a Blob Storage feature. For Azure Files, check what your account offers today; otherwise a scheduled job like this one is the usual answer.',
    },
  ],
}
