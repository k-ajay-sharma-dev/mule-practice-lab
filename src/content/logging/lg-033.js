import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-033',
  category: 'logging',
  title: "Inventory API: Wrong Paths and Wrong Methods",
  level: 'BEGINNER',
  tags: ["logging","apikit","routing"],
  estMinutes: 10,
  quiz: fromLogging(["log-1011","log-1012","log-1013","log-1014","log-1015"]),
  description: `
Partners call the Inventory System API of an invented outdoor retailer. Some use a path the RAML does not have, others a method it does not allow. Log the APIKIT:NOT_FOUND and APIKIT:METHOD_NOT_ALLOWED errors well.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "APIKIT:NOT_FOUND is about the path, APIKIT:METHOD_NOT_ALLOWED about the method.",
    "Both are logged in the error handler of the main flow, at WARN.",
    "Log the method and the path, not the headers.",
  ],
}
