import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-147',
  category: 'logging',
  title: "API Quota Use",
  level: 'INTERMEDIATE',
  tags: ["logging","api-management","quotas","clients"],
  estMinutes: 20,
  quiz: fromLogging(["log-11031","log-11032","log-11033","log-11034","log-11035"]),
  description: `
Tidewater Data sells API plans with a monthly quota. Log when clients cross 80% and 100% so sales and support can act before clients are blocked.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log once when each threshold is first crossed.",
    "Add the client, plan, used, quota and when the period ends.",
    "Never log the headers. They carry the client secret.",
  ],
}
