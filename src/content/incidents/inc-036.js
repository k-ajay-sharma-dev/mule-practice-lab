export default {
  id: 'inc-036',
  category: 'incidents',
  title: 'App Fails to Start After the Secure Properties Key Was Rotated',
  level: 'INTERMEDIATE',
  tags: ['secure-properties', 'secrets', 'deployment', 'security', 'configuration'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '[cicd] 2025-03-10 17:42 PROD secret mule.key rotated (shared by billing-sapi, invoice-sapi, ledger-sapi; set as a hidden property on each app\'s next deployment)', relevant: true, why: 'The PROD key was rotated; every app sharing it receives the new key the next time it is deployed.' },
      { text: '[git] prod-secure.yaml: re-encrypted db.password with new key (1 file changed, 1 line)', relevant: true, why: 'Only one value was re-encrypted; the others in the same file are still old-key ciphertext.' },
      { text: '14:20:09.004 INFO  [billing-sapi] Loading configuration properties from prod-secure.yaml', relevant: false },
      { text: '14:20:11.311 ERROR [billing-sapi] InitialisationException: Error while decrypting property \'secure::sftp.password\' ... (BadPaddingException / decryption failed)', relevant: true, why: 'The SFTP password is still encrypted with the old key, so decryption with the new key fails.' },
      { text: '14:20:11.315 ERROR [billing-sapi] Application failed to start', relevant: false },
      { text: '14:20:30.000 INFO  [qa][billing-sapi] Application started (same version, QA key unchanged)', relevant: true, why: 'QA works because its key and file were not changed, which points at the PROD key/ciphertext mismatch, not the code.' },
      { text: '14:21:00.000 INFO  [invoice-sapi] GET /health 200 (uptime 3d 2h)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The new mule.key cannot decrypt values in the file that are still encrypted with the old key',
          'The new DB password is wrong',
          'AES/CBC is no longer supported by the runtime',
          'The SFTP server rejected the password',
        ],
        answer: 0,
        explain: 'One secure properties config uses a single key. Mixed old/new ciphertext means some values fail decryption (bad padding) at startup.',
      },
      {
        type: 'single',
        prompt: 'invoice-sapi and ledger-sapi are running fine. What does that mean?',
        options: [
          'They are unaffected because they were deployed before the change',
          'They are time bombs: they will fail on their next deployment unless their files are re-encrypted too',
          'Their key was not rotated',
          'They use a different algorithm',
        ],
        answer: 1,
        explain: 'They are still running with the old key from their last deployment. Their next deployment will pass the new key and fail the same way.',
      },
      {
        type: 'single',
        prompt: 'How do you restore billing-sapi?',
        options: [
          'Re-encrypt every secure value in prod-secure.yaml with the new key and redeploy (or temporarily revert to the old key with a fully old-key file)',
          'Remove the secure:: prefix and put the passwords in plain text',
          'Re-encrypt only sftp.password',
          'Restart the app until it decrypts',
        ],
        answer: 0,
        explain: 'All values must be encrypted with the key the app receives. Re-encrypting only the failing one leaves the client secret broken too.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Rotation procedure: decrypt with old key, re-encrypt all values, release the file and new key together per app',
          'Separate keys per environment (ideally per app) to limit blast radius',
          'CI step that checks every secure value decrypts with the target key; or move to a secrets manager',
          'Store mule.key in the YAML next to the values so it never gets out of sync',
        ],
        answer: [0, 1, 2],
        explain: 'Coordinated rotation, smaller blast radius and automated validation. Keeping the key next to the ciphertext defeats the encryption.',
      },
    ],
  },
  description: `
## Symptoms
- \`billing-sapi\` is redeployed to PROD to pick up a new DB password. The deployment **fails at startup**.
- Two other PROD apps that share the same encryption key are running fine, but they have not been redeployed since the change below.
- In QA, the same version deploys successfully.

## Change / Context
- Security policy requires rotating the **secure properties encryption key** yearly.
- Yesterday the PROD key was rotated. The new key was stored as the shared PROD \`mule.key\` secret in the CI/CD pipeline.
- The pipeline sets that secret as a hidden property in Runtime Manager whenever an app is deployed.
- The developers re-encrypted **only the new DB password** with the new key in \`prod-secure.yaml\`. The other encrypted values (API client secret, SFTP password) in the same file are still encrypted with the **old** key.
- The secure config uses \`algorithm="AES" mode="CBC"\`.

## Logs
\`\`\`
14:20:11.311 ERROR [billing-sapi] Failed to deploy artifact [billing-sapi]
  org.mule.runtime.api.lifecycle.InitialisationException:
  Error while decrypting property 'secure::sftp.password' ... (BadPaddingException / decryption failed)
14:20:11.315 ERROR [billing-sapi] Application failed to start
\`\`\`

## Your tasks
1. What is the root cause?
2. How do you restore service?
3. How should key rotation be done?
4. What prevents this in future?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'All values in a secure properties file must be encrypted with the same key that the app receives at runtime; mixed old/new ciphertext fails decryption.',
    'Decryption errors (bad padding) usually mean wrong key, wrong algorithm/mode, or a corrupted value.',
    'Immediate: redeploy with the old key and old DB password only if still valid, or re-encrypt all values with the new key and redeploy.',
    'Rotation must re-encrypt every secret in every affected app, with the key change and the file change released together.',
    'Other apps sharing the key will fail on their next deployment — identify and fix them proactively.',
    'Prevention: automate re-encryption in CI, one key per app/environment, or move secrets to a secrets manager.',
  ],
  solution: `
## Diagnosis
At startup the app resolves its \`secure::\` values, and the Secure Configuration Properties module decrypts them with the key supplied in \`mule.key\`. That key is now the **new** key, but \`sftp.password\` and the client secret in the file were encrypted with the **old** key, so decryption fails (bad padding) and the app cannot initialise. QA works because its key and file were not changed. The other two PROD apps are a **time bomb**: they will fail the next time they are deployed.

## Immediate mitigation
Re-encrypt **all** secure values in \`prod-secure.yaml\` with the new key (using the secure properties tool), build and redeploy. If that takes too long, roll back the \`mule.key\` value for this app to the old key and use a file fully encrypted with the old key, then plan the rotation properly. Fix the other apps sharing the key before they are redeployed.

## Root cause
Key rotation was treated as a property change rather than a coordinated change: the key was changed in Runtime Manager while ciphertexts in the code were only partially re-encrypted.

## Permanent fix
- Rotation procedure: decrypt with old key → re-encrypt every value with the new key → release the file and the new key **together** per app.
- Separate keys per environment (and ideally per app) to limit blast radius.

## Prevention
- CI step that validates every secure value decrypts with the target key before deployment.
- Inventory of apps per key; or use an external secrets manager so rotation does not require rebuilding apps.
`,
  followUps: [
    { q: 'Why is mule.key set as a hidden property and not in the YAML?', a: 'Putting the key next to the encrypted values would make encryption pointless; hidden/safely-hidden properties in Runtime Manager keep it out of source control and the UI.' },
    { q: 'Can you have different keys for different properties in one file?', a: 'Not with one secure-properties config: it uses a single key/algorithm per config, so all values in that file must use it.' },
  ],
}
