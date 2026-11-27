// The guided lab sec-props-key. See platform-labs.js for the shape of a lab.
import { appNamed, at, finishDeploys, mark, newApp, newPlatform, startApp } from '../platform.js'
import { ask, change, OPS, sawLogs } from '../platform-kit.js'
import { fileEntries, saveSecureFile, secureFile, secureString } from '../platform-access.js'
import { ledgerFile, LEDGER, PLAIN, PRD_KEY, SBX_KEY, SECRET_KEYS } from './sec-props-key.pkg.js'

const AES = { algorithm: 'AES', mode: 'CBC' }
const prod = (s) => appNamed(s, LEDGER, 'Production')
const encrypt = (text, key) => secureFile('encrypt', { ...AES, key, text }).value
// the way Sam made the files: each secret encrypted on its own in string mode, then wrapped in ![...] by hand
const sealed = (env, key) => ledgerFile(env, (value) => `![${secureString('encrypt', { ...AES, key, value }).value}]`)
// every value of prod.yaml reads back right with the Production key, and the secrets are encrypted
const prodFileOk = (s) => {
  const text = prod(s)?.secureFiles?.['prod.yaml']
  if (!text) return false
  const entries = Object.fromEntries(fileEntries(text).map((x) => [x.key, x]))
  return Object.entries(PLAIN).every(([k, v]) => {
    const x = entries[k]
    if (!x) return false
    if (!x.encrypted) return !SECRET_KEYS.includes(k) && x.value === v
    const r = secureString('decrypt', { ...AES, key: PRD_KEY, value: x.raw })
    return r.ok && r.value === v
  })
}
const keyProtected = (s) => prod(s)?.secrets?.['mule.key'] === PRD_KEY && !('mule.key' in (prod(s)?.props ?? {}))

const lab = {
  id: 'p-sec-props-key',
  group: 'Security',
  title: 'Production cannot decrypt its own properties',
  minutes: 20,
  scenario: `${LEDGER} keeps its database password and the bank API secret in prod.yaml, encrypted with the secure properties tool. Sam prepared the Production file last night. At 08:40 the first deploy to Production failed at startup, while Sandbox runs fine. Find out why, fix the file and the key, and get the app running in Production.`,
  start() {
    const clock = at(1, 8, 30)
    const sandbox = newApp(LEDGER, {
      props: { 'mule.env': 'sandbox' },
      secrets: { 'mule.key': SBX_KEY },
      secureFiles: { 'sandbox.yaml': sealed('sandbox', SBX_KEY) },
    })
    // Sam encrypted the Production values with the Sandbox key
    const production = newApp(LEDGER, {
      env: 'Production',
      status: 'Stopped',
      props: { 'mule.env': 'prod', 'mule.key': PRD_KEY },
      secureFiles: { 'prod.yaml': sealed('prod', SBX_KEY) },
    })
    let s = newPlatform({ clock, env: 'Production', apps: [sandbox, production] })
    s = { ...s, clock: at(1, 8, 40) }
    s = finishDeploys(startApp(s, LEDGER))
    s.mail.push({
      t: at(1, 8, 45),
      to: OPS,
      subject: `${LEDGER} fails in Production`,
      body: `Hi, I made prod.yaml last night with the secure properties tool: AES, CBC, and the key I had at hand, ${SBX_KEY}, the one from my Sandbox setup. Sandbox works. The Production deploy fails at startup and I do not see why. The Production key is in the mule.key property in Runtime Manager. Sam`,
      source: 'Sam Ito, Payments team',
    })
    return { ...s, clock: at(1, 9) }
  },
  steps: [
    { title: 'Read the mail from Sam', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    { ...sawLogs(LEDGER), how: `Runtime Manager in Production, Applications, ${LEDGER}, Logs. Read the deployment error.` },
    ask(
      'What the error means',
      'The log says Failed to decrypt the value of secure::db.password, caused by javax.crypto.BadPaddingException. What happened?',
      [
        'The database is down, so the runtime cannot check the password',
        'The values in prod.yaml were encrypted with a different key than the mule.key the Production app runs with. AES in CBC mode checks the padding of the last block, and with a wrong key that check fails',
        'AES CBC is not supported by the Mule 4.9 runtime',
        'prod.yaml is missing from the jar',
      ],
      1,
      'BadPaddingException on decrypt almost always means the wrong key, or the wrong algorithm or mode. The file is there and the runtime read it. With CFB or OFB there is no padding, so a wrong key gives garbage and the failure shows up later, as a login error at the database.',
    ),
    { title: 'Open the secure properties tool', how: 'Open Secure properties tool from the menu under Lab tools.', done: (s) => Boolean(s.seen['secure-props']) },
    {
      title: 'Encrypt prod.yaml again with the Production key',
      how: `In the tool choose File, then under Project file pick ${LEDGER} (Production), prod.yaml and press Load. Decrypt it with AES, CBC and the Sandbox key from the mail, press Run, then Save output to prod.yaml. Now Encrypt the plain file with AES, CBC and the Production key, which you find in the mule.key property in Runtime Manager, press Run and Save output to prod.yaml.`,
      done: prodFileOk,
    },
    {
      title: 'Make mule.key a protected property',
      how: `Runtime Manager, ${LEDGER} in Production, Settings, Properties. Press Protect on mule.key, type the Production key as its value and Apply Changes. A protected value is hidden in the console after the deploy.`,
      done: keyProtected,
    },
    {
      title: 'Get the app running in Production',
      how: `After both fixes, Apply Changes deploys ${LEDGER} again. Its status turns Running and the log says Started app.`,
      done: (s) => prod(s)?.status === 'Running' && keyProtected(s) && prodFileOk(s),
    },
    ask(
      'Why each environment has its own key',
      'Sam asks why Sandbox and Production do not share one key. It would have avoided this incident. What is the reason?',
      [
        'Mule allows only one app per key',
        'Many people and laptops hold the Sandbox key, and Sandbox has lower controls. With its own Production key and its own Production secrets, a leak of the Sandbox key exposes nothing in Production. Only the few people and the pipeline that deploy to Production need its key',
        'The Production runtime is a different Java version',
        'There is no reason; one key for all environments is the recommended setup',
      ],
      1,
      'Separate keys keep the blast radius small, and the keys can be rotated on their own. Encrypt each file with the key of its environment; a check in the pipeline that decrypts each file with the key of its target catches the mistake before a deploy.',
    ),
    ask(
      'Where mule.key must never be',
      'Where must the mule.key value never be stored?',
      [
        'In a protected property of the app in Runtime Manager',
        'In the Git repository of the app: not in pom.xml, mule-artifact.json, a properties file under src/main/resources or a committed script. Anyone with read access to the repository, and its whole history, would then have the key and every encrypted value next to it',
        'In a vault that the pipeline reads at deploy time',
        'In the memory of the running app',
      ],
      1,
      'The encrypted file belongs in the repository; the key does not. Pass it at deploy time as a protected property, from the secret store of the pipeline or a vault. Its value was also visible as a plain property here, which is why you protected it.',
    ),
  ],
  why: 'The Mule secure configuration properties module reads ${secure::name} values from a file such as ${mule.env}.yaml and decrypts each ![...] value with the key, algorithm and mode of <secure-properties:config>. The values are encrypted with secure-properties-tool.jar, for example: java -cp secure-properties-tool.jar com.mulesoft.tools.SecurePropertiesTool file encrypt AES CBC <key> prod.yaml prod.yaml. The key of each environment is set at deploy as the protected property mule.key and never kept in the repository. A file encrypted with another key fails at startup with BadPaddingException in CBC and ECB. In the lab the tool is a lab-made keyed transform, not a real cipher, and it writes into the project of the app so the next deploy uses the file.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/secure-configuration-properties',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `logs:${LEDGER}`), 'secure-props')
    const plain = secureFile('decrypt', { ...AES, key: SBX_KEY, text: prod(s).secureFiles['prod.yaml'] }).value
    s = saveSecureFile(s, LEDGER, 'Production', 'prod.yaml', plain)
    s = saveSecureFile(s, LEDGER, 'Production', 'prod.yaml', encrypt(plain, PRD_KEY))
    const props = Object.fromEntries(Object.entries(prod(s).props).filter(([k]) => k !== 'mule.key'))
    return change(s, LEDGER, { props, secrets: { ...prod(s).secrets, 'mule.key': PRD_KEY } })
  },
  answers: { 2: 1, 7: 1, 8: 1 },
}

export const LABS = [lab]
