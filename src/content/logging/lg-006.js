import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-006',
  category: 'logging',
  title: "Business Rules That Say No",
  level: 'INTERMEDIATE',
  tags: ["logging","business-rules"],
  estMinutes: 15,
  quiz: fromLogging(["log-111","log-005","log-425","log-429","log-108"]),
  description: `
Some requests work as designed but end in a "no": an order over the credit limit, a customer with no email, a deprecated API version. Log these business outcomes so they can be counted.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A business rule that refuses a request is expected behaviour: INFO or WARN.",
    "Log the business key and the reason, so the case can be explained later.",
    "WARN fits what someone should look at soon, such as a client on a version that is going away.",
  ],
}
