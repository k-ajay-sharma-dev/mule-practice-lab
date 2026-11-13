import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-011',
  category: 'logging',
  title: "When a Batch Job Stops",
  level: 'ADVANCED',
  tags: ["logging","batch","sftp"],
  estMinutes: 10,
  quiz: fromLogging(["log-114","log-115","log-412","log-324"]),
  description: `
A batch job stops after too many failed records, another one retries failures in a second step, and a scheduler feeds them from SFTP. Log the runs so support knows what happened to every record.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A job stopped by max failed records is ERROR: work was left undone.",
    "A step that only gets failed records logs which records it handled and how.",
    "Tie each batch job instance to the file or rows it came from.",
  ],
}
