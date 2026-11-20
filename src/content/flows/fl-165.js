import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const blob = (name, lastModified) => ({ name: `recordings/${name}`, lastModified })
const listing = [blob('2026/07/CALL-118201.mp3', '2026-07-02T11:04:00Z'), blob('2026/08/CALL-120554.mp3', '2026-08-01T09:12:00Z'), blob('2026/11/CALL-131870.mp3', '2026-11-10T15:40:00Z')]

export default {
  id: 'fl-165',
  category: 'flows',
  title: 'Call Recordings Kept for 90 Days: Delete Older Blobs From Azure Blob Storage Every Night',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-blob', 'retention', 'delete', 'scheduler', 'gdpr'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The clean up runs on a Scheduler', rule: { type: 'source', component: 'scheduler' } },
    { label: 'The recordings in call-recordings are listed', rule: { type: 'exists', component: 'azure-list-blobs', where: { containerName: 'call-recordings', blobPath: 'recordings/' } } },
    { label: 'Each blob is looked at in a For Each', rule: { type: 'before', first: 'azure-list-blobs', then: 'foreach' } },
    { label: 'A blob is deleted only when it is older than 90 days', rule: { type: 'inside', component: 'azure-delete-blob', within: 'choice', where: { container: 'call-recordings' } } },
  ],
  simulation: {
    systems: { calls: { 'azure-list-blobs': { payload: listing }, 'azure-delete-blob': { payload: true } } },
    tests: [
      {
        name: 'Two old recordings and a new one',
        about: 'On 13 November, the July and early August recordings are past 90 days and are deleted. The one from last week is kept.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          connector: [
            { type: 'azure-delete-blob', count: 2 },
            { type: 'azure-delete-blob', settings: { fileName: 'recordings/2026/07/CALL-118201.mp3' }, count: 1 },
            { type: 'azure-delete-blob', settings: { fileName: 'recordings/2026/11/CALL-131870.mp3' }, count: 0 },
          ],
        },
      },
      {
        name: 'Nothing is old enough',
        about: 'Only recent recordings are listed, so nothing is deleted.',
        trigger: { schedule: {} },
        overrides: { systems: { calls: { 'azure-list-blobs': { payload: [listing[2]] } } } },
        expect: { noError: true, connector: [{ type: 'azure-delete-blob', count: 0 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('delete-old-call-recordings', source('scheduler', { strategy: 'cron', expression: '0 15 3 * * ?' }), [
      step('azure-list-blobs', { containerName: 'call-recordings', blobPath: 'recordings/' }),
      scope('foreach', { collection: '#[payload]' }, [
        router(
          'choice',
          {},
          [
            route({ expression: '#[daysBetween((payload.lastModified as DateTime) as Date, now() as Date) > 90]' }, [
              step('logger', { level: 'INFO', message: '#["Deleting " ++ payload.name ++ ", last modified " ++ payload.lastModified]' }),
              step('azure-delete-blob', { container: 'call-recordings', fileName: '#[payload.name]' }),
            ]),
          ],
          { otherwise: [] },
        ),
      ]),
    ]),
  ),
  description: `
Lantern Mobile, a fictional phone company, records support calls. The recordings are kept in the Azure Blob Storage container \`call-recordings\` under \`recordings/{yyyy}/{MM}/\`. Its privacy notice says calls are kept for **90 days**. An audit found recordings from two years ago.

In this scenario, List Blobs gives each blob as \`{ "name": "recordings/2026/07/CALL-118201.mp3", "lastModified": "2026-07-02T11:04:00Z" }\`.

**Requirements**
- Every night, list the blobs under \`recordings/\` in \`call-recordings\`.
- Delete each recording last modified **more than 90 days** ago.
- Keep everything else.

**Facts**
- Age is counted in whole days, from the date of \`lastModified\` to today's date. In the tests, today is 13 November 2026.
- Delete Blob takes the blob's full \`name\` as listed.

**Design the flow.**
`,
  answerTemplate: `## Listing the recordings

## Deciding what is old

## Deleting
`,
  keyPoints: [
    'List Blobs with a prefix returns the blobs whose names start with it, across the "folders" below it.',
    'For Each over the list, and a Choice on the age of each blob, with only the old ones deleted.',
    'daysBetween gives whole days between two dates, so the rule reads like the policy.',
    'Delete is permanent unless soft delete is on for the storage account. Test the rule on a copy first, and log each name you delete.',
    'Azure lifecycle management rules can delete blobs by age without any code. Mule earns its place when the rule depends on business data, such as a recording under a legal hold.',
  ],
  solution: `
1. **Scheduler**, cron \`0 15 3 * * ?\`, at night when nobody listens to recordings.
2. **List Blobs**: container \`call-recordings\`, folder \`recordings/\`.
3. **For Each** blob:
   - **Choice** \`#[daysBetween((payload.lastModified as DateTime) as Date, now() as Date) > 90]\`: an INFO log with the name, then **Delete Blob** \`#[payload.name]\`. The log comes first because the delete replaces the payload.

**Many blobs.** A large container returns its list in pages. Check how your connector version pages the listing, and stay within what one run can delete.

**Legal holds.** Before deleting, check the call ID against the complaints system's list of holds, and keep those recordings.
`,
  followUps: [
    {
      q: 'Why not let a storage lifecycle rule do this?',
      a: 'For a flat 90 days, a lifecycle rule is the better choice: no code to run or watch. Use Mule when some recordings must be kept longer for a business reason the storage account cannot see.',
    },
    {
      q: 'The job fails half way. Is the next run safe?',
      a: 'Yes. It lists again and deletes what is still old. Deleting is safe to repeat, and blobs already gone are not listed.',
    },
  ],
}
