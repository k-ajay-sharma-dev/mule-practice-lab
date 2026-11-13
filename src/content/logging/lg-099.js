import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-099',
  category: 'logging',
  title: "Card Data in a Payment Flow",
  level: 'BEGINNER',
  tags: ["pci","card-data","masking"],
  estMinutes: 10,
  quiz: fromLogging(["log-5041","log-5042","log-5043","log-5044","log-5045"]),
  description: `
The Caldera Pay checkout app charges cards through a gateway. Log charges and declines so support can help, without breaking PCI rules.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log a payment ID and the last 4 digits, never the card number or CVV.",
    "A decline is a normal bank answer, not an ERROR.",
    "Mask first, then log, even at DEBUG.",
  ],
}
