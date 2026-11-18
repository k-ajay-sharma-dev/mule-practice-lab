export default {
  id: 'ms-225',
  category: 'mulesoft',
  title: 'Crypto Module for Partner Files: PGP Encrypt, Sign, Decrypt and Checksums',
  level: 'ADVANCED',
  tags: ['myproject', 'crypto', 'pgp', 'security', 'encryption', 'signing', 'checksums', 'sftp', 'banking'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'Mule sends a payments file to a clearing partner and must keep it secret. Which key encrypts it?',
      options: [
        'Our private key',
        'Our public key',
        'The partner\'s public key',
        'The partner\'s private key',
      ],
      answer: 2,
      explain: 'Anyone can encrypt with a public key, but only the holder of the matching private key can decrypt. The partner keeps its private key, so only the partner can read the file.',
    },
    {
      type: 'single',
      prompt: 'The partner also wants proof that the file came from us and was not changed. What do we add?',
      options: [
        'A second encryption with the partner\'s public key',
        'A signature made with our private key',
        'A checksum file next to the payments file',
        'A longer passphrase',
      ],
      answer: 1,
      explain: 'Only we hold our private key, so a signature made with it proves the sender. The partner checks it with our public key.',
    },
    {
      type: 'single',
      prompt: 'The partner sends us an encrypted returns file. What does Mule need to decrypt it?',
      options: [
        'The partner\'s public key only',
        'The partner\'s private key',
        'Our public key only',
        'Our private key and its passphrase',
      ],
      answer: 3,
      explain: 'The partner encrypted it with our public key, so only our private key can open it. The private key is protected by a passphrase.',
    },
    {
      type: 'single',
      prompt: 'A plain file arrives with a SHA-256 checksum file next to it, and the values match. What does that show?',
      options: [
        'The file was not changed between making the checksum and checking it',
        'The file came from the partner',
        'The file was encrypted on the way',
        'Nobody else has read the file',
      ],
      answer: 0,
      explain: 'Anyone can work out a checksum. A match shows the file is whole, not who sent it. For the sender, use a signature or an HMAC with a shared secret.',
    },
    {
      type: 'multi',
      prompt: 'Where is it acceptable to keep the passphrase of our private key?',
      options: [
        'An encrypted secure property, with the encryption key given at deploy time',
        'A plain value in config-prod.yaml in Git',
        'A secret store that the runtime reads, such as a vault service',
        'Typed into the PGP config in the flow XML',
      ],
      answer: [0, 2],
      explain: 'The passphrase is the last guard on the private key. Keep it encrypted or in a secret store, and never in plain text in the code or the repository.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for the outbound payments file.',
      items: [
        'Build the file content in DataWeave',
        'Sign it with our private key and encrypt it with the partner\'s public key',
        'Upload it to the partner over SFTP with a temporary name',
        'Rename it to the final name so the partner picks it up',
      ],
      explain: 'Sign and encrypt before the file leaves Mule. A temporary name during upload stops the partner from reading half a file.',
    },
  ],
  description: `
Harrowgate Building Society sends a payments file to a clearing partner every evening over SFTP, and gets a returns file back each morning. The partner's new rules say every file must be PGP encrypted and signed, and the society must check the partner's signature on returns.

Today the file goes out in plain text. The team has the Mule Crypto module, the partner's public key, and a new key pair of its own.

**Questions**
1. Which keys does each step use: encrypting and signing the outbound file, and decrypting and verifying the inbound one?
2. What does a checksum prove, and what does it not prove?
3. Where do the keys and the passphrase live, and how do you handle key rotation?
4. Where in the flow do the crypto steps go, and what should the error handling do when a check fails?
`,
  answerTemplate: `## Which key for which step

## Checksums

## Keys, passphrase and rotation

## Flow design and failures
`,
  keyPoints: [
    'Encrypt with the receiver\'s public key. Only the receiver\'s private key can decrypt.',
    'Sign with the sender\'s private key. Anyone with the sender\'s public key can verify.',
    'Encryption keeps content secret. A signature proves the sender and that nothing changed.',
    'A checksum shows the file is whole, not who sent it.',
    'Keep private keys and passphrases out of Git, in secure properties or a secret store.',
    'On rotation, keep the old private key until every file encrypted for it has been read.',
    'A failed signature check must stop the file and alert someone, not be logged and ignored.',
  ],
  solution: `
**1. Keys per step.**
| Step | Key |
|---|---|
| Encrypt outbound | Partner's public key |
| Sign outbound | Our private key and passphrase |
| Decrypt inbound | Our private key and passphrase |
| Verify inbound | Partner's public key |

The Crypto module's PGP operations take these keys from a PGP configuration that points at the keyring files and names the keys to use.

**2. Checksums.** A SHA-256 checksum shows the file arrived whole. It does not prove the sender, because anyone who changes the file can make a new checksum. The PGP signature does both jobs for these files. A checksum is still useful for a file that is not signed, or as a quick check that an upload finished.

**3. Keys and rotation.** The private key and its passphrase are secrets. Keep the passphrase as an encrypted secure property or in a secret store, never in Git. Restrict who can read the keyring on the server or in the deployment. When the society rotates its key pair, send the new public key to the partner, and keep the old private key until every file the partner encrypted for it has been read. When the partner rotates, add its new public key and agree a date to drop the old one.

**4. Flow design.** Outbound: build the file, sign and encrypt it, upload it over SFTP with a temporary name, then rename it. Inbound: read the file, decrypt it and verify the signature before any DataWeave reads the content. If decrypting or verifying fails, move the file to a quarantine folder, raise an alert, and do not post any returns. A file that fails the check may have been tampered with, so it must not be processed.
`,
  followUps: [
    {
      q: 'Why not use the SFTP connection alone for security?',
      a: 'SFTP protects the file on the wire only. Once it lands on the partner\'s server it is plain again, and anyone with access to that folder can read or change it. PGP keeps the file protected at rest and proves who made it.',
    },
    {
      q: 'The payments file is 800 MB. What do you watch for?',
      a: 'Keep the content as a stream and avoid steps that load it all into memory, such as logging the payload. Test with a file of real size before go-live and watch heap and disk use during the run.',
    },
    {
      q: 'How do you test the crypto steps without the real keys?',
      a: 'Make a test key pair for the test environments and load it through the same properties. MUnit tests can then encrypt and decrypt sample files, and the real private key never leaves production.',
    },
  ],
}
