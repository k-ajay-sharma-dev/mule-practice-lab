export default {
  id: 'ms-087',
  category: 'mulesoft',
  title: 'File Connector Operations: Read, Write Modes, List, Copy, Move, Rename, Locks and Their Errors',
  level: 'INTERMEDIATE',
  tags: ['file', 'connectors', 'error-handling', 'locks', 'batch-files'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each `file:write` mode to what it does when the file already exists.',
      pairs: [
        ['OVERWRITE (default)', 'Replaces the existing content completely'],
        ['APPEND', 'Adds the new content to the end of the file'],
        ['CREATE_NEW', 'Fails with an error'],
      ],
      explain: 'CREATE_NEW protects an existing file. The error is `FILE:FILE_ALREADY_EXISTS`, which is listed for the write operation.',
    },
    {
      type: 'single',
      prompt: '`file:move` targets a path that already exists, and Overwrite is left at its default. What happens?',
      options: [
        'FILE:FILE_ALREADY_EXISTS, because Overwrite defaults to false',
        'The target is replaced',
        'The source is renamed with a timestamp',
        'FILE:FILE_LOCK, because the target is in use',
      ],
      answer: 0,
      explain: 'Copy, move and rename all default Overwrite to false. A rerun that targets the same name fails until the name changes or Overwrite is set deliberately.',
    },
    {
      type: 'single',
      prompt: 'A flow reads a file with `lock="true"`, but another party holds a lock on it. What does the operation raise?',
      options: [
        'FILE:FILE_LOCK',
        'FILE:ACCESS_DENIED',
        'FILE:ILLEGAL_PATH',
        'FILE:FILE_ALREADY_EXISTS',
      ],
      answer: 0,
      explain: 'FILE:FILE_LOCK is listed only for read. ACCESS_DENIED is about permissions, which is a different problem from a lock held by someone else.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about locks on `file:read` are correct?',
      options: [
        'Lock defaults to false',
        'The lock is released when the flow that took it ends, or when the content has been fully read',
        'Lock behaviour depends on the host file system and operating system',
        'A lock guarantees exclusive access on every mounted drive',
      ],
      answer: [0, 1, 2],
      explain: 'Because the lock depends on the host file system, you must test it on the real mount rather than assume it protects you.',
    },
    {
      type: 'single',
      prompt: 'A team uses `file:rename` with `to="archive/invoice-1.csv"`. Why is this wrong?',
      options: [
        'The new name must not contain a path separator; use file:move to change directory',
        'Rename requires Overwrite to be true',
        'Rename works only on directories',
        'Rename needs a lock on the file',
      ],
      answer: 0,
      explain: 'Rename changes the name within the same location. Moving between directories is the job of `file:move`.',
    },
    {
      type: 'single',
      prompt: 'A nightly flow calls `file:list` on `/inbound`, and files in `/inbound/north` are not returned, although the `file:listener` in another app does see them. Why?',
      options: [
        'Recursive defaults to false on file:list but true on file:listener',
        'file:list cannot read subdirectories at all',
        'A file:list matcher always excludes directories',
        'The listener moved them first',
      ],
      answer: 0,
      explain: 'The two defaults differ, so set Recursive explicitly when moving logic between a listener and a List operation.',
    },
    {
      type: 'match',
      prompt: 'Match each error to the operations that list it.',
      pairs: [
        ['FILE:FILE_LOCK', 'Read only'],
        ['FILE:ILLEGAL_CONTENT', 'Write only'],
        ['FILE:FILE_ALREADY_EXISTS', 'Copy, create-directory, move, rename and write'],
      ],
      explain: 'Knowing which operation can raise what lets you write narrow `on-error` types rather than one broad handler.',
    },
  ],
  description: `
A hospital group exchanges files with its laboratory partner through a shared drive that is mounted on an on-premises Mule server. A nightly job must:

1. List the result files in \`/lab/inbound\`, including regional subfolders.
2. Read each file, and avoid reading one the partner's tool is still writing.
3. Write a daily summary to \`/lab/reports\`, which must never replace a report already sent.
4. Add each processed file's name to a running audit log.
5. Copy the file to \`/lab/backup\` and move it to \`/lab/archive\`, creating dated folders when needed.

**Questions**
1. Which operation and settings fit each step?
2. Which write mode fits the summary, and which fits the audit log?
3. How do locks and size checks help in step 2, and what are their limits?
4. Which error can each step raise, and how would you handle it?
`,
  answerTemplate: `## Operation and settings per step

## Write modes

## Locks and size checks

## Errors per step
`,
  keyPoints: [
    'file:write modes: OVERWRITE (default), APPEND and CREATE_NEW. CREATE_NEW fails if the file already exists.',
    'Copy, move and rename have Overwrite false by default, and raise FILE:FILE_ALREADY_EXISTS if the target exists.',
    'file:rename takes a new name without a path separator; file:move changes location.',
    'file:list has Recursive false by default, while file:listener has Recursive true.',
    'Lock defaults to false, depends on the host file system, and FILE:FILE_LOCK is raised on read if another party holds the lock.',
    'timeBetweenSizeCheck is on the config, listener, read and list, not on the matcher.',
    'FILE:ILLEGAL_CONTENT is write only; FILE:ACCESS_DENIED, FILE:ILLEGAL_PATH and FILE:CONNECTIVITY cover other failures.',
  ],
  solution: `
**1. Operations per step.**
| Step | Operation | Key settings |
|---|---|---|
| List results | \`file:list\` | **Recursive true** (default false), a matcher such as filenamePattern |
| Read a file | \`file:read\` | Time Between Size Check, Output Mime Type, and Lock if the mount supports it |
| Write the summary | \`file:write\` | \`mode="CREATE_NEW"\` |
| Add to the audit log | \`file:write\` | \`mode="APPEND"\` |
| Back up | \`file:copy\` | sourcePath, targetPath |
| Archive | \`file:move\` | sourcePath, targetPath, Create Parent Directories |

\`file:create-directory\` can make a folder in advance, but it raises \`FILE:FILE_ALREADY_EXISTS\` if the folder is there. For dated folders, Create Parent Directories on the copy or move is simpler. Set it explicitly so the behaviour is clear in the flow.

**2. Write modes.** The summary uses **CREATE_NEW**, because a repeat run must fail rather than replace a report that was already sent. The audit log uses **APPEND**. The default, OVERWRITE, would break both.

**3. Locks and size checks.**
- **Time Between Size Check** makes the connector compare a file's size across a wait, to detect one still being written. It sits on the config, listener, read and list, not on the matcher.
- **Lock** on read tries to hold a file system lock. It is released when the flow ends or the content has been fully read. If another party already holds the lock, you get \`FILE:FILE_LOCK\`. The behaviour depends on the host file system, so test it on this shared drive.

**4. Errors.**
| Step | Error | Handling |
|---|---|---|
| List | \`FILE:ILLEGAL_PATH\`, \`FILE:ACCESS_DENIED\` | Alert: path or permission problem |
| Read | \`FILE:FILE_LOCK\` | Try this file again later and continue with the others |
| Write | \`FILE:FILE_ALREADY_EXISTS\` | A rerun: confirm the earlier output, do not force it |
| Write | \`FILE:ILLEGAL_CONTENT\` | Fix the content being written |
| Copy, move | \`FILE:FILE_ALREADY_EXISTS\` | Use a unique name, or set Overwrite deliberately |
| Read, write, copy, move | \`FILE:CONNECTIVITY\`, \`FILE:RETRY_EXHAUSTED\` | Check the mount and reconnection strategy |

FTP and SFTP have matching operations, so most of this carries over.
`,
  followUps: [
    {
      q: 'Why use file:list with a Scheduler rather than file:listener here?',
      a: 'A nightly job has a clear start and end, and the flow controls the order of steps. A listener suits files that arrive at any time, and it has post actions such as Auto Delete, Move To Directory and Rename To.',
    },
    {
      q: 'When is the lock on file:write released?',
      a: 'Automatically after the Write operation finishes. Like the read lock, it depends on the host file system.',
    },
    {
      q: 'What can a matcher filter on?',
      a: 'filenamePattern, pathPattern, minimum and maximum size, notUpdatedInTheLast, updatedInTheLast, created, updated and accessed since or until, and whether to match directories, regular files and sym links.',
    },
  ],
}
