import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-073',
  category: 'logging',
  title: "EDI Orders over SFTP",
  level: 'ADVANCED',
  tags: ["logging","edi","sftp"],
  estMinutes: 15,
  quiz: fromLogging(["log-3061","log-3062","log-3063","log-3064","log-3065"]),
  description: `
Marchmont Auto Parts gets X12 850 purchase orders from dealers over SFTP. Files arrive, fail validation or cannot be parsed. Log each one so a dealer question can be answered.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the interchange control number, the dealer and the order count.",
    "Never log raw EDI segments. They can hold authorization values and partner data.",
    "A file that cannot be parsed is ERROR, with where it was moved.",
  ],
}
