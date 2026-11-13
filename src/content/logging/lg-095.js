import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-095',
  category: 'logging',
  title: "Try Scopes for Loyalty Points",
  level: 'INTERMEDIATE',
  tags: ["try-scope","on-error-continue","retail"],
  estMinutes: 15,
  quiz: fromLogging(["log-5021","log-5022","log-5023","log-5024","log-5025"]),
  description: `
At Copperleaf Coffee, a Try scope protects each sale from a slow loyalty system. Log the loyalty failures and the result of the sale.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A Try scope lets the flow go on after a handled error.",
    "Catch only the errors you expect inside the Try.",
    "Say in the line what happens next, such as next=queued for retry.",
  ],
}
