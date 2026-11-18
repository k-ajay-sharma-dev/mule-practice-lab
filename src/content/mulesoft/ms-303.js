export default {
  id: 'ms-303',
  category: 'mulesoft',
  title: 'Technical Keys in Oracle From Mule: Sequences, Identity Columns and Getting the Key Back',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'sequences', 'identity', 'generated-keys', 'staging'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A Mule app loads item headers and their barcodes into two staging tables. Barcode rows need the header technical key. What is a common approach?',
      options: [
        'Insert the headers, then select the max key and count backwards',
        'Fetch a block of sequence values first, assign them to headers in DataWeave, then insert headers and barcodes with the keys already set',
        'Use the item code as the key everywhere',
        'Let each barcode insert look up the header by description',
      ],
      answer: 1,
      explain: 'Fetching the numbers first lets one bulk insert per table carry the parent key. Max key queries break with parallel loads.',
    },
    {
      type: 'single',
      prompt: 'How can you fetch 500 sequence values in one round trip?',
      options: [
        'Call NEXTVAL 500 times from a For Each',
        'SELECT ITEM_SEQ.NEXTVAL FROM DUAL CONNECT BY LEVEL <= 500',
        'SELECT MAX(ID) + 500 FROM ITEM_STAGE',
        'ALTER SEQUENCE ITEM_SEQ INCREMENT BY 500 before each run',
      ],
      answer: 1,
      explain: 'A row generator query returns one NEXTVAL per row. Changing INCREMENT BY at run time affects every other session too.',
    },
    {
      type: 'single',
      prompt: 'After a database restart, key values jump from 1040 to 1061. Is something wrong?',
      options: [
        'Yes, rows were deleted',
        'No, the sequence cached values in memory, and a restart loses the unused cached ones. Sequences do not promise values without gaps',
        'Yes, the sequence is corrupt',
        'No, Oracle always adds 20 on restart',
      ],
      answer: 1,
      explain: 'Rollbacks also create gaps. Never use a sequence where a gap free number is a legal need, such as invoice numbers in some countries.',
    },
    {
      type: 'single',
      prompt: 'What is an identity column in Oracle 12c and later?',
      options: [
        'A column that holds the user name',
        'A column declared GENERATED ALWAYS or BY DEFAULT AS IDENTITY, filled from a sequence Oracle manages for the table',
        'A ROWID',
        'A synonym for the primary key',
      ],
      answer: 1,
      explain: 'GENERATED ALWAYS rejects an explicit value. BY DEFAULT accepts one. Both are backed by a system sequence.',
    },
    {
      type: 'multi',
      prompt: 'You insert one row and need its new identity key in the same flow. Which work?',
      options: [
        'A PL/SQL block or procedure with INSERT ... RETURNING ID INTO an out parameter',
        'The Insert operation with auto generated keys on, naming the key column so the driver returns it rather than a ROWID',
        'SELECT MAX(ID) right after the insert',
        'Fetching NEXTVAL first and inserting it as the key',
      ],
      answer: [0, 1, 3],
      explain: 'MAX(ID) can return another session key. Without column names, the Oracle driver tends to return a ROWID as the generated key.',
    },
    {
      type: 'single',
      prompt: 'Two Mule workers on two RAC nodes use the same NOORDER sequence. What can you not assume?',
      options: [
        'That values are unique',
        'That values follow insert time order across the nodes',
        'That values are numbers',
        'That NEXTVAL works',
      ],
      answer: 1,
      explain: 'Each node caches its own range. Values stay unique but are not in time order. Sort by a timestamp when order matters.',
    },
  ],
  description: `
Brindle Outdoor sends item messages that Mule loads into Oracle staging tables for the merchandising system: one header row per item and child rows for barcodes and attributes. Every row needs a technical key from a sequence, and child rows must carry the parent key. Today the flow calls NEXTVAL once per row in a For Each, and a 20,000 item file takes far too long.

**Questions**
1. How do you get keys for many rows without one call per row?
2. How do child rows get the parent key?
3. Why are there gaps in the keys, and does it matter?
4. When would you use an identity column, and how do you get the key back after a single insert?
`,
  answerTemplate: `## Keys for many rows

## Parent and child keys

## Gaps

## Identity columns and returned keys
`,
  keyPoints: [
    'Fetch a block of NEXTVAL values in one query.',
    'Assign keys in DataWeave, then bulk insert parents and children.',
    'Sequences cache values and have gaps. That is normal.',
    'Identity columns are table managed sequences in 12c and later.',
    'Get a single new key with RETURNING INTO or generated keys with the column named.',
    'Never use SELECT MAX(ID) to find a new key.',
  ],
  solution: `
**1. Keys for many rows.** Count the header rows, then fetch that many values in one query, for example \`SELECT ITEM_SEQ.NEXTVAL AS ID FROM DUAL CONNECT BY LEVEL <= :n\`. One round trip gives all keys. A sequence with a larger CACHE value also helps when many values are taken at once.

**2. Parent and child keys.** In DataWeave, zip the list of keys with the headers by position, so each header gets one key. Then build the barcode and attribute rows from each header and copy its key into the parent key column. Bulk insert headers first, then children, in one transaction if there is a foreign key.

**3. Gaps.** Each session or node caches a range of values. A restart drops unused cached values, and a rollback does not give values back. So gaps are normal. A technical key only needs to be unique, so gaps do not matter. If a business needs numbers with no gaps, a sequence is the wrong tool.

**4. Identity columns.** From 12c a column can be \`GENERATED BY DEFAULT AS IDENTITY\`, and Oracle fills it from a sequence it manages. It suits single row inserts. To get the key back, call a PL/SQL block with \`INSERT ... RETURNING ID INTO :id\`, or use the Insert operation with auto generated keys and name the key column. For bulk loads with child rows, fetching sequence values first is still clearer.
`,
  followUps: [
    {
      q: 'Can you call NEXTVAL inside the bulk insert SQL instead?',
      a: 'Yes, INSERT ... VALUES (ITEM_SEQ.NEXTVAL, :code, ...) works for rows with no children. Child rows then cannot know the parent key without a lookup.',
    },
    {
      q: 'Why can SELECT MAX(ID) + 1 give duplicates?',
      a: 'Two sessions can read the same max before either commits, and both insert the same value. One then fails with ORA-00001.',
    },
    {
      q: 'What sequence CACHE would you ask for?',
      a: 'Something near the usual block size, such as 1,000 for loads that fetch thousands of values. The cost is larger gaps after a restart.',
    },
  ],
}
