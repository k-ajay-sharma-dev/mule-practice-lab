export default {
  id: 'ms-271',
  category: 'mulesoft',
  title: 'SFTP, FTPS and FTP: Protocols, Ports and What Each One Protects',
  level: 'BEGINNER',
  tags: ['myproject', 'sftp', 'ftps', 'ftp', 'ssh', 'tls', 'protocols'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A supplier sends connection details: port 21, protocol "SFTP", a user and a password. The Mule SFTP connector fails in the handshake with a protocol error. What is the most likely mix up?',
      options: [
        'The supplier host key is missing from known hosts, which shows as a protocol error',
        'The SFTP connector needs passive mode for any port other than 22',
        'The server refuses password login, since SFTP on port 21 needs a key',
        'The supplier runs FTP or FTPS on port 21, which the SFTP connector cannot speak',
      ],
      answer: 3,
      explain: 'SFTP is the SSH File Transfer Protocol, usually on port 22, and port 21 is the FTP control port. An SSH client that meets an FTP server fails in the handshake. A missing host key gives a host key error, not a protocol error. Passive mode belongs to FTP, and the login method comes after the handshake. Ask whether the supplier means SFTP or FTPS.',
    },
    {
      type: 'single',
      prompt: 'A supplier uses implicit FTPS in passive mode. The firewall team asks which outbound ports Mule needs to reach it. What do you tell them?',
      options: [
        'Port 21 only, since TLS is added on that port with AUTH TLS',
        'Port 990 only, since FTPS carries the data on the control connection',
        'Port 990, plus the passive data port range the supplier announces',
        'Port 990 and port 20, since the data always comes from port 20',
      ],
      answer: 2,
      explain: 'Implicit FTPS starts TLS at once, usually on port 990. It is still FTP, so files and listings use separate data connections, and in passive mode Mule opens them to ports the server announces. Port 21 with AUTH TLS is explicit FTPS. Port 20 is the server side of active mode. One connection for everything is SFTP.',
    },
    {
      type: 'multi',
      prompt: 'An old supplier still receives payroll files over plain FTP on port 21 across the internet. What can someone who captures that traffic read?',
      options: [
        'The FTP user name and password',
        'Nothing from the data connections, since they use random ports',
        'The file content',
        'Only file names, since binary mode hides the content',
        'The directory listings the flow asks for',
      ],
      answer: [0, 2, 4],
      explain: 'Plain FTP encrypts nothing. The login travels on the control connection in clear text, and file content and listings travel on data connections in clear text. A random port is no protection, and binary mode only stops line ending changes. Move the supplier to SFTP or FTPS.',
    },
    {
      type: 'match',
      prompt: 'Match each protocol to what it is.',
      pairs: [
        ['SFTP', 'A file protocol inside one SSH connection, with key or password login'],
        ['FTPS', 'FTP commands and data protected by TLS certificates'],
        ['FTP', 'Commands and data with no encryption'],
        ['SCP', 'Copies files over SSH, with no listing or rename commands'],
      ],
      explain: 'Interviewers often check that you do not mix up SFTP and FTPS.',
    },
    {
      type: 'single',
      prompt: 'A supplier moving from FTP to SFTP wants to keep its passive port range open and its FTP client settings, with SSH added on top. What do you tell them?',
      options: [
        'That works, since SFTP is FTP with SSH encryption on the data channel',
        'That works, since SFTP is FTPS under another name, with a certificate added',
        'They also need port 990 open, for the encrypted data channel',
        'They need an SFTP client and one SSH port, usually 22, with no data range',
      ],
      answer: 3,
      explain: 'The names are close, but SFTP shares nothing with FTP except the purpose. It is its own protocol inside one SSH connection, so there is no data channel and no passive range. FTPS is the one that adds TLS to FTP, and port 990 is implicit FTPS.',
    },
    {
      type: 'single',
      prompt: 'The SFTP connector works for one partner. A new partner offers FTPS, and a developer plans to reuse the SFTP config with the new host and port. What happens?',
      options: [
        'It works once the partner TLS certificate is added to known hosts',
        'It fails, since FTPS is FTP with TLS and needs the FTPS connector',
        'It works once the port is set to 990, which switches the connector to TLS',
        'It works, but the SFTP connector falls back to clear text FTP',
      ],
      answer: 1,
      explain: 'Mule has separate FTP, FTPS and SFTP connectors, because the protocols are different. The SFTP connector speaks SSH only, whatever the port. Known hosts holds SSH host keys, not TLS certificates, which go in a TLS context on the FTPS connector. The SFTP connector has no FTP fallback.',
    },
  ],
  description: `
Brindle Outdoor exchanges files with suppliers, a logistics partner and a supply chain planning platform. Some partners offer SFTP, one offers FTPS and an old supplier still uses plain FTP. A new team member asks what the difference is.

**Questions**
1. What are SFTP, FTPS and FTP, and which ports do they use?
2. What does each one protect?
3. Why is plain FTP a problem?
4. Which Mule connector goes with each?
`,
  answerTemplate: `## The three protocols

## What they protect

## The problem with FTP

## Mule connectors
`,
  keyPoints: [
    'SFTP runs inside SSH, usually on port 22.',
    'FTPS is FTP with TLS: explicit on 21 or implicit on 990.',
    'FTP sends passwords and data in clear text.',
    'FTP and FTPS use a separate data connection, which affects firewalls.',
    'Mule has separate FTP, FTPS and SFTP connectors.',
  ],
  solution: `
**1. The three protocols.** SFTP is the SSH File Transfer Protocol. It runs inside one SSH connection, usually on port 22. FTPS is classic FTP protected by TLS: explicit FTPS connects on port 21 and upgrades with AUTH TLS, implicit FTPS starts with TLS, usually on port 990. FTP is the old protocol on port 21 with no encryption.

**2. What they protect.** SFTP encrypts commands and data, checks the server with its host key, and logs in with a password or an SSH key. FTPS encrypts with TLS and checks the server with a certificate, and can use client certificates. Both protect data in transit only. The file is plain once it sits on the server.

**3. The problem with FTP.** The user name, password and content can be read by anyone on the path. FTP and FTPS open a second connection for data, often in passive mode on a range of ports, which firewalls must allow. SFTP needs only one port.

**4. Mule connectors.** Mule has separate FTP, FTPS and SFTP connectors with similar operations: list, read, write, move, rename, delete and a listener for new files.
`,
  followUps: [
    {
      q: 'A partner says their SFTP server is on port 21. What do you suspect?',
      a: 'They probably mean FTP or FTPS. Ask for the protocol, the host key fingerprint or certificate, and test with a client before configuring Mule.',
    },
    {
      q: 'Why do firewall teams prefer SFTP?',
      a: 'It needs one port. FTP and FTPS need a control port plus a range of data ports for passive mode.',
    },
    {
      q: 'Does SFTP make the file safe on the partner server?',
      a: 'No. It protects the transfer only. Encrypt the file itself, for example with PGP, if it must stay protected at rest.',
    },
  ],
}
