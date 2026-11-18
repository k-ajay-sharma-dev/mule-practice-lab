import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-139',
  category: 'logging',
  title: "Exchange Rates That Go Stale",
  level: 'ADVANCED',
  tags: ["logging","scheduler","data-freshness","alerts"],
  estMinutes: 25,
  quiz: fromLogging(["log-10016","log-10017","log-10018","log-10019","log-10020"]),
  description: `
Harbour Exchange loads exchange rates every hour and may use them for up to four hours. Log loads and the age of the rates so the team acts before payments are affected.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log every load with the count, the provider time and the duration.",
    "Warn while there is still time, with the age and the limit.",
    "Log at ERROR when customers are affected, and say what was paused.",
  ],
}
