import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-187',
  category: 'logging',
  title: "Mailbox Polling",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","email","imap","duplicates"],
  estMinutes: 25,
  quiz: fromLogging(["log-15031","log-15032","log-15033","log-15034","log-15035"]),
  description: `
Marrow & Pine Home reads supplier ASNs from a mailbox. Log each email processed or rejected.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the message ID and the business number.",
    "Leave out sender addresses and subjects.",
    "Log the folder each email was moved to.",
  ],
}
