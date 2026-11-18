import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const name = 'WAVE_DC-EAST_20261113_0600.dat'
const file = `/plan/out/waves/${name}`
const wave = 'WV0600|DC-EAST|20261113\nLN|0412|4410021|000048\nLN|0415|4410187|000012\nEND|2'

export default {
  id: 'fl-208',
  category: 'flows',
  title: 'Relaying Wave Plans From the Planning Platform\'s FTP Server to the WMS FTP Server: Pass the Bytes Through, Hide the File Until It Is Whole, and Archive the Source Last',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'relay', 'binary-mode', 'temp-file', 'plans', 'wms'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Wave files are picked up from /plan/out/waves once their size is stable', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/plan/out/waves', timeBetweenSizeCheck: { gte: 1 } } } },
    {
      label: 'The WMS copy is written to /wms/in/waves under a .part name, unchanged (no Transform)',
      rule: { type: 'all', rules: [{ type: 'exists', component: 'ftp-write', where: { path: { all: ['/wms/in/waves/', '.part'] } } }, { type: 'absent', component: 'transform' }] },
    },
    { label: 'The .part file is renamed once the write is done', rule: { type: 'before', first: 'ftp-write', then: 'ftp-rename' } },
    { label: 'The source file is archived only after the rename', rule: { type: 'before', first: 'ftp-rename', then: 'ftp-move', thenWhere: { targetPath: '/plan/out/waves/archive' } } },
    { label: 'An empty file goes to /plan/out/waves/empty and is not relayed', rule: { type: 'inside', component: 'ftp-move', within: 'choice', routeWhere: { expression: 'size' }, where: { targetPath: '/plan/out/waves/empty' } } },
  ],
  simulation: {
    systems: { files: { [file]: wave } },
    tests: [
      {
        name: 'A wave file',
        about: 'The WMS gets the file byte for byte under its own name, no .part file is left behind, and the source is archived.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          files: { [`/wms/in/waves/${name}`]: { exists: true, has: 'LN|0415|4410187|000012' }, '/wms/in/waves/*.part': { count: 0 }, [`/plan/out/waves/archive/${name}`]: { exists: true } },
        },
      },
      {
        name: 'An empty file',
        about: 'A run with nothing to pick gave an empty file. It goes to the empty folder and the WMS never sees it.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: '' } } },
        expect: { files: { [`/plan/out/waves/empty/${name}`]: { exists: true }, '/wms/in/waves/*': { count: 0 } } },
      },
      {
        name: 'The WMS FTP server is down',
        about: 'The write fails. The source file stays in /plan/out/waves, so the next poll sends it once the WMS server is back.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: { error: 'FTP:CONNECTIVITY', files: { [file]: { exists: true }, [`/plan/out/waves/archive/${name}`]: { exists: false } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'wave-relay-to-wms',
      source('ftp-listener', { directory: '/plan/out/waves', matcher: 'WAVE_*.dat', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[attributes.size == 0]' }, [
              step('logger', { level: 'WARN', message: '#["Empty wave file " ++ vars.fileName]' }),
              step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/plan/out/waves/empty', overwrite: 'true' }),
            ]),
          ],
          {
            otherwise: [
              step('ftp-write', { path: '#["/wms/in/waves/" ++ vars.fileName ++ ".part"]', mode: 'OVERWRITE' }),
              step('ftp-rename', { path: '#["/wms/in/waves/" ++ vars.fileName ++ ".part"]', to: '#[vars.fileName]' }),
              step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/plan/out/waves/archive', overwrite: 'true' }),
            ],
          },
        ),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, gets pick wave plans from the planning platform four times a day. The platform writes them to **its FTP server**, folder \`/plan/out/waves\`, as \`WAVE_<dc>_<date>_<time>.dat\`. The warehouse system (WMS) reads waves only from **its own FTP server**, folder \`/wms/in/waves\`, and picks up any file there at once.

The \`.dat\` format belongs to the WMS vendor. Nobody at Larkfield should change it: Mule only carries it across.

Things that went wrong with the old script:
- The WMS read a wave while the copy was still running, and picked half a wave.
- A run with nothing to pick left an empty file, and the WMS raised an alarm for it.
- The script deleted the source before the copy worked, and a wave was lost.

**Requirements**
- Pick up each wave once the platform has finished writing it.
- Relay it unchanged. The WMS must never see a partial file.
- Archive the source only after the WMS copy is complete.
- Move an empty file to \`/plan/out/waves/empty\` instead of relaying it.

**Design the flow.** Mention the FTP settings that keep the bytes unchanged.
`,
  answerTemplate: `## Picking up a wave

## Carrying the bytes across

## Hiding the file until it is whole

## Empty files and failures
`,
  keyPoints: [
    'No Transform: the payload goes from read to write as it came. A DataWeave step could change encoding or line endings.',
    'Binary transfer mode on both FTP configs. ASCII mode may rewrite line endings, which breaks fixed formats.',
    'Write .part, then rename. The WMS ignores names that do not match its pattern.',
    'Archive the source last. Any failure before that leaves the source in place for the next poll.',
    'attributes.size tells an empty file without reading it.',
  ],
  solution: `
1. **FTP On New or Updated File** (planning platform FTP config) on \`/plan/out/waves\`, \`WAVE_*.dat\`, size check wait 10 seconds, after reading: none.
2. **Set Variable** \`filePath\` and \`fileName\`.
3. **Choice**:
   - \`attributes.size == 0\`: WARN log, **FTP Move** to \`/plan/out/waves/empty\`.
   - Otherwise: **FTP Write** (WMS FTP config) \`/wms/in/waves/<name>.part\`, **FTP Rename** to \`<name>\`, **FTP Move** the source to \`/plan/out/waves/archive\`.

Two FTP configs, one per server, both in passive mode and binary transfer.

**Streaming.** Waves are small. For large files, a repeatable file store stream keeps memory flat while the bytes pass through.
`,
  followUps: [
    {
      q: 'The rename succeeds but the archive move fails. What happens next?',
      a: 'The next poll relays the wave again. The WMS gets it twice, so it must ignore a wave ID it already has, or the flow can check the WMS folder or a log table first.',
    },
    {
      q: 'Why not use FTP Copy between the two servers?',
      a: 'Copy works within one connection, on one server. Two servers need a read from one config and a write through the other.',
    },
  ],
}
