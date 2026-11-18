export default {
  id: 'dw-166',
  category: 'dataweave',
  title: 'Parse an Azure Files Directory Listing into Files to Pick, Folders and a Next Marker',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'xml', 'list-directory', 'pagination', 'multi-value-selector', 'json'],
  estMinutes: 20,
  description: `
Ostrander Clinics polls an Azure file share over the REST API. The List Directories and Files call returns one page of a directory as XML: files and sub directories at that level, and a \`NextMarker\` when more entries remain.

Turn one page into JSON:

- \`share\`: the \`ShareName\` attribute of the root element
- \`path\`: the \`DirectoryPath\` attribute of the root element
- \`directories\`: the \`Name\` of each \`Directory\` entry, in order
- \`files\`: one entry per \`File\`, in order, with \`name\` and \`sizeBytes\` (a number from \`Properties/Content-Length\`)
- \`toPick\`: the names of files that end with \`.csv\` and are larger than zero bytes. Upload tools leave temporary names such as \`.part\`, and an empty file is not ready.
- \`nextMarker\`: the \`NextMarker\` text, or \`null\` when it is empty or missing
- \`morePages\`: \`true\` when there is a next marker

A page always has at least one entry here.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://ostranderlabs.file.core.windows.net/" ShareName="lab-drop" DirectoryPath="results/2026-11-18">
  <MaxResults>5</MaxResults>
  <Entries>
    <File>
      <Name>run-0418.csv</Name>
      <Properties>
        <Content-Length>52480</Content-Length>
      </Properties>
    </File>
    <File>
      <Name>run-0419.csv.part</Name>
      <Properties>
        <Content-Length>16384</Content-Length>
      </Properties>
    </File>
    <Directory>
      <Name>rejected</Name>
    </Directory>
    <File>
      <Name>run-0420.csv</Name>
      <Properties>
        <Content-Length>0</Content-Length>
      </Properties>
    </File>
    <File>
      <Name>run-0421.csv</Name>
      <Properties>
        <Content-Length>49012</Content-Length>
      </Properties>
    </File>
  </Entries>
  <NextMarker>2!64!MDAwMDE2IXJ1bi0wNDIyLmNzdg--</NextMarker>
</EnumerationResults>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "share": "lab-drop",
  "path": "results/2026-11-18",
  "directories": ["rejected"],
  "files": [
    { "name": "run-0418.csv", "sizeBytes": 52480 },
    { "name": "run-0419.csv.part", "sizeBytes": 16384 },
    { "name": "run-0420.csv", "sizeBytes": 0 },
    { "name": "run-0421.csv", "sizeBytes": 49012 }
  ],
  "toPick": ["run-0418.csv", "run-0421.csv"],
  "nextMarker": "2!64!MDAwMDE2IXJ1bi0wNDIyLmNzdg--",
  "morePages": true
}`,
  },
  starterCode: `%dw 2.0
output application/json
var root = payload.EnumerationResults
---
{
  share: root.@ShareName,
  files: root.Entries.File map { name: $.Name }
}
`,
  hints: [
    '`root.Entries.File` returns only the first File. The multi value selector `root.Entries.*File` returns all of them.',
    'A page may have files and no directories. `*Directory` then gives null, so add `default []` before `map`.',
    'Element names with a dash need quotes: `f.Properties."Content-Length"`.',
    'Build the `files` list once in a `var`, then filter it for `toPick` with `endsWith ".csv"` and a size check.',
    'An empty `NextMarker` element may read as an empty string or as null. `isEmpty` is true for both.',
  ],
  solution: `%dw 2.0
output application/json
var root = payload.EnumerationResults
var marker = root.NextMarker
var files = (root.Entries.*File default []) map (f) -> {
  name: f.Name,
  sizeBytes: f.Properties."Content-Length" as Number
}
---
{
  share: root.@ShareName,
  path: root.@DirectoryPath,
  directories: (root.Entries.*Directory default []) map $.Name,
  files: files,
  toPick: (files filter (f) -> (f.name endsWith ".csv") and f.sizeBytes > 0) map $.name,
  nextMarker: if (isEmpty(marker)) null else marker,
  morePages: not isEmpty(marker)
}`,
  explanation: `
**Files and directories mixed.** Azure Files returns both kinds of entry under \`Entries\`, in name order. The multi value selectors \`*File\` and \`*Directory\` pick each kind as a list. Without the star, only the first match comes back, a bug that hides while a page has one file.

**One level only.** The listing covers one directory. \`rejected\` is a real sub directory. To see its files, the flow lists it with its own call.

**Choosing files.** The name check drops temporary upload names such as \`.csv.part\`. The size check drops empty files, which often mean the writer has created the file but not written to it yet. Neither check proves the file is complete, so many teams add a control file from the writer as well.

**Paging.** At most a set number of entries come back per call. A non empty \`NextMarker\` means the flow must call again, passing it as the \`marker\` query parameter. The last page has an empty marker.
`,
  tests: [
    {
      name: 'Last page with only directories',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<?xml version="1.0" encoding="utf-8"?><EnumerationResults ShareName="lab-drop" DirectoryPath="results"><Entries><Directory><Name>2026-11-17</Name></Directory><Directory><Name>2026-11-18</Name></Directory></Entries><NextMarker /></EnumerationResults>',
        },
      ],
      expected: '{ "share": "lab-drop", "path": "results", "directories": ["2026-11-17", "2026-11-18"], "files": [], "toPick": [], "nextMarker": null, "morePages": false }',
    },
    {
      name: 'One file in upper case',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<?xml version="1.0" encoding="utf-8"?><EnumerationResults ShareName="lab-drop" DirectoryPath="x"><Entries><File><Name>RUN-1.CSV</Name><Properties><Content-Length>10</Content-Length></Properties></File></Entries><NextMarker/></EnumerationResults>',
        },
      ],
      expected: '{ "share": "lab-drop", "path": "x", "directories": [], "files": [{ "name": "RUN-1.CSV", "sizeBytes": 10 }], "toPick": [], "nextMarker": null, "morePages": false }',
    },
  ],
  followUps: [
    {
      q: 'The second test drops RUN-1.CSV. Is that what you want?',
      a: 'Probably not. Compare with lower(f.name) so the extension check ignores case, after agreeing the naming rules with the sender.',
    },
    {
      q: 'How would a flow walk every sub directory?',
      a: 'Keep a list of directories to visit. List each one, collect its files, and add its sub directories to the list, with a depth limit to stay safe.',
    },
    {
      q: 'Can the listing show when a file was last written?',
      a: 'Newer API versions can include timestamps in the listing on request. Otherwise a properties call per file returns them, which costs one request each.',
    },
  ],
}
