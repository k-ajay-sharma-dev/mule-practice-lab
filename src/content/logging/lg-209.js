import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-209',
  category: 'logging',
  title: "Replaying Rejects",
  level: 'ADVANCED',
  tags: ["logging","myproject","batch","reject-table","reprocessing"],
  estMinutes: 25,
  quiz: fromLogging(["log-17041","log-17042","log-17043","log-17044","log-17045"]),
  description: `
Quayle Freight replays rejected rows after fixes. Log replays and refused replays so rejects never double.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log replayed, resolved and still open.",
    "Record who asked for the replay.",
    "Refuse and log a replay when the cause is not fixed.",
  ],
}
