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
        'The payload becomes null, as retrieve returns null for a missing key',
        'The payload stays as it was, and the flow goes on to the next step',
        'The operation raises `OS:KEY_NOT_FOUND`',
        'The payload becomes an empty String, the value of an unset default',
      ],
      answer: 2,
      explain: 'Retrieve without a default value raises `OS:KEY_NOT_FOUND` for a missing key. Set `defaultValue` when a missing key is a normal case.',
    },
    {
      type: 'single',
      prompt: 'A flow keeps the ids of enrolled students under the key `enrolled-ids`. On the very first run the key is missing and the flow fails with `OS:KEY_NOT_FOUND`. The team wants an empty list on that run, with one step and no error handler. What should it use?',
      options: [
        '`os:contains` before `os:retrieve`, so that the retrieve runs only when the key exists',
        'A Try around `os:retrieve` with On Error Continue that sets the payload to `[]`',
        '`os:store` of `[]` with `failIfPresent="true"` in a flow that runs on each deploy',
        '`os:retrieve` with `defaultValue="#[[]]"`',
      ],
      answer: 3,
      explain: 'The default value is returned when the key is missing, so the first run gets `[]` in one step with no error. A Try with On Error Continue also gives `[]`, but it is the error handler the team wants to avoid. Contains then retrieve takes two steps and still gives no list for a missing key. A store with `failIfPresent` raises `OS:KEY_ALREADY_EXISTS` on every deploy after the first.',
    },
    {
      type: 'single',
      prompt: 'Two replicas both want to start the nightly timetable job. Each checks `os:contains` for `timetable-lock`, sees false, and then stores it. What is the risk?',
      options: [
        'None, because Object Store v2 locks a key between a contains and a store',
        'The second store raises an error, so only the first replica runs the job',
        'Only the first replica runs, as its key is the one that the store keeps',
        'Both can see false before either stores the key, so both jobs run',
      ],
      answer: 3,
      explain: 'A check followed by a store is two separate steps. Another replica can act between them. Use one store with `failIfPresent="true"`, so only one of them gets in.',
    },
    {
      type: 'single',
      prompt: 'A course sign-up flow runs `os:store` for the key `signup-S42` with `failIfPresent="true"`, so a student cannot sign up twice. The flow has no error handler for it. A student double clicks, and the second request arrives after the first has stored the key. What does the second request do?',
      options: [
        'It replaces the stored value, as a store overwrites a key that exists',
        'It keeps the old value and returns it as the payload for the flow to compare',
        'It fails with `OS:KEY_ALREADY_EXISTS`, and the caller gets an error response',
        'It waits for the first request to finish, then stores the key once again',
      ],
      answer: 2,
      explain: 'With `failIfPresent` set to true, an existing key raises `OS:KEY_ALREADY_EXISTS`. With no handler, the error ends the flow and the caller gets an error response, so map it to a clear answer such as 409. Overwriting is what the default, `failIfPresent` false, does. A store does not wait for other requests and does not return the old value.',
    },
    {
      type: 'single',
      prompt: 'A flow stores `#[vars.lastRunAt]`, but the variable was never set. What happens with the default settings?',
      options: [
        'The key is stored with a null value',
        'The key is stored with an empty String',
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
