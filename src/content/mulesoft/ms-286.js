export default {
  id: 'ms-286',
  category: 'mulesoft',
  title: 'FTPS Explicit and Implicit: AUTH TLS, PROT P, Certificates and Data Channel Errors',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'ftps', 'tls', 'certificates', 'troubleshooting'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'How does explicit FTPS start?',
      options: [
        'TLS starts at once on port 990',
        'The client connects to port 21 in plain text and sends AUTH TLS to upgrade the control channel',
        'The client opens an SSH session',
        'The server sends a certificate by email',
      ],
      answer: 1,
      explain: 'Explicit FTPS upgrades the connection. Implicit FTPS expects TLS from the first byte, usually on port 990.',
    },
    {
      type: 'single',
      prompt: 'Login over FTPS works, but files travel in clear text. Which command was missing?',
      options: ['PASV', 'PROT P, after PBSZ 0, to protect the data channel', 'TYPE I', 'REST 0'],
      answer: 1,
      explain: 'AUTH TLS protects the control channel. PROT P asks for TLS on the data connections too. PROT C means clear data.',
    },
    {
      type: 'single',
      prompt: 'The server log says the TLS session of the data connection was not resumed, and transfers fail with a 4xx reply. What is going on?',
      options: [
        'The password is wrong',
        'The server requires the data connection to reuse the TLS session of the control connection, and the client does not',
        'The file is too big',
        'Active mode is off',
      ],
      answer: 1,
      explain: 'Some servers require session reuse to stop data connection hijacking. Some Java clients do not reuse the session. Check the connector version and the server setting with the partner.',
    },
    {
      type: 'multi',
      prompt: 'What do you need to set up trust for FTPS in Mule?',
      options: [
        'A truststore with the server certificate or its issuing CA',
        'A keystore with a client certificate, if the partner requires client certificates',
        'The SSH host key fingerprint',
        'A TLS context on the connector configuration',
      ],
      answer: [0, 1, 3],
      explain: 'FTPS uses TLS certificates, like HTTPS. Host key fingerprints belong to SFTP.',
    },
    {
      type: 'single',
      prompt: 'Why should you never turn off certificate checks to make an FTPS connection work?',
      options: [
        'It slows the transfer',
        'Without the check, anyone in the path can pose as the server and read or change the files',
        'It changes the port',
        'It breaks binary mode',
      ],
      answer: 1,
      explain: 'Encryption without server checks protects against passive listening only. Fix the truststore instead.',
    },
    {
      type: 'single',
      prompt: 'Why can explicit FTPS fail through a firewall that worked for plain FTP?',
      options: [
        'TLS needs port 22',
        'The firewall can no longer read PASV replies to open data ports, so a fixed passive range must be open',
        'Explicit FTPS uses UDP',
        'Firewalls block AUTH',
      ],
      answer: 1,
      explain: 'This is the most common FTPS go live problem. Agree the passive range with the partner and open it.',
    },
  ],
  description: `
Larkfield Grocers must move a supplier feed from plain FTP to FTPS before a security audit. The supplier offers explicit FTPS on port 21. In test, the Mule app logs in, but listings fail, and after a firewall change the server reports that the data connection did not resume the TLS session.

**Questions**
1. What is the difference between explicit and implicit FTPS?
2. How are the control and data channels protected?
3. What do you configure in Mule for trust?
4. How would you work through the listing and session errors?
`,
  answerTemplate: `## Explicit and implicit

## Control and data channels

## Trust in Mule

## Working through the errors
`,
  keyPoints: [
    'Explicit: plain connect on 21, then AUTH TLS. Implicit: TLS from the start, usually 990.',
    'PBSZ 0 and PROT P protect the data channel.',
    'Mule needs a TLS context with a truststore, and a keystore for client certificates.',
    'Never disable certificate checks.',
    'Firewalls cannot inspect encrypted PASV replies, so open a fixed passive range.',
    'Some servers require TLS session reuse on data connections.',
  ],
  solution: `
**1. Explicit and implicit.** Explicit FTPS connects to port 21 in plain text and sends AUTH TLS to switch the control channel to TLS. Implicit FTPS starts TLS at once, usually on port 990. Explicit is the more common choice today. The Mule FTPS connector must be set to the mode the server expects.

**2. Control and data channels.** AUTH TLS covers the control channel, so login and commands are encrypted. The client then sends PBSZ 0 and PROT P to ask for TLS on every data connection. With PROT C the data goes in clear text, which defeats the purpose.

**3. Trust in Mule.** Configure a TLS context on the FTPS connection with a truststore holding the server certificate or its CA. If the supplier requires client certificates, add a keystore. Keep passwords in secure properties.

**4. Working through the errors.** For listings that fail after login, check the passive range and external address, since the firewall cannot read the encrypted PASV reply. For the session reuse error, the server wants the data connection to reuse the control connection's TLS session. Ask the supplier whether that rule can be relaxed for your account, and check whether your connector version supports session reuse. Test each change from the same network as the Mule workers.
`,
  followUps: [
    {
      q: 'Is FTPS as good as SFTP for security?',
      a: 'With certificate checks and PROT P, both encrypt the transfer. SFTP needs fewer firewall rules because it uses one port.',
    },
    {
      q: 'What is CCC?',
      a: 'Clear Command Channel. It drops TLS on the control channel after login so firewalls can read PASV replies again. It weakens protection and many servers refuse it.',
    },
    {
      q: 'The supplier certificate expires next month. What do you do?',
      a: 'Get the new certificate or CA early, add it to the truststore next to the old one, deploy, and remove the old one after the switch.',
    },
  ],
}
