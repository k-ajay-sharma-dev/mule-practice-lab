import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-088',
  category: 'logging',
  title: "Platform Events and CDC",
  level: 'ADVANCED',
  tags: ["logging","salesforce","events"],
  estMinutes: 20,
  quiz: fromLogging(["log-4061","log-4062","log-4063","log-4064","log-4065"]),
  description: `
Quillstone Telecom listens to Change Data Capture events for accounts and publishes Platform Events when orders ship. Log the events so a missed one can be found.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the replay ID, because it is how you replay a missed event.",
    "Log the change type and record IDs, not the changed fields.",
    "A gap event needs a line that says the records are read again.",
  ],
}
