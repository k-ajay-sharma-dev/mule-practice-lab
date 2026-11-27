// The sample application of the sec-props-key lab. Imports only platform-log.js and the import free access engine.
import { needs } from '../platform-log.js'
import { secureBootError } from '../platform-access.js'

export const LEDGER = 'payout-ledger-sapi'
// lab keys, 16 characters for AES-128. Never real keys.
export const SBX_KEY = 'BrightSbx2026Key'
export const PRD_KEY = 'BrightPrd2026Key'
export const PLAIN = { 'db.host': 'ledger-db.prd.brightmart.lab', 'db.password': 'lab-ledger-db-4', 'bank.api.secret': 'lab-bank-api-8' }
export const SECRET_KEYS = ['db.password', 'bank.api.secret']
// The file of one environment. `secret` turns a plain value into what goes in the file, for example ![...].
export const ledgerFile = (env, secret = (v) => v) =>
  `# ${env}.yaml: values for mule.env=${env}\ndb:\n  host: "${PLAIN['db.host'].replace('.prd.', env === 'prod' ? '.prd.' : '.sbx.')}"\n  password: "${secret(PLAIN['db.password'])}"\nbank:\n  api:\n    secret: "${secret(PLAIN['bank.api.secret'])}"\n`

export const PACKAGES = {
  [LEDGER]: {
    note: 'Reads ${secure::db.password} and ${secure::bank.api.secret} from <secure-properties:config file="${mule.env}.yaml" key="${mule.key}"> with <secure-properties:encrypt algorithm="AES" mode="CBC"/>. Each environment has its own file and its own key.',
    boot: (ctx) => needs('mule.env', 'mule.key')(ctx) ?? secureBootError(ctx, { algorithm: 'AES', mode: 'CBC' }),
  },
}
