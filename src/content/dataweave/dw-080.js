export default {
  id: 'dw-080',
  category: 'dataweave',
  title: 'Turn a Store Master CSV into Nested Typed JSON',
  level: 'BEGINNER',
  tags: ['csv', 'json', 'data-formats', 'type-conversion', 'dates', 'map'],
  estMinutes: 15,
  description: `
A retail chain with 340 stores maintains its store list in a spreadsheet. Once a week a Mule flow reads the export with \`file:read\` as \`application/csv\` (with a header row) and sends it to the store locator API. The API wants nested JSON with proper data types.

**Output: one object per CSV row, in file order**

| Field | Source | Type |
|---|---|---|
| \`storeId\` | \`store_id\` | String |
| \`name\` | \`name\` | String |
| \`address.street\` | \`street\` | String |
| \`address.postalCode\` | \`postal_code\` | String, keep leading zeros |
| \`address.city\` | \`city\` | String |
| \`location.latitude\` | \`lat\` | Number |
| \`location.longitude\` | \`lng\` | Number |
| \`openedOn\` | \`opened\` | Date, the file uses \`dd/MM/yyyy\`, the API wants \`yyyy-MM-dd\` |
| \`active\` | \`active\` | Boolean (\`true\` or \`false\` in the file) |
| \`employees\` | \`employees\` | Number, or \`null\` when the field is empty |
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/csv',
      content: `store_id,name,street,postal_code,city,lat,lng,opened,active,employees
ST-014,Utrecht Centrum,Oudegracht 112,3511 AX,Utrecht,52.0907,5.1214,15/03/2019,true,24
ST-027,"Bergen, Torgallmenningen",Torgallmenningen 8,05014,Bergen,60.3929,5.3241,01/10/2021,true,
ST-033,Lille Gare,Place des Buisses 2,59000,Lille,50.6365,3.0746,30/06/2016,false,11`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "storeId": "ST-014",
    "name": "Utrecht Centrum",
    "address": { "street": "Oudegracht 112", "postalCode": "3511 AX", "city": "Utrecht" },
    "location": { "latitude": 52.0907, "longitude": 5.1214 },
    "openedOn": "2019-03-15",
    "active": true,
    "employees": 24
  },
  {
    "storeId": "ST-027",
    "name": "Bergen, Torgallmenningen",
    "address": { "street": "Torgallmenningen 8", "postalCode": "05014", "city": "Bergen" },
    "location": { "latitude": 60.3929, "longitude": 5.3241 },
    "openedOn": "2021-10-01",
    "active": true,
    "employees": null
  },
  {
    "storeId": "ST-033",
    "name": "Lille Gare",
    "address": { "street": "Place des Buisses 2", "postalCode": "59000", "city": "Lille" },
    "location": { "latitude": 50.6365, "longitude": 3.0746 },
    "openedOn": "2016-06-30",
    "active": false,
    "employees": 11
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (row) -> {
  storeId: row.store_id
}
`,
  hints: [
    'With a header row, `payload` is an array of objects and each column name is a key: `row.postal_code`.',
    'Every CSV value is a String. Convert with `as Number` and `as Boolean`, and leave `postal_code` alone so `05014` keeps its leading zero.',
    'Reformatting a date takes two steps: parse with the input format, then write with the output format: `row.opened as Date { format: "dd/MM/yyyy" } as String { format: "yyyy-MM-dd" }`.',
    'An empty field arrives as an empty string, and `"" as Number` fails. Check first: `if (row.employees == "") null else row.employees as Number`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload map (row) -> {
  storeId: row.store_id,
  name: row.name,
  address: {
    street: row.street,
    postalCode: row.postal_code,
    city: row.city
  },
  location: {
    latitude: row.lat as Number,
    longitude: row.lng as Number
  },
  openedOn: row.opened as Date { format: "dd/MM/yyyy" } as String { format: "yyyy-MM-dd" },
  active: row.active as Boolean,
  employees: if (row.employees == "") null else row.employees as Number
}`,
  explanation: `
**CSV has no types.** Every value arrives as a String, so the JSON types come from your mapping. Converting is a field-by-field decision, and sometimes the right decision is *not* to convert: a postal code looks numeric in some countries, but \`as Number\` would turn \`05014\` into \`5014\`.

**Nesting is free.** The CSV is flat, but the object you return can have any shape. Writing \`address: { ... }\` inside the \`map\` is all it takes.

**Dates.** \`as Date { format: "dd/MM/yyyy" }\` tells DataWeave how to read the text. It is not a full validation, though: a month of 13 fails, but \`31/02/2026\` is quietly adjusted to 28 February. The format stays attached to the value, so a Date parsed this way is written back to JSON as \`15/03/2019\`, which is an easy mistake to miss. The second step, \`as String { format: "yyyy-MM-dd" }\`, produces the form the API expects.

**Empty fields.** A blank column is an empty string, not \`null\`, so \`row.employees default null\` leaves the \`""\` in place. \`row.employees as Number default null\` does give \`null\`, because \`default\` also catches the failed conversion, but it would turn a bad value such as \`n/a\` into \`null\` as well. Testing for \`""\` first handles the blank and still lets a real error stop the run.

**Quoted fields.** \`"Bergen, Torgallmenningen"\` contains the separator. The CSV reader removes the quotes and keeps the comma inside the value.
`,
  tests: [
    {
      name: 'A single row with a quoted street and an empty employee count',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `store_id,name,street,postal_code,city,lat,lng,opened,active,employees
ST-101,Porto Ribeira,"Rua das Flores, 40",4050-262,Porto,41.1456,-8.6131,29/02/2024,false,`,
        },
      ],
      expected:
        '[ { "storeId": "ST-101", "name": "Porto Ribeira", "address": { "street": "Rua das Flores, 40", "postalCode": "4050-262", "city": "Porto" }, "location": { "latitude": 41.1456, "longitude": -8.6131 }, "openedOn": "2024-02-29", "active": false, "employees": null } ]',
    },
    {
      name: 'Zero employees is not an empty field',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `store_id,name,street,postal_code,city,lat,lng,opened,active,employees
ST-102,Gent Pop-up,Veldstraat 1,9000,Gent,51.0536,3.7253,02/11/2026,true,0`,
        },
      ],
      expected:
        '[ { "storeId": "ST-102", "name": "Gent Pop-up", "address": { "street": "Veldstraat 1", "postalCode": "9000", "city": "Gent" }, "location": { "latitude": 51.0536, "longitude": 3.7253 }, "openedOn": "2026-11-02", "active": true, "employees": 0 } ]',
    },
  ],
  followUps: [
    {
      q: 'What happens to the whole file if one row has "n/a" in the lat column?',
      a: 'The `as Number` coercion fails and the script stops, so no row is delivered. If bad rows should not block good ones, validate each row first and split the result into accepted and rejected lists.',
    },
    {
      q: 'The spreadsheet is now exported with a semicolon. Where do you change that?',
      a: 'On the reader, not in the mapping: set the input format to `application/csv` with the reader property `separator=";"`. The script stays the same because it uses column names.',
    },
  ],
}
