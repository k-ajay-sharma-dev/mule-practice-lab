import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-190',
  category: 'logging',
  title: "Alerts With Impact",
  level: 'EXPERT',
  tags: ["logging","myproject","email","alerts","monitoring"],
  estMinutes: 25,
  quiz: fromLogging(["log-15046","log-15047","log-15048","log-15049","log-15050"]),
  description: `
Marrow & Pine Home cut alert noise so real outages are seen. Log impact alerts and grouped repeats.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Lead with the business impact.",
    "Log where the alert was routed.",
    "Group repeats into one line with a count.",
  ],
}
