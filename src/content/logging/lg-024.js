import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-024',
  category: 'logging',
  title: "Start-up and Configuration",
  level: 'BEGINNER',
  tags: ["logging","configuration","log4j2"],
  estMinutes: 10,
  quiz: fromLogging(["log-012","log-104","log-213","log-423","log-319"]),
  description: `
An app starts in production. Log what it loaded and what it checked, and make sure the production logging setup is right.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "One INFO line at start-up says the environment and the version.",
    "A missing property that stops the deploy is ERROR with the property name.",
    "Production runs at INFO. DEBUG is switched on only for a short, named need.",
  ],
}
