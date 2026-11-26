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
      prompt: 'Mule reaches the supplier FTP server in passive mode, through a strict outbound firewall. Which outbound rules does the firewall need?',
      options: [
        'Port 21 only, since passive mode keeps data on the control connection',
        'Port 21 and port 20, since data always comes from the server port 20',
        'Port 21 and the passive port range that the server announces',
        'Port 21 outbound and a port range inbound, so the server can connect back',
      ],
      answer: 2,
      explain: 'The control connection goes to port 21. In passive mode the client also opens each data connection, to a port the server announced in its PASV reply, so that range must be allowed too. Port 20 and the inbound connection back to the client belong to active mode. FTP never carries data on the control connection.',
    },
    {
      type: 'single',
      prompt: 'A capture of only the port 21 traffic is taken while a download from the supplier fails. What can that capture show?',
      options: [
        'The file bytes received before the failure, since FTP sends content there',
        'The directory listing that the flow asked for with LIST',
        'Only the login, since the control channel closes right after it',
        'The RETR command and the numbered server replies, but no file bytes',
      ],
      answer: 3,
      explain: 'The control channel carries text commands and numbered replies for the whole session. File content and listings go over a separate data connection, so a capture of port 21 alone holds neither.',
    },
    {
      type: 'multi',
      prompt: 'A firewall drops every FTP data connection to the supplier, while port 21 works. Which steps of the polling flow still succeed?',
      options: ['Login with USER and PASS', 'A directory listing with LIST', 'A change of directory with CWD', 'A download with RETR', 'An upload with STOR'],
      answer: [0, 2],
      explain: 'Login and CWD only get a reply on the control channel. Listings, downloads and uploads move bytes, so each one opens a data connection and hangs when it is blocked. That is why a login can work while the first listing hangs.',
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
      prompt: 'A Mule app on CloudHub 2.0 has its FTP connector set to active mode for the supplier. Login works, but LIST hangs. What is the likely cause and fix?',
      options: [
        'The server cannot open a connection back to the Mule worker, so use passive mode',
        'Mule cannot reach the port in the PASV reply, so ask the supplier to open that range',
        'The listing needs port 20 open outbound from Mule, so add a firewall rule for it',
        'The supplier allows one connection per user, so log out before the listing',
      ],
      answer: 0,
      explain: 'In active mode the server connects back to the client, from its port 20 to a port the client sent with PORT. A CloudHub worker cannot take that inbound connection. In passive mode the client connects to a port the server announced with its PASV reply, which works through NAT. An outbound rule for port 20 does not help, since the connection comes in.',
    },
    {
      type: 'single',
      prompt: 'A Mule FTP flow works against the test server. Against the supplier production server, in passive mode, login works and every LIST hangs until a timeout. Mule allows all outbound traffic. Where is the problem most likely?',
      options: [
        'The supplier user has no list rights, which shows up as a hang',
        'The supplier firewall allows port 21 but not its passive data ports',
        'Port 20 must be open inbound on the Mule side for passive mode',
        'The control connection drops after login, so LIST is never sent',
      ],
      answer: 1,
      explain: 'Firewalls must allow the data connections, not only port 21. A login that works while LIST or RETR hangs is the classic sign that the data channel is blocked. Missing rights give a quick 550 reply, not a hang. Port 20 belongs to active mode, and a dropped control connection fails the command at once.',
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
