import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-090',
  category: 'logging',
  title: "Deadlocks and Bulk Inserts",
  level: 'ADVANCED',
  tags: ["logging","database","deadlocks"],
  estMinutes: 20,
  quiz: fromLogging(["log-4071","log-4072","log-4073","log-4074","log-4075"]),
  description: `
Ironbridge Freight loads tracking scans with Bulk Insert while other flows update shipment rows, and the database sometimes picks a deadlock victim.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A deadlock that a retry fixes is a WARN.",
    "When the retries are used up, log ERROR with the attempts and the next step.",
    "A Bulk Insert returns one count per row, and -2 means success.",
  ],
}
