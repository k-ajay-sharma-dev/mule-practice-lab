import { design, flow, source, step } from '../../flow/dsl.js'

const sales = 'store,sku,business_date,units,net_sales\n0412,4410021,2026-11-12,3,11.97\n0412,4410187,2026-11-12,1,5.49'
const inPath = '/mnt/scm-share/sales/in/SALES_0412_20261112.csv'

export default {
  id: 'fl-175',
  category: 'flows',
  title: 'Store Sales From a Mounted Azure File Share to the Planning Platform\'s SFTP Server, Archived Only After the Upload Worked',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'smb', 'sftp', 'file-listener', 'archive', 'retail', 'planning'],
  estMinutes: 15,
  flowChecks: [
    { label: 'Sales files are picked up from /mnt/scm-share/sales/in', rule: { type: 'source', component: 'file-listener', where: { directory: '/mnt/scm-share/sales/in' } } },
    { label: 'The listener waits until the file size stops changing', rule: { type: 'source', component: 'file-listener', where: { timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'The file is written to the planning platform\'s /inbound/sales folder', rule: { type: 'exists', component: 'sftp-write', where: { path: '/inbound/sales/' } } },
    {
      label: 'The file is archived on the share only after the SFTP write',
      rule: { type: 'before', first: 'sftp-write', then: 'file-move', thenWhere: { targetPath: 'archive' }, outside: true },
    },
  ],
  simulation: {
    systems: { files: { [inPath]: sales } },
    tests: [
      {
        name: 'A store sends its sales',
        about: 'The file reaches the planning platform with the same name, and leaves the in folder for the archive.',
        trigger: { file: { path: inPath } },
        expect: {
          noError: true,
          files: {
            '/inbound/sales/SALES_0412_20261112.csv': { exists: true, has: '4410187' },
            [inPath]: { exists: false },
            '/mnt/scm-share/sales/archive/*SALES_0412_20261112*': { count: 1 },
          },
        },
      },
      {
        name: 'The planning platform SFTP server is down',
        about: 'The upload fails. The file stays in the in folder, so it is sent on a later poll, and nothing is archived.',
        trigger: { file: { path: inPath } },
        overrides: { systems: { files: { fault: true, faultOn: 'sftp' } } },
        expect: { error: 'SFTP:CONNECTIVITY', files: { [inPath]: { exists: true }, '/mnt/scm-share/sales/archive/*': { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-sales-to-planning',
      source('file-listener', { directory: '/mnt/scm-share/sales/in', matcher: 'SALES_*.csv', postAction: 'none', timeBetweenSizeCheck: 5000, watermarkMode: 'DISABLED' }),
      [
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('sftp-write', { path: '#["/inbound/sales/" ++ vars.fileName]', mode: 'OVERWRITE' }),
        step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/mnt/scm-share/sales/archive' }),
        step('logger', { level: 'INFO', message: '#["Sales file " ++ vars.fileName ++ " sent to the planning platform"]' }),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, sends daily store sales to the planning platform, which forecasts demand and plans replenishment. Each night the point of sale system writes one CSV a store to an **Azure File Share**. The share is mounted over SMB on the integration host at \`/mnt/scm-share\`, so Mule sees it as a local folder.

A file looks like \`SALES_0412_20261112.csv\`:

\`\`\`
store,sku,business_date,units,net_sales
0412,4410021,2026-11-12,3,11.97
\`\`\`

The planning platform takes files only from its own SFTP server, in the folder \`/inbound/sales\`, with the name unchanged.

The point of sale export copies large stores' files slowly. Last month a half copied file was sent, and the platform planned a quiet day for a busy store.

**Requirements**
- Pick up each \`SALES_*.csv\` from \`/mnt/scm-share/sales/in\`, and never a file that is still being copied.
- Write it, unchanged, to \`/inbound/sales\` on the planning platform's SFTP server.
- Move it to \`/mnt/scm-share/sales/archive\` only once the upload worked. If the upload fails, leave it where it is.

**Design the flow.**
`,
  answerTemplate: `## Reading from the share

## Half copied files

## Sending and archiving

## When the upload fails
`,
  keyPoints: [
    'A share mounted over SMB is a folder to Mule. The File connector reads it like a local disk, so the mount must exist on every host that runs the app.',
    'timeBetweenSizeCheck makes the listener compare the size twice before it reads. A file still growing is left for a later poll.',
    'The archive is a move done by the flow after the write, not the listener\'s own post action. A post action can also run when the flow fails, so check that setting before you rely on it.',
    'Write the file unchanged. A Transform could change quoting or line endings, and the platform checks the layout.',
    'If the SFTP write fails, the flow stops before the move, so the file stays in the in folder and is tried again.',
  ],
  solution: `
1. **File On New or Updated File** on \`/mnt/scm-share/sales/in\`, pattern \`SALES_*.csv\`, size check wait 5 seconds, no post action.
2. **Set Variable** \`fileName\` and \`filePath\` from the attributes.
3. **SFTP Write** to \`#["/inbound/sales/" ++ vars.fileName]\`.
4. **File Move** \`vars.filePath\` to \`/mnt/scm-share/sales/archive\`.
5. **Logger** INFO.

**Why not the listener's move.** The listener can move or delete a file after the flow, but by default that can happen even when the flow failed. A move as the last step only runs after the upload worked.

**The mount.** Mount the share with a storage account identity or key held by the host, never in the app. A Linux host mounts it with CIFS, a Windows host maps it as a drive. If the mount drops, the listener sees an empty or missing folder, so alert on that.
`,
  followUps: [
    {
      q: 'The app moves to CloudHub. What breaks?',
      a: 'CloudHub workers cannot mount an SMB share. Either keep this flow on a host that can, or read the share through the File Share REST API instead of the File connector.',
    },
    {
      q: 'Two files for the same store arrive, the second a correction. What happens?',
      a: 'Both are sent in turn, and the second overwrites the first on the SFTP server because the name is the same. Agree with the platform team whether that is what they want, or add a version to the name.',
    },
  ],
}
