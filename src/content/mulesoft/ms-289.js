export default {
  id: 'ms-289',
  category: 'mulesoft',
  title: 'Living With a Plain FTP Partner: Risks, Compensating Controls and a Migration Plan',
  level: 'EXPERT',
  tags: ['myproject', 'ftp', 'planning-platform', 'security', 'pgp', 'migration', 'architecture'],
  estMinutes: 30,
  quiz: [
    {
      type: 'multi',
      prompt: 'A supplier sends nightly price files to Mule over plain FTP across the internet. It PGP encrypts each file to the Mule public key, but does not sign it. What can an attacker on the path still do?',
      options: [
        'Read the FTP user name and password',
        'Read the prices inside the encrypted file',
        'Upload a fake price file encrypted to the same public key',
        'Decrypt the file with the public key, since that key is shared',
        'Log in later with the captured password and change the folder',
      ],
      answer: [0, 2, 4],
      explain: 'FTP sends everything in clear text, including PASS, so the password can be read and reused. Encryption hides the prices, and only the Mule private key can decrypt them. But the public key is public, so anyone can encrypt a fake file to it. Without a signature Mule cannot tell who made the file.',
    },
    {
      type: 'single',
      prompt: 'The supplier cannot move off plain FTP for six months. Which control protects the file content in the meantime?',
      options: [
        'Rotating the FTP password every week',
        'PGP encrypting and signing the file before it is sent',
        'A SHA-256 checksum file sent next to each data file',
        'An IP allow list, so only the supplier address can connect',
      ],
      answer: 1,
      explain: 'PGP protects the content end to end: encryption hides it and the signature proves who made it. A new password still travels in clear text on every login. A checksum sent over the same channel can be swapped together with the file, and it hides nothing. An allow list limits who connects, but the content still crosses the internet readable. The password needs its own controls.',
    },
    {
      type: 'multi',
      prompt: 'Which controls reduce the risk of the clear text password?',
      options: [
        'A dedicated account limited to one folder, with no shell or other access',
        'An IP allow list on the server for the Mule egress addresses',
        'Running the traffic through a private link or VPN',
        'PGP encrypting and signing each file before it is sent',
        'Keeping the password in secure properties in the Mule app',
        'Using passive mode, so the server never opens a connection to Mule',
      ],
      answer: [0, 1, 2],
      explain: 'A locked down account limits what a stolen password can reach. An IP allow list limits who can use it. A private link or VPN keeps the clear text off the open network. PGP protects the file content, but the USER and PASS commands still cross the network in clear text. Secure properties protect the password at rest in the app, but FTP still sends it in clear text on the wire. Passive mode only changes who opens the data connection.',
    },
    {
      type: 'single',
      prompt: 'How would you check that a file arrived unchanged over plain FTP?',
      options: [
        'Compare the size with the size the supplier logged',
        'Verify a PGP signature, then check the trailer counts',
        'Compare the file modified times on both servers',
        'Check that Mule can parse every line of the file',
      ],
      answer: 1,
      explain: 'A size or time match, or a clean parse, does not prove the content is the same. A signature does, and the trailer counts show the file is complete.',
    },
    {
      type: 'order',
      prompt: 'Put the migration from FTP to SFTP in order.',
      items: [
        'Agree the target protocol, host key or certificate exchange and a cut over date with the partner',
        'Set up the SFTP account, folders and keys in test',
        'Run both channels in parallel in test and compare files',
        'Switch production, keep FTP read only for a short fallback period',
        'Disable the FTP account and remove its firewall rules',
      ],
      explain: 'Parallel runs catch format and line ending differences. Removing the old rules closes the risk for good.',
    },
    {
      type: 'single',
      prompt: 'A security reviewer asks why the FTP feed is still live. What is the strongest answer?',
      options: [
        'The files are PGP encrypted, so nobody on the path can read the prices',
        'A recorded risk with an owner, controls in place and a dated exit plan',
        'The files hold no personal or payment data, so plain FTP is an acceptable risk',
        'The firewall allows only this supplier to reach the server',
      ],
      answer: 1,
      explain: 'Reviewers accept a known, controlled and time boxed risk far more readily than a forgotten one. Encryption covers the content but not the clear text password. Low sensitivity data still lets a stolen login plant fake prices. A firewall rule limits the source address but does not protect what crosses the internet. Each is one control, not a reason to keep the feed.',
    },
  ],
  description: `
Larkfield Grocers receives supplier lead times and pack sizes over plain FTP from an older supplier system. Mule loads them, and they flow into the item master sent to the planning platform. A security review flags the feed. The supplier says it cannot offer SFTP or FTPS for six months.

**Questions**
1. What exactly is at risk with plain FTP?
2. Which controls would you put in place now?
3. How do you check that files are complete and unchanged?
4. How would you plan the move to SFTP?
`,
  answerTemplate: `## The risk

## Controls now

## Complete and unchanged

## Migration plan
`,
  keyPoints: [
    'FTP exposes the password and content, and has no integrity check.',
    'PGP encrypt and sign the file so content and integrity do not depend on the transport.',
    'Use a dedicated account limited to one folder.',
    'Add an IP allow list and, where possible, a VPN or private link.',
    'Check signatures or hashes plus trailer counts.',
    'Record the risk with an owner and a dated migration plan.',
  ],
  solution: `
**1. The risk.** Anyone on the path can read the password and the content, and can change the file without detection. Wrong lead times or pack sizes would flow into the item master and from there into plans.

**2. Controls now.** Ask the supplier to PGP encrypt and sign the file, and verify the signature in Mule before loading. Use a dedicated FTP account that can only reach its folder. Restrict the server to known addresses, and run the traffic over a VPN or private link if both sides can. Keep the password in secure properties and rotate it on a schedule.

**3. Complete and unchanged.** Verify the PGP signature, then check the header and the trailer count and totals. Reject the file to an error folder on any mismatch, alert, and do not send partial data to the planning platform.

**4. Migration plan.** Agree SFTP with the supplier, exchange keys and host key fingerprints, set up folders in test and run both channels in parallel to compare files. Cut over on a set date, keep FTP for a short fallback, then disable the account and the firewall rules. Record the risk with an owner until the old channel is gone.
`,
  followUps: [
    {
      q: 'Does PGP solve the password problem?',
      a: 'No. The FTP password still travels in clear text. PGP protects the file, while the account limits and IP rules limit what a stolen password can do.',
    },
    {
      q: 'Why sign as well as encrypt?',
      a: 'Encryption hides the content. A signature proves who wrote it and that it was not changed, which matters for data that drives orders.',
    },
    {
      q: 'What would you do if the supplier misses the migration date?',
      a: 'Escalate through the business owner, keep the controls, and record a new date. Do not let the exception become permanent without a decision.',
    },
  ],
}
