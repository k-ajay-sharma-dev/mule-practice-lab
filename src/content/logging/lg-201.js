import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-201',
  category: 'logging',
  title: "Expiring Queue Messages",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","queues","ttl","expiry"],
  estMinutes: 25,
  quiz: fromLogging(["log-17001","log-17002","log-17003","log-17004","log-17005"]),
  description: `
Harrow Garden Supply lost stock messages to a time to live during a long outage. Log expiries and consumer restarts so the gap is visible.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log expired counts with the TTL and the expiry queue.",
    "Log consumer restarts with the depth found.",
    "Say how the data will be recovered.",
  ],
}
