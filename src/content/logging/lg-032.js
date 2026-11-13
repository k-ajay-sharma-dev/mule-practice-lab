import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-032',
  category: 'logging',
  title: "Claims API: APIkit Rejects a Bad Request",
  level: 'BEGINNER',
  tags: ["logging","apikit","validation"],
  estMinutes: 10,
  quiz: fromLogging(["log-1006","log-1007","log-1008","log-1009","log-1010"]),
  description: `
The Claims Experience API of an invented insurer checks every POST /claims against its RAML. When a field is wrong or missing, APIkit raises APIKIT:BAD_REQUEST and the API answers 400. Decide how that handler logs it.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A 400 is a caller mistake that the API handled, so WARN.",
    "error.description from APIkit names the field that failed.",
    "Log the path and the correlation ID, never the request body.",
  ],
}
