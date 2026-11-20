export default {
  id: 'ms-281',
  category: 'mulesoft',
  title: 'How FTP Works: The Control Channel, the Data Channel and Their Ports',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'protocols', 'control-channel', 'data-channel', 'ports'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'On which default port does an FTP client open the control connection?',
      options: ['20', '21', '22', '990'],
      answer: 1,
      explain: 'The control connection goes to port 21. Port 22 is SSH, so SFTP. Port 990 is implicit FTPS.',
    },
    {
      type: 'single',
      prompt: 'What travels on the FTP control channel?',
      options: [
        'Commands, replies and the file content, all on one connection',
        'Commands such as USER, LIST and RETR, and three digit reply codes',
        'Only the login, after which the channel is closed',
        'Commands and directory listings, but not file content',
      ],
      answer: 1,
      explain: 'The control channel carries text commands and numbered replies. File content and listings go over a separate data connection.',
    },
    {
      type: 'multi',
      prompt: 'Which actions open a new data connection?',
      options: ['A directory listing with LIST', 'A download with RETR', 'An upload with STOR', 'A change of directory with CWD'],
      answer: [0, 1, 2],
      explain: 'Listings, downloads and uploads move bytes, so each one opens a data connection. CWD only gets a reply on the control channel.',
    },
    {
      type: 'match',
      prompt: 'Match each reply code to its meaning.',
      pairs: [
        ['220', 'The server is ready for a new user'],
        ['230', 'The user is logged in'],
        ['226', 'The transfer finished and the data connection is closed'],
        ['550', 'The action failed, for example the file does not exist or access is denied'],
      ],
      explain: 'Codes starting with 2 mean success, 4 a temporary failure and 5 a permanent failure. Logs from the Mule connector often show them.',
    },
    {
      type: 'single',
      prompt: 'In active mode, who opens the data connection?',
      options: [
        'The client, to a port the server gives it in the PASV reply',
        'The server, from its port 20 to a port the client sent with PORT',
        'The client, to port 20 on the server',
        'The server, from port 21 back to the client’s control port',
      ],
      answer: 1,
      explain: 'In active mode the server connects back to the client. In passive mode the client connects to a port the server announced with its PASV reply.',
    },
    {
      type: 'single',
      prompt: 'Why does an integration team care about the two channels?',
      options: [
        'Because the login fails unless port 20 is open on the client side',
        'Because firewalls must allow data connections too, or transfers hang',
        'Because the data channel needs its own user name and password',
        'Because each channel needs a separate Mule connection config',
      ],
      answer: 1,
      explain: 'Firewalls must allow the data connections, not only port 21. A login that works while LIST or RETR hangs is the classic sign that the data channel is blocked.',
    },
  ],
  description: `
Brindle Outdoor still receives a weekly store master file from an old supplier system over plain FTP. A new team member can log in from a test client, but the first directory listing hangs. They ask how FTP actually works.

**Questions**
1. What are the control channel and the data channel?
2. Which ports are involved?
3. What do active and passive mode change?
4. Why can a login work while a listing hangs?
`,
  answerTemplate: `## Control channel

## Data channel and ports

## Active and passive

## Login works, listing hangs
`,
  keyPoints: [
    'The control channel on port 21 carries commands and reply codes.',
    'Each listing, download and upload opens its own data connection.',
    'Active mode: the server connects back to the client, from port 20.',
    'Passive mode: the client connects to a port the server announced.',
    'Firewalls must allow the data connections, not only port 21.',
  ],
  solution: `
**1. Control channel.** The client opens a connection to port 21 and keeps it for the session. It sends text commands such as USER, PASS, CWD, LIST, RETR and STOR. The server answers each with a three digit code, such as 230 for a successful login or 550 for a missing file.

**2. Data channel and ports.** File content and directory listings do not go on the control connection. Each LIST, RETR or STOR opens a new data connection, which closes when the transfer ends. Which side opens it, and on which port, depends on the mode.

**3. Active and passive.** In active mode the client tells the server an address and port with PORT, and the server connects back, usually from port 20. In passive mode the client sends PASV, the server replies with an address and a port from its passive range, and the client connects to it. Passive mode is the usual choice today because clients sit behind firewalls and NAT.

**4. Login works, listing hangs.** Login uses only the control channel. The listing needs a data connection. If a firewall blocks the passive port range, or the server announces a private address the client cannot reach, the listing hangs and then times out.
`,
  followUps: [
    {
      q: 'What would you ask the FTP server owner when listings hang?',
      a: 'The passive port range and the address the server announces in its PASV reply. Then ask the network team to open that range from the Mule workers.',
    },
    {
      q: 'Why is port 20 not used in passive mode?',
      a: 'The client opens the data connection to a port the server picked from its passive range, so the server does not connect from port 20.',
    },
    {
      q: 'Is a 4xx reply worth a retry?',
      a: 'Often yes. Codes starting with 4 mean a temporary failure, such as too many users. Codes starting with 5 usually need a fix, not a retry.',
    },
  ],
}
