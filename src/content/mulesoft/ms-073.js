export default {
  id: 'ms-073',
  category: 'mulesoft',
  title: 'FTP, SFTP or File Connector? Choosing the Right Transport for Partner File Exchange',
  level: 'INTERMEDIATE',
  tags: ['ftp', 'sftp', 'file', 'connectors', 'security', 'b2b', 'partner-integration'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A bank partner will send payment files containing account data over the internet. Which connector is the right default?',
      options: [
        'SFTP connector: credentials and data travel encrypted over SSH on a single port (22)',
        'FTP connector in passive mode, because passive mode encrypts the data channel',
        'File connector pointed at a network path published to the internet',
        'FTP connector, because it is faster and the files are already zipped',
      ],
      answer: 0,
      explain: 'SFTP runs over SSH, so login and file content are encrypted. Passive mode only changes **who opens the data connection**; it does not encrypt anything — plain FTP sends the password and the file in clear text.',
    },
    {
      type: 'single',
      prompt: 'An internal FTP server sits behind a firewall/NAT. The Mule app logs in successfully but hangs or fails when listing a directory. What is the most likely fix?',
      options: [
        'Use passive mode, so the client opens the data connection to the server instead of the server connecting back to the client',
        'Switch the FTP connection to port 22',
        'Enable watermarking on the listener',
        'Increase the response timeout of the HTTP listener',
      ],
      answer: 0,
      explain: 'FTP uses a control connection (port 21) plus separate data connections. In active mode the server connects back to the client, which firewalls/NAT usually block, so login works but LIST/RETR fail. Passive mode lets the client open the data connection.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about SFTP authentication and trust are correct?',
      options: [
        'The connector can authenticate with a username and password or with a private key (identity file, optionally with a passphrase)',
        'Verifying the server against a known hosts entry protects against connecting to an impostor server',
        'When the partner rotates the server host key, a strict known-hosts check fails until the new key is trusted',
        'SFTP is FTP over TLS and needs the same passive-mode data ports as FTP',
      ],
      answer: [0, 1, 2],
      explain: 'SFTP is a subsystem of SSH: one connection, password or key authentication, and host-key verification. FTP over TLS is **FTPS**, a different protocol with FTP-style control and data channels.',
    },
    {
      type: 'single',
      prompt: 'An app on CloudHub with 2 workers uses the **File** connector to read partner files from `/data/inbound`. What is wrong with this design?',
      options: [
        'The File connector reads the local file system of each worker: it is ephemeral and not shared, so partners cannot deliver there and workers see different files',
        'The File connector cannot read CSV files',
        'The File connector only works with Windows paths',
        'Nothing; the File connector is designed for partner exchange on CloudHub',
      ],
      answer: 0,
      explain: 'The File connector works on a file system mounted on the runtime host. That suits on-prem runtimes with a shared/NFS mount; on CloudHub the disk is local to each worker and temporary, so partner exchange should go through SFTP or object storage.',
    },
    {
      type: 'match',
      prompt: 'Match each scenario to the most suitable connector.',
      pairs: [
        ['External partner sends invoices over the internet', 'SFTP connector with key authentication'],
        ['On-prem runtime reads exports dropped by a mainframe job on a mounted NFS share', 'File connector'],
        ['Legacy internal system that only supports FTP, reachable only through the private network', 'FTP connector in passive mode, as an accepted exception'],
      ],
      explain: 'Use SFTP for anything crossing a network you do not control, and File for a file system the runtime itself mounts. Use plain FTP only where it cannot be avoided and the traffic stays on a trusted network.',
    },
    {
      type: 'single',
      prompt: 'All three connectors offer the same core operations. Which pair is correct?',
      options: [
        'sftp:move with sourcePath and targetPath; sftp:write with mode OVERWRITE, APPEND or CREATE_NEW',
        'sftp:copy with from and to; sftp:write with mode INSERT or UPDATE',
        'sftp:rename with sourcePath and targetPath; sftp:delete with directoryPath',
        'sftp:list with sourcePath; sftp:read with fileName and folder',
      ],
      answer: 0,
      explain: 'move/copy take sourcePath and targetPath, write takes path and a mode (default OVERWRITE), rename takes path and to, delete takes path, list takes directoryPath. The same names apply with the ftp and file prefixes.',
    },
  ],
  description: `
A logistics company is onboarding **35 trading partners** who exchange orders, invoices and proof-of-delivery files. Today a mix of mechanisms exists:
- A carrier sends shipment files to an **FTP** server on the company's DMZ, username and password in a shared spreadsheet.
- Two banks require **SFTP** with key-based authentication and want the company's public key.
- An on-prem AS400 job writes nightly exports to an **NFS share** mounted on the on-prem Mule runtime.
- A new CloudHub app was built with the **File** connector reading \`/data/inbound\`, "because SFTP is slow".

Security has asked the integration team to standardise.

**Questions**
1. Compare FTP, SFTP and File connectors: security, ports and network behaviour, authentication.
2. Why does the internal FTP connection log in successfully but fail when listing files from behind the firewall?
3. Which connector should each of the four scenarios use, and why is the CloudHub + File connector design wrong?
4. What would you put in a partner onboarding checklist for SFTP?
`,
  answerTemplate: `## FTP vs SFTP vs File

## The FTP listing problem

## Connector per scenario

## SFTP onboarding checklist
`,
  keyPoints: [
    'FTP: port 21 control connection plus separate data connections, everything in clear text (credentials and files).',
    'Active vs passive FTP: passive mode lets the client open the data connection, which works through firewalls/NAT; it adds no encryption.',
    'SFTP: runs over SSH on one port (22), encrypted, password or private-key authentication, server identity checked through known hosts.',
    'File connector: reads a file system mounted on the runtime host — good for on-prem shares, wrong for CloudHub where the disk is local and temporary.',
    'All three connectors share the same operations (listener, read, write, list, move, copy, rename, delete, create-directory) with ftp / sftp / file prefixes.',
    'Standardise on SFTP with key authentication for external partners; keep plain FTP only as a documented exception on trusted networks.',
  ],
  solution: `
**1. Comparison.**

| | FTP | SFTP | File |
|---|---|---|---|
| Transport | Control on 21 + separate data connections | SSH, one connection, port 22 | Local / mounted file system |
| Encryption | None — password and data in clear text | Everything encrypted | n/a (depends on the share) |
| Authentication | Username/password | Password or private key (+ passphrase) | OS permissions of the runtime user |
| Server identity | None | Host key checked against known hosts | n/a |
| Typical use | Legacy, trusted network only | Partners over the internet | On-prem runtime with an NFS/SMB mount |

**2. The listing problem.** FTP opens a new data connection for every LIST/RETR/STOR. In **active** mode the server connects back to the client, which a firewall or NAT blocks — so the login (control channel) works and listing hangs. **Passive** mode makes the client open the data connection to a port the server advertises; the firewall must allow that passive port range. Passive mode does not encrypt anything.

**3. Per scenario.**
- Carrier on DMZ FTP: migrate to **SFTP** with per-partner accounts and keys; until then restrict by IP and rotate the shared password.
- Banks: **SFTP** with private key authentication; give them your public key, pin their host key.
- AS400 exports on NFS: **File** connector on the on-prem runtime is fine — the share is mounted there.
- CloudHub + File: wrong. Each worker has its own temporary disk, partners cannot reach it, and files disappear on restart. Use **SFTP** (or object storage such as S3/Azure Blob) as the landing zone.

**4. SFTP onboarding checklist.** Per-partner user and home directory with \`inbound/\`, \`outbound/\`, \`archive/\`, \`error/\`; key authentication (no shared passwords); exchange and pin host keys with a documented rotation procedure; IP allow-listing; file naming convention and "upload as .tmp then rename" rule; maximum file size and expected schedule; contact for failures; test file before go-live.
`,
  followUps: [
    {
      q: 'Is FTPS the same as SFTP?',
      a: 'No. FTPS is FTP secured with TLS — it keeps the FTP control and data channels (and their firewall issues). SFTP is a different protocol running over SSH.',
    },
    {
      q: 'Where do you keep the SFTP private key for a CloudHub app?',
      a: 'Not in the source repository. Store it as a secure property / secret and provide it at deployment, restricting who can read it; rotate it on a schedule.',
    },
    {
      q: 'Why can SFTP feel slower than FTP?',
      a: 'Encryption and SSH handshakes add overhead, especially when the app reconnects for every file. Connection pooling, fewer list calls and parallel transfers usually close the gap; security is not traded away for speed.',
    },
  ],
}
