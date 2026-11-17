export default {
  id: 'dw-132',
  category: 'dataweave',
  title: "Show Parcel Scans in Each Depot's Local Time",
  level: 'INTERMEDIATE',
  tags: ['dates', 'time-zones', 'datetime', 'format', 'logistics', 'json'],
  estMinutes: 20,
  description: `
Larkspur Freight runs depots in Sydney, London and New York. Every parcel scan is stored in UTC. The depot managers want to see scans in their own local time, and to know which scans happened outside working hours.

Each scan names its depot's time zone as a region id, such as \`Europe/London\`. A region id knows about summer time, so the offset from UTC can change during the year.

Output one object per scan with:

- \`scanId\`: copied from the input
- \`localTime\`: the local date and time as \`yyyy-MM-dd HH:mm\`
- \`afterHours\`: \`true\` when the local hour is before 7 or from 19 onwards

Some scanners send a time with an offset instead of \`Z\`. Treat it as the same moment in time.

\`>>\` keeps the same moment and changes the time zone it is shown in: \`dateTime >> "Europe/London"\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "scanId": "S-5501", "scannedAt": "2026-11-17T22:30:00Z", "depotZone": "Australia/Sydney" },
  { "scanId": "S-5502", "scannedAt": "2026-11-17T22:30:00Z", "depotZone": "Europe/London" },
  { "scanId": "S-5503", "scannedAt": "2026-11-17T03:15:00Z", "depotZone": "America/New_York" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "scanId": "S-5501", "localTime": "2026-11-18 09:30", "afterHours": false },
  { "scanId": "S-5502", "localTime": "2026-11-17 22:30", "afterHours": true },
  { "scanId": "S-5503", "localTime": "2026-11-16 22:15", "afterHours": true }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (scan) -> {
  scanId: scan.scanId,
  localTime: scan.scannedAt,
  afterHours: false
}
`,
  hints: [
    'The input is JSON, so `scannedAt` is a String. Turn it into a DateTime first with `scan.scannedAt as DateTime`.',
    'Shift it with `>> scan.depotZone`. Wrap the left side in brackets so the `as` happens first.',
    'Format the result with `as String {format: "yyyy-MM-dd HH:mm"}`.',
    'A DateTime has a `.hour` selector. Use it on the shifted value, not the UTC one.',
  ],
  solution: `%dw 2.0
output application/json
---
payload map (scan) -> do {
  var local = (scan.scannedAt as DateTime) >> scan.depotZone
  ---
  {
    scanId: scan.scanId,
    localTime: local as String {format: "yyyy-MM-dd HH:mm"},
    afterHours: local.hour < 7 or local.hour >= 19
  }
}`,
  explanation: `
**Same moment, other clock.** \`>>\` does not add or remove time. It shows the same moment on another zone's clock. 22:30 UTC on 17 November is 09:30 the next morning in Sydney, 22:30 in London and 17:30 in New York.

**Summer time.** In November, Sydney is on summer time, 11 hours ahead of UTC, and London is on UTC. In July it is the other way round: London is 1 hour ahead and Sydney is 10 hours ahead. A region id knows these rules. A fixed offset such as \`+10:00\` would be wrong for half of the year.

**The date can change.** S-5501 moves to the 18th and S-5503 moves back to the 16th. A daily report must group by the local date, not the UTC date, or a night shift is split across two days.

**After hours.** \`.hour\` reads the hour on the shifted clock. Read it before the shift and every depot would use UTC hours.

**Offsets in the input.** \`"2026-11-17T10:00:00+05:30"\` is 04:30 UTC. \`as DateTime\` keeps the offset, and \`>>\` works from the moment, so the result is right whatever offset the scanner used.
`,
  tests: [
    {
      name: 'Summer in London, winter in Sydney',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "scanId": "S-1", "scannedAt": "2026-07-01T06:30:00Z", "depotZone": "Europe/London" }, { "scanId": "S-2", "scannedAt": "2026-07-01T06:30:00Z", "depotZone": "Australia/Sydney" }]',
        },
      ],
      expected: '[{ "scanId": "S-1", "localTime": "2026-07-01 07:30", "afterHours": false }, { "scanId": "S-2", "localTime": "2026-07-01 16:30", "afterHours": false }]',
    },
    {
      name: 'A scanner that sends an offset',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "scanId": "S-3", "scannedAt": "2026-11-17T10:00:00+05:30", "depotZone": "Europe/London" }]',
        },
      ],
      expected: '[{ "scanId": "S-3", "localTime": "2026-11-17 04:30", "afterHours": true }]',
    },
    {
      name: 'Exactly 19:00 local',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "scanId": "S-4", "scannedAt": "2026-11-18T00:00:00Z", "depotZone": "America/New_York" }]',
        },
      ],
      expected: '[{ "scanId": "S-4", "localTime": "2026-11-17 19:00", "afterHours": true }]',
    },
  ],
  followUps: [
    {
      q: 'Why store the scans in UTC at all?',
      a: 'UTC has no summer time, so times from every depot sort and compare correctly. Converting to local time is a display step, done at the edge for the person who reads it.',
    },
    {
      q: 'What happens with a local time that does not exist, such as 01:30 on the night the clocks go forward?',
      a: 'Converting from UTC never gives such a time, because every moment has one local reading. The problem only appears the other way round, when you turn a local time with no offset into UTC. Keep the offset or the UTC time in the data to avoid it.',
    },
    {
      q: 'How would you group the scans into a daily count per depot?',
      a: 'Add a `localDate` with `local as String {format: "yyyy-MM-dd"}`, then group by the depot and that date. Grouping by the UTC date would put late evening scans in Sydney on the wrong day.',
    },
  ],
}
