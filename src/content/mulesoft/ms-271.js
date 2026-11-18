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
      prompt: 'Which protocol does SFTP run on, and on which default port?',
      options: ['TLS on port 990', 'SSH on port 22', 'HTTP on port 80', 'FTP on port 21'],
      answer: 1,
      explain: 'SFTP is the SSH File Transfer Protocol. One SSH connection carries the commands and the data.',
    },
    {
      type: 'single',
      prompt: 'What is FTPS?',
      options: [
        'FTP tunnelled through SSH',
        'FTP protected by TLS, either explicit, upgraded with AUTH TLS on port 21, or implicit, usually on port 990',
        'Another name for SFTP',
        'A faster FTP',
      ],
      answer: 1,
      explain: 'FTPS keeps the FTP commands and adds TLS with server certificates, as HTTPS does for HTTP.',
    },
    {
      type: 'multi',
      prompt: 'What are the problems with plain FTP?',
      options: [
        'The user name and password travel in clear text',
        'File content travels in clear text',
        'A separate data connection makes firewalls and passive mode harder',
        'It cannot transfer binary files',
      ],
      answer: [0, 1, 2],
      explain: 'FTP has a binary mode. Its problems are no encryption and the extra data connection.',
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
      prompt: 'Is SFTP a secure version of FTP?',
      options: [
        'Yes, it is FTP with encryption added',
        'No, it is a different protocol built on SSH, with its own commands',
        'Yes, it is FTPS with a new name',
        'No, SFTP has no encryption',
      ],
      answer: 1,
      explain: 'The names are close, but SFTP shares nothing with FTP except the purpose.',
    },
    {
      type: 'single',
      prompt: 'A partner offers FTPS. Which Mule connector do you use?',
      options: ['The SFTP connector', 'The FTPS connector', 'The HTTP connector', 'The File connector'],
      answer: 1,
      explain: 'Mule has separate FTP, FTPS and SFTP connectors, because the protocols are different.',
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
