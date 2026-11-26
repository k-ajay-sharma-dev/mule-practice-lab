export default {
  id: 'ms-288',
  category: 'mulesoft',
  title: 'FTP Maintenance Windows, Dropped Connections, Reconnection and Resume With REST',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'reconnection', 'retries', 'large-files', 'resume', 'maintenance-window'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'The partner FTP server restarts every Sunday from 02:00 to 02:30. What should the Mule listener do?',
      options: [
        'Stop the app every Sunday at 02:00 and start it again at 02:30',
        'Use a reconnection strategy, so later polls reconnect after the window',
        'Wrap the listener in Until Successful with 30 retries a minute apart',
        'Set the connection timeout to 30 minutes so polls wait for the server',
      ],
      answer: 1,
      explain: 'Polls during the window fail, and later polls reconnect. A source cannot sit inside Until Successful. A reconnection strategy with a sensible interval rides out a short window. Alerts should allow for the window to avoid noise.',
    },
    {
      type: 'single',
      prompt: 'A 4 GB download dropped after 3,000,000,000 bytes. The local partial file is intact, and both client and server support resume. What does the client send to continue?',
      options: [
        'REST 3000000000, then RETR, in ASCII mode so the lines stay aligned',
        'APPE with the file name, so the server sends the bytes after the partial file',
        'REST 3000000000, then RETR, in binary mode, and append to the local file',
        'REST 0, then RETR, since REST restarts a failed transfer from the first byte',
      ],
      answer: 2,
      explain: 'REST sets a byte offset, and the next RETR or STOR starts from it. Byte offsets are only exact in binary mode, since ASCII mode changes the byte count. The server must support REST STREAM. APPE is an upload command that appends to a file on the server. REST 0 would send the whole file again.',
    },
    {
      type: 'single',
      prompt: 'Your connector does not expose resume. A 4 GB upload drops at 3 GB. What is a sound approach?',
      options: [
        'Upload again from the start to the final name, overwriting the partial file',
        'Upload again to the temp name from the start, then rename',
        'Append the last 1 GB to the partial file with APPEND mode',
        'Split every large file into 100 MB parts the partner joins',
      ],
      answer: 1,
      explain: 'Without a checked resume, a full rewrite is the safe choice, and the temporary name keeps the receiver away from the file until it is complete. Writing to the final name lets the partner pick up a file that is still growing. Appending without checking the remote size can duplicate or skip bytes. Splitting needs the partner to change. Size the timeouts for the file too.',
    },
    {
      type: 'multi',
      prompt: 'Which errors are worth an automatic retry with a delay?',
      options: [
        'Connection refused during a known window',
        'A 421 reply, service not available',
        'A 530 reply, login incorrect',
        'A read timeout on the data connection',
        'A 553 reply, file name not allowed, on an upload',
        'A certificate validation failure when the FTPS session starts',
      ],
      answer: [0, 1, 3],
      explain: 'Connection refused in a known window, a 421 reply and a read timeout are temporary, so a delayed retry often works. 5xx replies are permanent by the FTP standard. A wrong login does not fix itself, and repeated attempts can lock the account. A file name the server refuses stays refused. A certificate that fails validation needs a trust store or config change, not a retry.',
    },
    {
      type: 'single',
      prompt: 'The connection drops halfway through reading a file in a flow. What protects the data?',
      options: [
        'Load the rows read so far, and the rest on the next poll',
        'Fail the flow, leave the file, and process it again from the start',
        'Move the file to the error folder so it is not read twice',
        'Reconnect and continue reading from the byte where it stopped',
      ],
      answer: 1,
      explain: 'Leave the file in the inbound folder and process it from the start on the next poll. Partial reads must not reach the target. Moving the file only after a successful load makes the retry safe.',
    },
    {
      type: 'single',
      prompt: 'A firewall drops idle connections after 15 minutes. An FTP connection sits idle for 40 minutes between files, and the next listing fails with a socket error while the server is up. What is the cause?',
      options: [
        'The pooled control connection was closed silently on the path, and the app reused it',
        'The server logs the user out after each file, so the listing has no session',
        'The data connection of the last transfer is still open and blocks the listing',
        'The passive port from the last transfer went to another client, so the listing fails',
      ],
      answer: 0,
      explain: 'The firewall removed the idle connection without telling either side, so the next command fails on a dead socket. A pooled connection may be dead when it is reused. Connection validation and reconnection handle this. Each listing asks for a new passive port, and a finished data connection is closed, so neither blocks the next command.',
    },
  ],
  description: `
Marrow & Pine Home sends a weekly full item master to the planning platform over FTP. The file is about 4 GB. The platform's FTP server has a maintenance window on Sunday nights, and the firewall drops idle connections after 15 minutes. Last week the upload failed at 3 GB and the platform loaded nothing until Monday.

**Questions**
1. How should the app behave during the maintenance window?
2. Which errors would you retry, and how?
3. How do you handle an upload that drops partway?
4. What is REST, and would you use it?
`,
  answerTemplate: `## Maintenance window

## Retries

## Upload drops partway

## REST and resume
`,
  keyPoints: [
    'Use a reconnection strategy on the connection.',
    'Plan schedules and alerts around the window.',
    'Retry network and 4xx errors with a delay. Do not retry a wrong login.',
    'Upload under a temporary name, rename only when complete.',
    'REST sets a byte offset to resume, in binary mode, if the server supports it.',
    'Without a checked resume, upload again from the start.',
  ],
  solution: `
**1. Maintenance window.** Set a reconnection strategy on the FTP connection, with an interval and attempt count that cover a short outage. Schedule the weekly upload well away from the window. Make the alert rules aware of the window, so expected failures do not page anyone.

**2. Retries.** Retry connection refused, timeouts and 4xx replies such as 421 with a delay and a limit, using until successful or the connector reconnection. Do not retry 530, a failed login, because the password will not fix itself and retries can lock the account. Log each retry with the reason.

**3. Upload drops partway.** Write under a temporary name and rename only after the full file is written and its size checked. On failure, delete the partial temp file if the connection allows, and upload again from the start. Set response timeouts that suit a 4 GB file, and stream the content instead of building it in memory.

**4. REST and resume.** REST with a byte offset before STOR or RETR resumes a transfer in binary mode, if the server supports it. If your connector does not expose resume, a full rewrite is the safe choice. If you build resume, compare the remote size and a hash at the end, because a resumed file with a wrong offset is corrupted.
`,
  followUps: [
    {
      q: 'How would you make a 4 GB file smaller to send?',
      a: 'Compress it with gzip or zip if the platform accepts it, send in binary mode, or agree a delta file instead of a full master every week.',
    },
    {
      q: 'Where should the retry live, in the connector or in the flow?',
      a: 'Connection problems belong to the reconnection strategy. Business level retries of a whole file belong in the flow, with a limit and an alert.',
    },
    {
      q: 'What would you show on a dashboard for this feed?',
      a: 'Last successful upload time, size, record count, duration and retries, with an alert if the file has not arrived by its cut off.',
    },
  ],
}
