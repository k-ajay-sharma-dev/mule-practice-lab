import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-043',
  category: 'logging',
  title: "Payments API: Validation Beyond the RAML",
  level: 'ADVANCED',
  tags: ["logging","validation","payments"],
  estMinutes: 20,
  quiz: fromLogging(["log-1061","log-1062","log-1063","log-1064","log-1065"]),
  description: `
The Payments Process API of an invented credit union checks business rules after APIkit has checked the shape of POST /payments. Log the rules it applies and the bugs that stop a payment.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A business rule the API applies is a WARN, with the value and the limit.",
    "A MULE:EXPRESSION error that stops a payment is an ERROR.",
    "Never log a CVV, a card number or a full IBAN.",
  ],
}
