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
      prompt: 'A partner gives host ftp.partner.example, port 21, FTPS required. The client is set to implicit FTPS on port 21, and the connection hangs, then fails with a TLS handshake error. What is wrong?',
      options: [
        'The server expects plain text first and an AUTH TLS upgrade, which is explicit FTPS',
        'Implicit FTPS is right, but the server wants PROT P sent before the TLS handshake',
        'Implicit FTPS is right, but the server starts TLS only after a plain text login',
        'Implicit FTPS is right, but the client must send AUTH SSL instead of AUTH TLS',
      ],
      answer: 0,
      explain: 'On port 21 the server greets in plain text and waits for AUTH TLS to upgrade the control channel. That is explicit FTPS. An implicit client sends a TLS handshake as its first bytes, which the plain text server does not understand. Implicit FTPS expects TLS from the first byte, usually on port 990, and sends no AUTH command at all. PROT P comes after the upgrade, and a login before TLS would send the password in clear text.',
    },
    {
      type: 'single',
      prompt: 'Login over FTPS works, but files travel in clear text. Which command was missing?',
      options: ['AUTH SSL', 'PROT P', 'PROT C', 'CCC'],
      answer: 1,
      explain: 'PROT P is sent after PBSZ 0. AUTH TLS protects the control channel. CCC turns TLS off on the control channel. PROT P asks for TLS on the data connections too. PROT C means clear data.',
    },
    {
      type: 'single',
      prompt: 'The server log says the TLS session of the data connection was not resumed, and transfers fail with a 4xx reply. What is going on?',
      options: [
        'The client certificate expired between the control and data connections',
        'The server needs the data connection to reuse the control TLS session',
        'The firewall closed the passive port range after the change',
        'The data connection used TLS 1.3, which this server does not allow',
      ],
      answer: 1,
      explain: 'The server requires the data connection to reuse the TLS session of the control connection, and the client does not. Some servers require session reuse to stop data connection hijacking. Some Java clients do not reuse the session. Check the connector version and the server setting with the partner.',
    },
    {
      type: 'multi',
      prompt: 'A partner moves its feed from plain FTP to FTPS, signs its server certificate with a private CA and requires client certificates. What does the Mule FTP config need?',
      options: [
        'A truststore with the private CA that signed the server certificate',
        'The server host key fingerprint, added to a known_hosts file',
        'A keystore with the client certificate and its private key',
        'A TLS context on the FTP connection config',
        'A truststore set to insecure, since a private CA cannot be checked',
      ],
      answer: [0, 2, 3],
      explain: 'FTPS uses TLS certificates, like HTTPS. The truststore lets Mule trust a server certificate from a private CA, the keystore holds the client certificate the partner asks for, and the TLS context on the connection ties them in. Host key fingerprints and known_hosts belong to SFTP, which runs over SSH. A private CA can be checked once its certificate is in the truststore. Setting the truststore to insecure accepts any server certificate, which throws the protection away.',
    },
    {
      type: 'single',
      prompt: 'In test, the FTPS connection fails with a certificate path error. A colleague sets insecure on the trust store and transfers work. Why must this not reach production?',
      options: [
        'Insecure mode also sends the data channel in clear text, so files are exposed',
        'Insecure mode skips the client certificate, so production servers will reject it',
        'Insecure mode turns off TLS session reuse, which production servers require',
        'Without the check, anyone in the path can pose as the server',
      ],
      answer: 3,
      explain: 'Insecure accepts any server certificate, so a fake server can read or change the files. The data is still encrypted, but encryption without server checks protects against passive listening only. It does not change what the client sends as its own certificate or how sessions are reused. Fix the truststore instead.',
    },
    {
      type: 'single',
      prompt: 'Why can explicit FTPS fail through a firewall that worked for plain FTP?',
      options: [
        'The firewall blocks port 21 once it sees TLS traffic on the control channel',
        'The firewall cannot read PASV replies, so the data ports stay closed',
        'Explicit FTPS moves the data connections to port 990',
        'The firewall drops the AUTH TLS command as an unknown verb',
      ],
      answer: 1,
      explain: 'A fixed passive range must be opened instead. This is the most common FTPS go live problem. Agree the passive range with the partner and open it.',
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
