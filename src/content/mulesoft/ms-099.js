export default {
  id: 'ms-099',
  category: 'mulesoft',
  title: 'Secure Configuration Properties in Depth: Algorithms, Modes, Random IVs and the secure:: Prefix',
  level: 'INTERMEDIATE',
  tags: ['security', 'secure-properties', 'encryption', 'configuration', 'secrets'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A config has `<secure-properties:encrypt/>` with no attributes. Which algorithm and mode does the module use?',
      options: ['AES and CBC', 'Blowfish and CBC', 'AES and ECB', 'DES and CFB'],
      answer: 0,
      explain: 'The docs list AES and CBC as the defaults. Note the common trap: the examples for the Secure Properties Tool use Blowfish, so values encrypted that way will not decrypt with the default configuration.',
    },
    {
      type: 'single',
      prompt: 'Is the `<secure-properties:encrypt>` tag needed if you want the default algorithm and mode?',
      options: [
        'Yes, the tag is required even with the default values',
        'No, leave it out and the defaults apply',
        'Only for YAML files',
        'Only when `fileLevelEncryption` is true',
      ],
      answer: 0,
      explain: 'The docs state this directly. Its attributes are optional, but the tag itself is required.',
    },
    {
      type: 'single',
      prompt: 'Values were encrypted with `--use-random-iv`. The config says `<secure-properties:encrypt algorithm="AES" mode="CBC"/>`. What must change?',
      options: [
        'Add `useRandomIVs="true"`, because key, algorithm, mode and useRandomIVs must all match the values used to encrypt',
        'Nothing: Mule detects the IV automatically',
        'Change the mode to ECB',
        'Encrypt the file again with `file-level`',
      ],
      answer: 0,
      explain: 'With random IVs on, decryption assumes the IV is prepended to the ciphertext. All four settings must match the encryption run.',
    },
    {
      type: 'match',
      prompt: 'Match the Secure Properties Tool `<method>` to what it does.',
      pairs: [
        ['string', 'Encrypts one text value passed on the command line'],
        ['file', 'Encrypts the value of each property in the file, leaving the keys readable'],
        ['file-level', 'Encrypts all the content of the file'],
      ],
      explain: 'With `file-level` the module also needs `fileLevelEncryption="true"`, available since version 1.1.0.',
    },
    {
      type: 'multi',
      prompt: 'Which statements are correct?',
      options: [
        'Use `secure::` to read every value in a secure properties file, even a value that is not encrypted',
        'A trailing space after the closing `]` of `![value]` makes decryption fail',
        'In YAML, encrypted values should be in quotes so they are read as strings',
        'A secure property can depend on another secure property, but not on another Mule configuration property',
        'Once a value is encrypted in the file, it cannot be seen on the running server',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Decrypted values are stored in memory, and the docs warn that anyone who runs `ps` or views a Java console can see them. Encryption at rest does not replace securing the operating system.',
    },
    {
      type: 'single',
      prompt: 'The same property is defined in two secure properties files, each with its own `<secure-properties:config>`. Which value is used?',
      options: [
        'The value where it is first defined',
        'The value in the last file loaded',
        'Mule fails at startup with a duplicate property error',
        'The value from the file with the stronger algorithm',
      ],
      answer: 0,
      explain: 'The FAQ on the page says the first definition wins. Each file can have its own key, algorithm and mode.',
    },
    {
      type: 'single',
      prompt: 'Where should the decryption key live?',
      options: [
        'Outside the application: the config uses `key="${runtime.property}"` and the value is supplied when the app is deployed',
        'In the `.properties` file next to the encrypted values',
        'In the `pom.xml`, so that the Maven build can read it',
        'As a literal in the `key` attribute, since the XML is compiled',
      ],
      answer: 0,
      explain: 'A key stored with the ciphertext protects nothing. The documented pattern passes it into the runtime at deployment time.',
    },
  ],
  description: `
A payments team stores a database password, an SFTP passphrase and a partner client secret for each environment. Their current file \`prod-secure.yaml\` was encrypted by a contractor with the Secure Properties Tool, and nobody wrote down the settings. Deployment now fails, or values come back unusable, in three different ways:

- A value encrypted using the example from the docs (\`Blowfish\` \`CBC\`) does not decrypt with \`<secure-properties:encrypt/>\`.
- A second file was encrypted with \`--use-random-iv\`, and the configuration does not mention that.
- A plain value such as \`db.host\` lives in the same file, and a developer reads it with \`\${db.host}\`.

The architect also asks whether a whole file can be encrypted so that property names are hidden too, and how the key should reach the runtime.

**Questions**
1. Which settings must match, and what are the defaults?
2. How do \`file\` and \`file-level\` encryption differ?
3. How do you read values, and why is \`secure::\` used for plain values too?
4. How should the key be handled, and what does encryption not protect against?
`,
  answerTemplate: `## Settings that must match

## Encrypting values or files

## Reading values

## Handling the key

## What encryption does not protect
`,
  keyPoints: [
    'Defaults: AES and CBC. The module also lists Blowfish, DES, DESede, RC2 and more; modes are CBC, CFB, ECB and OFB. Further algorithms need an added JCE provider.',
    'key, algorithm, mode and useRandomIVs must match the values used to encrypt. With random IVs, the IV is expected at the front of the ciphertext.',
    '<secure-properties:encrypt> is required even with defaults.',
    'Encrypted values are written ![value] with nothing after the closing bracket. Quote them in YAML.',
    'Read everything through secure::, even plain values, so files can be swapped between environments.',
    'Supported files: .properties and .yaml. file encrypts values; file-level encrypts the whole content and needs fileLevelEncryption="true".',
    'Pass the key at deployment, for example key="${runtime.property}". Never store it beside the file.',
    'Decrypted values sit in memory, so protect the operating system too.',
  ],
  solution: `
**1. Settings that must match.** The \`key\`, \`algorithm\`, \`mode\` and \`useRandomIVs\` values must equal the ones used to encrypt. The defaults are AES and CBC. So the Blowfish value needs \`algorithm="Blowfish"\`, or it should be encrypted again with AES. The second file needs \`useRandomIVs="true"\`, because decryption then expects the IV at the start of the ciphertext.

\`\`\`xml
<secure-properties:config name="prodSecure" file="\${env}-secure.yaml" key="\${runtime.property}">
  <secure-properties:encrypt algorithm="AES" mode="CBC" useRandomIVs="true"/>
</secure-properties:config>
\`\`\`
Each file has its own \`<secure-properties:config>\`, so two files can use different settings while the team migrates.

**2. Values or whole file.**
- \`file\` encrypts each value and leaves the structure and property names readable: \`value: "![qCReIPK3jcqD7WR84ISSIQ==]"\`. You can still mix encrypted and plain values.
- \`file-level\` encrypts the entire content, so names are hidden too. Set \`fileLevelEncryption="true"\` on the config. This needs module version 1.1.0 or later.

**3. Reading values.** Use \`\${secure::db.password}\`. Plain values in the same file also need the prefix: \`\${secure::db.host}\`. That lets you swap a plain development file for an encrypted production file with \`file="\${env}-properties.yaml"\` and change nothing else. Give \`env\` a \`global-property\` default, because Studio needs it for metadata.

**4. Key handling.**
- Supply the key when the app is deployed, as in \`key="\${runtime.property}"\`.
- Keep it in the deployment platform's protected settings, not in the repository, the \`pom.xml\` or the same file.
- The tool does not accept \`#\` in input text, and a \`$\` in the key must be written as \`\\$\` on the command line.
- If you use more than one file with the same property name, the first definition wins, so keep names unique.

**5. Limits.** Encryption protects the file at rest. At runtime the decrypted value is in memory, and the docs warn that \`ps\` output or a Java console can show it. Restrict access to the host and do not log the values.
`,
  followUps: [
    {
      q: 'Can you check secure properties without deploying?',
      a: 'In Studio, a connector whose configuration uses secure:: placeholders can be checked with Test Connection, which shows that the values were read correctly.',
    },
    {
      q: 'Why give ${env} a default value?',
      a: 'The docs say a default is required for metadata resolution in Anypoint Studio. Without one, Studio reports an error when it builds the application model for processors that depend on the property.',
    },
    {
      q: 'Is ECB a sensible choice just because it is listed?',
      a: 'No. ECB is listed as supported, but it encrypts identical blocks to identical output and takes no IV, which is why CBC is the usual choice. Being supported does not make a mode a good choice.',
    },
  ],
}
