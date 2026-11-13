import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-083',
  category: 'logging',
  title: "Workday Badge Sync",
  level: 'INTERMEDIATE',
  tags: ["logging","workday","hr-data"],
  estMinutes: 15,
  quiz: fromLogging(["log-4036","log-4037","log-4038","log-4039","log-4040"]),
  description: `
Thornbury Health syncs worker changes from Workday to its badge system, so leavers lose access. HR data is sensitive, so log IDs only.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the Workday worker ID, never names, addresses or pay.",
    "End each run with one line of counts.",
    "A skipped worker is a WARN, because access may still be open.",
  ],
}
