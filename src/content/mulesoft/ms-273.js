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
      prompt: 'You set up key based login to a partner SFTP server. Which key do you send to the partner?',
      options: [
        'The private key',
        'The public key',
        'Both keys, so the partner can test the login',
        'The fingerprint of the private key',
      ],
      answer: 1,
      explain: 'The partner adds your public key to the account. Anyone holding your private key could log in as you.',
    },
    {
      type: 'single',
      prompt: 'The private key file has a passphrase. Where does the passphrase go in Mule?',
      options: [
        'In the connection config, as a plain property in the YAML file',
        'In secure properties, encrypted, with a value per environment',
        'Inside the key file, in a comment after the key block',
        'Nowhere, because the SFTP connector cannot use a passphrase',
      ],
      answer: 1,
      explain: 'The passphrase protects the key at rest. Storing it in plain text next to the key removes that protection.',
    },
    {
      type: 'single',
      prompt: 'What does a known hosts file protect against?',
      options: [
        'An unknown client logging in to your own SFTP account',
        'A fake server posing as the partner, by checking its host key',
        'A stolen private key being used from another machine',
        'A weak cipher being chosen during the SSH handshake',
      ],
      answer: 1,
      explain: 'Without a host key check, a man in the middle can accept your login and read every file.',
    },
    {
      type: 'multi',
      prompt: 'The partner rotated its host key and the connection now fails host key checks. What should you do?',
      options: [
        'Get the new fingerprint through a trusted channel, such as the partner contact or their documentation',
        'Update the known hosts entry and redeploy',
        'Turn off host key checking for good',
        'Check the new fingerprint against what the server presents before trusting it',
      ],
      answer: [0, 1, 3],
      explain: 'A changed host key is also what an attack looks like. Confirm it outside the connection before trusting it.',
    },
    {
      type: 'single',
      prompt: 'What does the preferred authentication methods setting control?',
      options: [
        'Which ciphers the client offers in the SSH handshake',
        'The order the client tries login methods, such as key before password',
        'Which login methods the server will accept from this client',
        'Which key types the client accepts as the server host key',
      ],
      answer: 1,
      explain: 'The client tries the methods in the order listed, for example public key before password. The server still decides what it accepts. Some servers lock an account after a few failed tries. Trying a method you do not use can count as a failure.',
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
