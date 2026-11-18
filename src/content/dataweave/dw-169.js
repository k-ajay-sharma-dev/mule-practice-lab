export default {
  id: 'dw-169',
  category: 'dataweave',
  title: 'Match Store Data Files With Their Control Files on an Azure File Share',
  level: 'EXPERT',
  tags: ['myproject', 'azure-file-share', 'planning-platform', 'control-files', 'file-names', 'dynamic-keys', 'multiple-inputs', 'json'],
  estMinutes: 35,
  description: `
Marrow & Pine Home stores write inventory files to an Azure file share for the planning platform. Each store first writes a data file named \`INV_<store>_<yyyyMMdd>_<seq>.dat\`, for example \`INV_S0412_20261117_003.dat\`, where the store is \`S\` and four digits and the sequence has three digits. When the data file is complete, the store writes a control file with the same name and the \`.ctl\` extension. The control file holds \`records=N;bytes=N\`.

A Mule poller lists the share and reads every control file. Decide what to do with each file.

**Inputs**
- \`payload.files\`: the listing, each with \`name\` and \`sizeBytes\`
- \`vars.controls\`: each control file with \`name\` and \`content\`
- \`vars.processed\`: names of data files already sent

**Rules for each data file, first match wins**
1. Its name is in \`processed\`: **alreadyProcessed**
2. No control file with the same base name: **waiting**
3. The control \`bytes\` differs from \`sizeBytes\`: **mismatched**
4. Otherwise: **ready**

A name that is neither a valid data file name nor a \`.ctl\` file is **ignored**. A control file whose data file is not in the listing is an **orphan control**.

**Output**
- \`ready\`: sorted by file name, each with \`file\`, \`store\`, \`businessDate\` (\`yyyy-MM-dd\`), \`seq\` (a number) and \`records\` (from the control file)
- \`waiting\`, \`alreadyProcessed\`, \`orphanControls\`, \`ignored\`: names in listing order
- \`mismatched\`: in listing order, each with \`file\`, \`expectedBytes\` and \`actualBytes\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "files": [
    { "name": "INV_S0415_20261117_001.dat", "sizeBytes": 61002 },
    { "name": "INV_S0415_20261117_001.ctl", "sizeBytes": 24 },
    { "name": "INV_S0412_20261117_003.dat", "sizeBytes": 58210 },
    { "name": "INV_S0412_20261117_003.ctl", "sizeBytes": 24 },
    { "name": "INV_S0419_20261117_002.dat", "sizeBytes": 40960 },
    { "name": "INV_S0411_20261117_007.dat", "sizeBytes": 1200 },
    { "name": "INV_S0411_20261117_007.ctl", "sizeBytes": 23 },
    { "name": "INV_S0412_20261116_002.dat", "sizeBytes": 57000 },
    { "name": "INV_S0412_20261116_002.ctl", "sizeBytes": 24 },
    { "name": "INV_S0420_20261117_001.ctl", "sizeBytes": 20 },
    { "name": "Thumbs.db", "sizeBytes": 4096 }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "controls": [
    { "name": "INV_S0415_20261117_001.ctl", "content": "records=1302;bytes=61002" },
    { "name": "INV_S0412_20261117_003.ctl", "content": "records=1240;bytes=58210" },
    { "name": "INV_S0411_20261117_007.ctl", "content": "records=702;bytes=33100" },
    { "name": "INV_S0412_20261116_002.ctl", "content": "records=1221;bytes=57000" },
    { "name": "INV_S0420_20261117_001.ctl", "content": "records=10;bytes=480" }
  ],
  "processed": ["INV_S0412_20261116_002.dat"]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "ready": [
    { "file": "INV_S0412_20261117_003.dat", "store": "S0412", "businessDate": "2026-11-17", "seq": 3, "records": 1240 },
    { "file": "INV_S0415_20261117_001.dat", "store": "S0415", "businessDate": "2026-11-17", "seq": 1, "records": 1302 }
  ],
  "waiting": ["INV_S0419_20261117_002.dat"],
  "mismatched": [
    { "file": "INV_S0411_20261117_007.dat", "expectedBytes": 33100, "actualBytes": 1200 }
  ],
  "alreadyProcessed": ["INV_S0412_20261116_002.dat"],
  "orphanControls": ["INV_S0420_20261117_001.ctl"],
  "ignored": ["Thumbs.db"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var listing = payload.files
---
{
  ready: listing filter ($.name endsWith ".dat") map $.name,
  ignored: []
}
`,
  hints: [
    'Give every listed name a kind first: `"data"` when it matches `/INV_S\\d{4}_\\d{8}_\\d{3}\\.dat/`, `"control"` when it ends with `.ctl`, else `"other"`. Each output list then filters on the kind.',
    '`substringBeforeLast(name, ".")` from `dw::core::Strings` gives the base name shared by a data file and its control file.',
    'Parse a control file into an object with dynamic keys: `{ ((text splitBy ";") map (kv) -> do { var p = kv splitBy "=" --- { (p[0]): p[1] as Number } }) }`.',
    'Turn the controls into one lookup object keyed by base name, then `controls[base]` is null when there is no control file.',
    'Work out a `state` for each data file in one `if ... else if` chain, so the order of the rules is in one place.',
  ],
  solution: `%dw 2.0
import substringBeforeLast from dw::core::Strings
output application/json
var listing = payload.files

fun kindOf(name) =
  if (name matches /INV_S\\d{4}_\\d{8}_\\d{3}\\.dat/) "data"
  else if (name endsWith ".ctl") "control"
  else "other"

fun baseOf(name) = substringBeforeLast(name, ".")

fun parseControl(text) = {
  ((text splitBy ";") map (kv) -> do {
    var p = kv splitBy "="
    ---
    { (p[0]): p[1] as Number }
  })
}

var controls = { (vars.controls map (c) -> { (baseOf(c.name)): parseControl(c.content) }) }

var dataFiles = listing filter (kindOf($.name) == "data")
var dataBases = dataFiles map (baseOf($.name))

var checked = dataFiles map (f) -> do {
  var b = baseOf(f.name)
  var parts = b splitBy "_"
  var ctl = controls[b]
  ---
  {
    file: f.name,
    store: parts[1],
    businessDate: parts[2] as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"},
    seq: parts[3] as Number,
    actualBytes: f.sizeBytes,
    expectedBytes: ctl.bytes,
    records: ctl.records,
    state:
      if (vars.processed contains f.name) "processed"
      else if (ctl == null) "waiting"
      else if (ctl.bytes != f.sizeBytes) "mismatch"
      else "ready"
  }
}

fun inState(s) = checked filter ($.state == s)
---
{
  ready: (inState("ready") orderBy $.file) map (c) -> {
    file: c.file,
    store: c.store,
    businessDate: c.businessDate,
    seq: c.seq,
    records: c.records
  },
  waiting: inState("waiting") map $.file,
  mismatched: inState("mismatch") map (c) -> {
    file: c.file,
    expectedBytes: c.expectedBytes,
    actualBytes: c.actualBytes
  },
  alreadyProcessed: inState("processed") map $.file,
  orphanControls: (listing filter (f) -> kindOf(f.name) == "control" and (dataBases contains baseOf(f.name)) == false) map $.name,
  ignored: (listing filter (kindOf($.name) == "other")) map $.name
}`,
  explanation: `
**Name first, then state.** Every name gets a kind: data, control or other. A strict pattern for data files keeps stray files, such as \`Thumbs.db\` or a misnamed upload, out of the planning feed.

**One lookup for controls.** The control files become one object keyed by base name. Each data file then finds its control with \`controls[b]\`, with no search through a list per file. A missing key gives null, which is how a waiting file shows up.

**Parsing key=value text.** Splitting on \`;\` and then on \`=\` turns \`records=1240;bytes=58210\` into an object. Dynamic keys keep the parser open to new fields the stores may add.

**Rule order in one place.** The \`state\` chain encodes the rules in the order the business set. A processed file stays processed even if its control file changed, so a resend is never sent twice by accident.

**The control file as a contract.** A data file shorter than the control says is still being written or was cut short. Here \`INV_S0411\` is 1,200 bytes against 33,100 expected, so it is held, not sent.

**Sorted ready list.** Sorting by name orders by store, then date, then sequence, because every part has a fixed width. The planning platform gets each store's files in the order they were made.
`,
  tests: [
    {
      name: 'Empty share',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "files": [] }' },
        { name: 'vars', mime: 'application/json', content: '{ "controls": [], "processed": [] }' },
      ],
      expected: '{ "ready": [], "waiting": [], "mismatched": [], "alreadyProcessed": [], "orphanControls": [], "ignored": [] }',
    },
    {
      name: 'A misnamed file and a processed file with no control',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "files": [{ "name": "INV_S412_20261117_1.dat", "sizeBytes": 900 }, { "name": "INV_S0430_20261118_001.dat", "sizeBytes": 512 }, { "name": "INV_S0430_20261118_001.ctl", "sizeBytes": 22 }, { "name": "INV_S0431_20261117_009.dat", "sizeBytes": 700 }] }',
        },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "controls": [{ "name": "INV_S0430_20261118_001.ctl", "content": "records=8;bytes=512" }], "processed": ["INV_S0431_20261117_009.dat"] }',
        },
      ],
      expected:
        '{ "ready": [{ "file": "INV_S0430_20261118_001.dat", "store": "S0430", "businessDate": "2026-11-18", "seq": 1, "records": 8 }], "waiting": [], "mismatched": [], "alreadyProcessed": ["INV_S0431_20261117_009.dat"], "orphanControls": [], "ignored": ["INV_S412_20261117_1.dat"] }',
    },
  ],
  followUps: [
    {
      q: 'Why check bytes and not only that the control file exists?',
      a: 'A store system can write the control file before the data upload finishes, or a copy can be cut short. The size check catches both.',
    },
    {
      q: 'How long would you leave a file in waiting before alerting?',
      a: 'Agree a grace period with the store team, such as 30 minutes, and alert after that. A file that never gets a control usually means a failed export.',
    },
    {
      q: 'Where would you also use the records value?',
      a: 'After reading the data file, count its detail lines and compare with records. Bytes catch a short file, while the count catches a file with the right size but wrong content.',
    },
  ],
}
