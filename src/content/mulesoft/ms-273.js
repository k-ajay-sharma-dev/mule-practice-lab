export default {
  id: 'ms-273',
  category: 'mulesoft',
  title: 'SFTP Key Authentication and Known Hosts: Setting Up a Partner Connection Safely',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'ssh-keys', 'known-hosts', 'authentication', 'security', 'secure-properties'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A partner asks for "your key" to set up the SFTP account. A colleague emails them the id_rsa file from the project. What is wrong, and what should happen now?',
      options: [
        'Nothing, id_rsa is the half the partner installs',
        'The partner also needs the passphrase of id_rsa to load the key',
        'id_rsa is the private key, so make a new pair and send only the .pub file',
        'Ask the partner to delete id_rsa, then send id_rsa.pub',
      ],
      answer: 2,
      explain: 'The partner adds your public key to the account and checks your login with it. Anyone holding your private key could log in as you, so a key that left your hands must be replaced. Sending the passphrase would make the leak worse. Asking the partner to delete the file does not undo the leak, as copies can stay in mail systems.',
    },
    {
      type: 'single',
      prompt: 'A reviewer finds the SFTP key passphrase in plain text in config.yaml, next to the key path, in Git. The developer says it is harmless without the key file. What is the right response?',
      options: [
        'Move it to secure properties, which closes the exposure',
        'Delete the line in a new commit and keep the same passphrase',
        'Make a new key pair, and keep its passphrase in secure properties',
        'Agree, as long as the key file stays out of Git',
      ],
      answer: 2,
      explain: 'The passphrase protects the key at rest, for the case where the key file leaks. Once it is in Git, it stays in the history, so moving it or deleting the line does not undo the exposure. A copy of the key file taken at any time still opens with the old passphrase, so a new key pair is the safe fix. Secure properties then keep the new passphrase encrypted. Keeping the key file out of Git is good, but the passphrase is still a leaked secret.',
    },
    {
      type: 'single',
      prompt: 'To get a first connection working, a developer turns off host key checking on the SFTP config and plans to leave it that way. Which risk does this add?',
      options: [
        'A stolen private key can now be used from any machine to log in',
        'A fake server posing as the partner can take the login and the files',
        'The client may agree to a weak cipher during the SSH handshake',
        'The partner can no longer check the public key of the Mule client',
      ],
      answer: 1,
      explain: 'Known hosts lets the client check the server host key. Without that check, a man in the middle can accept your login and read every file. Host key checking says nothing about where your own key is used, which ciphers are agreed, or how the server checks your key.',
    },
    {
      type: 'multi',
      prompt: 'The partner rotated its host key and the connection now fails host key checks. What should you do?',
      options: [
        'Get the new fingerprint through a trusted channel, such as the partner contact or their documentation',
        'Update the known hosts entry and redeploy',
        'Turn off host key checking for one connect to learn the new key',
        'Check the new fingerprint against what the server presents before trusting it',
        'Run ssh-keyscan against the server and paste its output into known hosts',
        'Make a new client key pair and send the partner the new public key',
      ],
      answer: [0, 1, 3],
      explain: 'A changed host key is also what an attack looks like. Get the new fingerprint from the partner through a channel you trust, check it against what the server presents, then update the known hosts entry and redeploy. Learning the key from one unchecked connect, or from ssh-keyscan, trusts whoever answers at that moment, which is the attack the check exists to stop. The host key proves the server to you. Your client key proves you to the server, so it has nothing to do with this change.',
    },
    {
      type: 'single',
      prompt: 'A partner server accepts both password and key login and wants key login used. The Mule SFTP config holds a password and a key, and the server logs show password logins. What do you change?',
      options: [
        'Ask the partner to list public key first in the methods its server accepts',
        'List public key before password in preferred authentication methods',
        'Add a passphrase to the key, which makes the client prefer key login',
        'Remove the known hosts file, so the client has to fall back to the key',
      ],
      answer: 1,
      explain: 'The client tries the methods in the order listed in preferred authentication methods, for example public key before password. The server decides what it accepts, but not the order the client tries. A passphrase and known hosts have no say in the login method. Removing the unused password from the config also helps, since some servers count a failed method as a failed try.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to set up a new partner connection.',
      items: [
        'Generate a key pair for this partner and environment',
        'Send the public key to the partner',
        'Get the server host key fingerprint through a trusted channel',
        'Add it to the known hosts file used by the app',
        'Store the private key and passphrase securely and test from each environment',
      ],
      explain: 'Each environment, such as test and production, should have its own key pair, so a test leak cannot reach production.',
    },
  ],
  description: `
Brindle Outdoor must connect to the planning platform's SFTP server with key based login. The first draft of the app packs the private key in the project, has no known hosts file, and keeps the passphrase in a plain property.

**Questions**
1. How does key based SFTP login work?
2. What does the known hosts check add?
3. How should Mule store the key and passphrase?
4. What happens when keys change?
`,
  answerTemplate: `## Key based login

## Known hosts

## Storing secrets

## Key changes
`,
  keyPoints: [
    'Send the public key. Keep the private key.',
    'Protect the private key with a passphrase kept in secure properties.',
    'Known hosts checks the server host key and stops a man in the middle.',
    'Confirm a changed host key through a trusted channel.',
    'Use a key pair per partner and environment.',
    'Set the login method order to what you use.',
  ],
  solution: `
**1. Key based login.** You create a key pair. The partner adds the public key to your account on their server. At login the server checks that the client holds the matching private key. No password crosses the network, and the key is much harder to guess.

**2. Known hosts.** The client also checks the server. The server shows its host key, and the client compares it with the trusted entry in the known hosts file. Without this check, a fake server could accept the login and collect every file. In Mule, point the SFTP config at a known hosts file and keep checking on.

**3. Storing secrets.** Keep the private key out of Git. Load it from a secured location at deploy time, and keep the passphrase in secure properties, encrypted, with a value per environment. Use one key pair per partner and environment, so a leak is contained and you can revoke one without touching the others. Set preferred authentication methods to public key first, so the client does not waste tries on a password.

**4. Key changes.** When the partner rotates its host key, the connection fails the check. Get the new fingerprint through a trusted channel, update known hosts and redeploy. When you rotate your own key, send the new public key, wait until the partner confirms both keys work, switch, then ask them to remove the old one.
`,
  followUps: [
    {
      q: 'Why not turn off host key checking in test environments?',
      a: 'Settings copied from test often reach production. Keep checking on everywhere and maintain a known hosts file per environment.',
    },
    {
      q: 'The partner asks for an RSA key of 1024 bits. What do you say?',
      a: 'That is weak today. Offer a stronger key type or length, such as RSA of at least 3072 bits or Ed25519 if their server supports it.',
    },
    {
      q: 'How do you get the key file onto a CloudHub worker without putting it in Git?',
      a: 'Keep it in a secrets store and add it at build or deploy time, or pass it as a secured property value. The repository holds only the reference.',
    },
  ],
}
