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
      prompt: 'What does the REST command do before RETR or STOR?',
      options: [
        'It resets the session to its state after login, clearing settings',
        'It sets a byte offset, so the transfer can resume from there',
        'It restarts the last failed transfer from the first byte',
        'It sets a line number, so an ASCII transfer can skip finished lines',
      ],
      answer: 1,
      explain: 'REST with an offset lets a client continue a transfer. It needs binary mode, and the server must support REST STREAM.',
    },
    {
      type: 'single',
      prompt: 'Your connector does not expose resume. A 4 GB upload drops at 3 GB. What is a sound approach?',
      options: [
        'Rename the partial file and send the rest as a second file',
        'Upload again to the temp name from the start, then rename',
        'Append the last 1 GB to the partial file with APPEND mode',
        'Split every large file into 100 MB parts the partner joins',
      ],
      answer: 1,
      explain: 'Size the timeouts for the file too. Appending without checking the remote size can duplicate or skip bytes, and splitting needs the partner to change. Without a checked resume, a full rewrite is the safe choice. The temporary name keeps the receiver away from the partial file.',
    },
    {
      type: 'multi',
      prompt: 'Which errors are worth an automatic retry with a delay?',
      options: [
        'Connection refused during a known window',
        'A 421 reply, service not available',
        'A 530 reply, login incorrect',
        'A read timeout on the data connection',
      ],
      answer: [0, 1, 3],
      explain: 'A wrong login does not fix itself, and repeated attempts can lock the account. Network and service errors often clear.',
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
      prompt: 'Why can a long idle period break an FTP session even when the server is up?',
      options: [
        'The server logs the user out after each file, so a new login is due',
        'Servers and firewalls close idle control connections',
        'The data connection from the last transfer is still held open',
        'The passive port given earlier is handed to another client',
      ],
      answer: 1,
      explain: 'The next command then fails on a dead connection. A pooled connection may be dead when it is reused. Connection validation and reconnection handle this.',
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
