// The sample application of the smtp-auth lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'

const BASE = Date.UTC(2026, 10, 2) // the first day of the lab clock
const DAY = 24 * 60 * 60000
const dayBefore = (now) => new Date(BASE + now - DAY).toISOString().slice(0, 10)

const HOST = 'smtp.mail.harbor.lab'
const PASSWORD = 'Sales-App-2611'

const at = { flow: 'sales-summary-flow', file: 'sales-summary', at: 3, name: 'Send summary', dsl: '<email:send doc:name="Send summary" config-ref="Email_SMTP" toAddresses="#[vars.managers]" subject="Daily sales summary">' }
const fail = (error, ms, open) => ({ ok: false, ms, errorType: error.type, log: [...open, muleError({ ...at, ...error })] })

export const PACKAGES = {
  'sales-summary-mail': {
    note: 'Emails the daily sales summary to the store managers at 06:30 through the Email connector (SMTP on port 587 with STARTTLS).',
    boot: needs('smtp.host', 'smtp.port', 'smtp.user', 'smtp.password'),
    schedules: [{ flow: 'sales-summary-flow', type: 'cron', value: '0 30 6 * * ?', tz: 'UTC', enabled: true }],
    run: {
      'sales-summary-flow': ({ props, now }) => {
        const open = [info('Starting sales-summary-flow'), info(`Built the sales summary of ${dayBefore(now)} for 38 stores`)]
        // the lab reads the port only: 587 is the SMTP connection with STARTTLS, so another port on it gets no greeting
        if (props['smtp.host'] !== HOST || props['smtp.port'] !== '587')
          return fail({ type: 'EMAIL:CONNECTIVITY', message: `Error while sending email: Could not connect to SMTP host: ${props['smtp.host']}, port: ${props['smtp.port']}, response: -1` }, 30000, open)
        if (props['smtp.password'] !== PASSWORD)
          return fail({ type: 'EMAIL:SEND', message: `Error while sending email: 535 5.7.8 Authentication failed for ${props['smtp.user']}. This account accepts app passwords only.` }, 1400, open)
        return { ok: true, ms: 4200, log: [...open, info(`Sent the daily sales summary to 38 store managers through ${HOST}:587. Job finished.`)] }
      },
    },
  },
}
