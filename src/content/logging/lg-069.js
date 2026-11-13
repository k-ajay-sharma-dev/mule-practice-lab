import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-069',
  category: 'logging',
  title: "Cron Runs That Overlap",
  level: 'INTERMEDIATE',
  tags: ["logging","scheduler","cron"],
  estMinutes: 15,
  quiz: fromLogging(["log-3041","log-3042","log-3043","log-3044","log-3045"]),
  description: `
Maple Transit loads fare files at 02:00 with a cron Scheduler and a lock in Object Store, so two runs never overlap. Log the start, the skips and the late runs.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the job name and the business date when a run starts.",
    "A run skipped because the lock is held is WARN, with how long it has been held.",
    "A run that ends after its deadline is WARN, with the duration and the deadline.",
  ],
}
