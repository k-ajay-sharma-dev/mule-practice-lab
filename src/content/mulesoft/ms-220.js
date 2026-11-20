export default {
  id: 'ms-220',
  category: 'mulesoft',
  title: 'Object Store Operations: Store, Retrieve, Contains, Remove and Their Errors',
  level: 'INTERMEDIATE',
  tags: ['object-store', 'connectors', 'error-handling', 'caching', 'state', 'education'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A flow runs `os:retrieve` for the key `term-2026-autumn`, which was never stored, and sets no default value. What happens?',
      options: [
        'The payload becomes null and the flow goes on',
        'The payload becomes an empty string',
        'The operation raises `OS:KEY_NOT_FOUND`',
        'The operation stores the key with a null value',
      ],
      answer: 2,
      explain: 'Retrieve without a default value raises `OS:KEY_NOT_FOUND` for a missing key. Set `defaultValue` when a missing key is a normal case.',
    },
    {
      type: 'single',
      prompt: 'Which call avoids that error and gives an empty list when nothing is stored yet?',
      options: [
        '`os:contains` with the key',
        '`os:retrieve` with `defaultValue="#[[]]"`',
        '`os:retrieve-all-keys`',
        '`os:store` with `failIfPresent="true"`',
      ],
      answer: 1,
      explain: 'The default value is returned when the key is missing. The flow needs no error handler for the normal first run.',
    },
    {
      type: 'single',
      prompt: 'Two replicas both want to start the nightly timetable job. Each checks `os:contains` for `timetable-lock`, sees false, and then stores it. What is the risk?',
      options: [
        'None, because contains and store run as one step',
        'The second store raises an error, so only one job runs',
        'The object store refuses the second contains call',
        'Both can see false before either stores the key, so both jobs run',
      ],
      answer: 3,
      explain: 'A check followed by a store is two separate steps. Another replica can act between them. Use one store with `failIfPresent="true"`, so only one of them gets in.',
    },
    {
      type: 'single',
      prompt: '`os:store` runs with `failIfPresent="true"` and the key already exists. What happens?',
      options: [
        'It raises `OS:KEY_ALREADY_EXISTS`',
        'It replaces the old value',
        'It keeps the old value and returns it as the payload',
        'It waits until the key expires',
      ],
      answer: 0,
      explain: 'With `failIfPresent`, an existing key raises `OS:KEY_ALREADY_EXISTS`. The default is false, which replaces the old value.',
    },
    {
      type: 'single',
      prompt: 'A flow stores `#[vars.lastRunAt]`, but the variable was never set. What happens with the default settings?',
      options: [
        'The key is stored with a null value',
        'The key is removed from the store',
        'The operation raises an `OS:NULL_VALUE` error',
        'Nothing is stored and no error is raised',
      ],
      answer: 2,
      explain: 'By default, storing a null value is an error, because `failOnNullValue` is true. Set `failOnNullValue="false"` only if a null is a value you mean to keep.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the operation that fits it.',
      pairs: [
        ['Read one value, with a fallback for a missing key', 'os:retrieve with defaultValue'],
        ['Read every key and value in the store', 'os:retrieve-all'],
        ['Delete every entry, for example in a test', 'os:clear'],
      ],
      explain: 'Retrieve reads one key. Retrieve all returns the keys and values together. Clear empties the store, so keep it away from production flows unless that is the goal.',
    },
  ],
  description: `
Copperfield College syncs class timetables from its student system to a room booking system every night. The integration keeps two things in an Object Store: the time of the last good run, so it only reads changes, and a lock, so only one replica runs the sync.

The first night, the flow failed with \`OS:KEY_NOT_FOUND\`. A week later, both replicas ran the sync at once and double-booked 30 rooms. The week after, a failed run stored a null time and the next run failed again.

**Questions**
1. What do retrieve, store, contains and remove do, and which errors can each raise?
2. How do you handle the very first run, when no time is stored yet?
3. How do you make sure only one replica runs the sync?
4. How do you avoid storing a bad value after a failed run?
`,
  answerTemplate: `## The operations and their errors

## The first run

## One replica at a time

## Safe updates
`,
  keyPoints: [
    'os:retrieve raises OS:KEY_NOT_FOUND for a missing key unless defaultValue is set.',
    'os:store replaces a value by default. With failIfPresent it raises OS:KEY_ALREADY_EXISTS instead.',
    'os:store raises OS:NULL_VALUE for a null value, because failOnNullValue is true by default.',
    'os:contains returns true or false. A contains followed by a store is two steps and can race.',
    'os:remove raises OS:KEY_NOT_FOUND for a missing key.',
    'Store the watermark only after the work has succeeded, and remove a lock in both the success and the error path.',
  ],
  solution: `
**1. The operations.**
| Operation | Does | Can raise |
|---|---|---|
| \`os:retrieve\` | Reads one value | \`OS:KEY_NOT_FOUND\` with no default value |
| \`os:store\` | Writes one value | \`OS:KEY_ALREADY_EXISTS\` with failIfPresent, \`OS:NULL_VALUE\` for null |
| \`os:contains\` | Returns true or false | |
| \`os:remove\` | Deletes one key | \`OS:KEY_NOT_FOUND\` |
| \`os:retrieve-all\` / \`os:clear\` | Read all entries / delete all entries | |

**2. The first run.** Retrieve the last run time with a \`defaultValue\`, such as the start of the term. The first run then reads everything from that date, and no error handler is needed for a normal case.

**3. One replica at a time.** Store \`timetable-lock\` with \`failIfPresent="true"\`. The replica whose store succeeds runs the sync. The other gets \`OS:KEY_ALREADY_EXISTS\`, catches it with On Error Continue and stops. Remove the lock at the end, in the success path and in the error handler. Give the store a time to live as a safety net, so a crashed run does not hold the lock for ever. The store must be shared by the replicas, which on CloudHub means a persistent object store.

**4. Safe updates.** Store the new run time as the last step, only after the booking system accepted every change. Use the time the run started, not the time it ended, so changes made during the run are read again next time. A failed run then leaves the old time in place, and the next run retries the same changes.
`,
  followUps: [
    {
      q: 'Is the Object Store a good place for the timetable data itself?',
      a: 'No. It suits small pieces of state such as a watermark, a lock or a cache entry. Large data with queries and history belongs in a database.',
    },
    {
      q: 'Why not use the Scheduler on the primary node instead of a lock?',
      a: 'On a Mule cluster, a scheduler runs only on the primary node by default. CloudHub 2.0 replicas are not a Mule cluster unless clustering is turned on, so each replica runs its own scheduler and a lock is needed.',
    },
    {
      q: 'How would you test the lock in MUnit?',
      a: 'Store the lock key before the test runs, call the flow, and assert that the sync step was not called and the flow ended without an error. Clear the store between tests so they do not affect each other.',
    },
  ],
}
