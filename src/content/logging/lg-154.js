import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-154',
  category: 'logging',
  title: "The Restart App",
  level: 'ADVANCED',
  tags: ["logging","myproject","queues","reprocessing","health-check"],
  estMinutes: 25,
  quiz: fromLogging(["log-12016","log-12017","log-12018","log-12019","log-12020"]),
  description: `
Fenwick Supply’s restart app reads the failure queue and publishes the messages again once the database and storage are healthy. Log each run so you can prove the backlog cleared.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log a skipped run with the check that failed.",
    "Log one summary per run with republished, skipped and left.",
    "Alert when messages are still left after a run.",
  ],
}
