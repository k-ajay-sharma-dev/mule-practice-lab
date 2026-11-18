import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-148',
  category: 'logging',
  title: "A Lock for a Scheduled Job",
  level: 'ADVANCED',
  tags: ["logging","scheduler","locking","replicas"],
  estMinutes: 25,
  quiz: fromLogging(["log-11036","log-11037","log-11038","log-11039","log-11040"]),
  description: `
Ridgeway Utilities runs its billing job on two replicas with a lock, so only one does the work. Log the lock so a double run can be explained.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log each lock taken with the job, key, holder and time to live.",
    "Log a skipped run at DEBUG, as it happens on every other replica.",
    "Warn when a stale lock is taken over, with the old and new holder.",
  ],
}
