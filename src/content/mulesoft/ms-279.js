export default {
  id: 'ms-279',
  category: 'mulesoft',
  title: 'PGP Encryption for SFTP File Exchange: Keys, Signing, Order of Steps and Key Rotation',
  level: 'EXPERT',
  tags: ['myproject', 'sftp', 'pgp', 'crypto-module', 'encryption', 'key-rotation', 'security'],
  estMinutes: 28,
  quiz: [
    {
      type: 'single',
      prompt: 'Mule PGP encrypts a payroll file for a bank. The developer set the encrypt step to use the team\'s own public key, and the bank cannot decrypt the file. What should the encrypt step use?',
      options: [
        'The team\'s private key, which the bank checks with the team public key',
        'The team\'s public key, with the team private key sent to the bank as well',
        'The bank\'s private key, so the bank opens it with its public key',
        'The bank\'s public key, so only the bank\'s private key opens it',
      ],
      answer: 3,
      explain: 'The bank\'s public key is used, so only the bank\'s private key can decrypt the file. A file encrypted with the team key can be read only by the team. Using your private key is signing, which proves origin but hides nothing. A private key never leaves its owner, and the bank would not hand over its own.',
    },
    {
      type: 'single',
      prompt: 'The bank also wants proof that the file came from you and was not changed. What do you add?',
      options: [
        'A signature made with the bank’s public key, checked with its private key',
        'A signature made with your private key, checked with your public key',
        'A second encryption layer, using your own public key',
        'A SHA-256 checksum sent in a separate file next to the data',
      ],
      answer: 1,
      explain: 'Signing proves origin and integrity. Encryption alone does not show who sent the file.',
    },
    {
      type: 'order',
      prompt: 'Order the outbound steps.',
      items: [
        'Build the file content',
        'Sign and encrypt it with PGP',
        'Write it to the SFTP server under a temporary name such as payroll.csv.pgp.tmp',
        'Rename it to payroll.csv.pgp',
        'Log the file name, size and key ids used',
      ],
      explain: 'Encrypt before the file leaves Mule, so it is protected in transit and at rest on the server.',
    },
    {
      type: 'multi',
      prompt: 'The bank will change its PGP key next month. What should your team do?',
      options: [
        'Get the new public key through a trusted channel and check its fingerprint',
        'Agree the switch date, and keep the old key until files from before the switch are confirmed',
        'Make the key a configuration value per environment, so the switch is a property change',
        'Import the new key on the switch date and remove the old one that day',
        'Delete the bank\'s old public key as soon as the new one arrives',
        'Make a new key pair for your own side, since the bank\'s change needs one',
      ],
      answer: [0, 1, 2],
      explain: 'Rotation is a planned change on both sides. Get the new public key through a trusted channel and check its fingerprint, since an email can be forged. Agree the switch date and keep the old key until files from before the switch are confirmed, because confirmations signed with the old key can still arrive. A key in a property makes the switch a configuration change, while a key in code turns it into a release. Deleting the old key on arrival, or on the switch date, breaks checks on files sent before the switch. The bank\'s new key changes how you encrypt to the bank and check its signatures. Your own key pair can stay as it is.',
    },
    {
      type: 'single',
      prompt: 'SFTP already encrypts the connection. Why add PGP?',
      options: [
        'SFTP uses weak ciphers that banks are not allowed to accept',
        'SFTP protects data in transit only, not the file at rest',
        'PGP replaces the SSH key login, so no account password is needed',
        'SFTP encrypts only the login, not the file content',
      ],
      answer: 1,
      explain: 'On the server and in later folders the file is plain unless it is encrypted itself. PGP protects the file end to end, through every hop and folder until the bank decrypts it.',
    },
    {
      type: 'single',
      prompt: 'An inbound file from the bank fails to decrypt with "secret key not found". What is the likely cause?',
      options: [
        'The passphrase for your private key is wrong in this environment',
        'The bank used a key id your keyring does not hold, old or new',
        'The file was signed but not encrypted, so there is nothing to decrypt',
        'The bank’s public key is missing from your keyring',
      ],
      answer: 1,
      explain: 'Compare the key id in the file with the keys you hold. During a rotation, keep both private keys for a while.',
    },
  ],
  description: `
Ostrander Clinics sends payroll files to a bank and receives payment confirmations back over SFTP. The bank requires every file to be PGP encrypted and signed. The Mule app uses the Crypto module's PGP operations. The bank has also announced a key change next month.

**Questions**
1. Which keys are used for encrypting and signing, in each direction?
2. In what order do the steps run, outbound and inbound?
3. Why use PGP on top of SFTP?
4. How do you handle key rotation without failed files?
`,
  answerTemplate: `## Keys

## Order of steps

## PGP on top of SFTP

## Key rotation
`,
  keyPoints: [
    'Encrypt with the receiver public key. Sign with your own private key.',
    'Decrypt with your private key. Verify with the sender public key.',
    'Outbound: build, sign and encrypt, write under a temporary name, rename.',
    'Inbound: read, decrypt and verify, then parse.',
    'SFTP protects transit only. PGP protects the file at rest.',
    'Rotate with a trusted key exchange, an agreed date and an overlap.',
  ],
  solution: `
**1. Keys.** Outbound: encrypt with the bank's public key, so only the bank can read it, and sign with your private key, so the bank knows it came from you. Inbound: decrypt with your private key and verify the signature with the bank's public key. Your private key and its passphrase live in a secrets store, never in Git.

**2. Order of steps.** Outbound: build the file, sign and encrypt it with the Crypto module, write it under a temporary name, rename it, and log the name, size and key ids. Inbound: pick up the file, decrypt and verify, then parse it. Reject a file that fails the signature check and alert. The PGP operations work on streams, so large files do not need to fit in memory.

**3. PGP on top of SFTP.** SFTP encrypts the connection only. On the bank's server, in backups and in later folders the file is plain unless the file itself is encrypted. PGP also adds the signature, which SFTP does not provide.

**4. Key rotation.** Get the new public key through a trusted channel and confirm its fingerprint by phone or in a signed message. Keep keys as configuration per environment. Agree a date with the bank and test the new key in a test environment first. For inbound files, keep your old private key until files encrypted with it have all arrived. After the switch, remove the old keys on both sides.
`,
  followUps: [
    {
      q: 'Encrypt then sign, or sign then encrypt?',
      a: 'The common PGP form signs the data and then encrypts the signed content, so the signature is hidden inside. Follow what the partner expects.',
    },
    {
      q: 'Where would you keep the bank public key?',
      a: 'In configuration per environment, as an armored key or keyring file loaded at deploy time. It is not secret, but its integrity matters.',
    },
    {
      q: 'An inbound file decrypts but the signature check fails. Do you process it?',
      a: 'No. Quarantine it, alert security and the bank, and wait for a resend. A bad signature means a different sender or a changed file.',
    },
  ],
}
