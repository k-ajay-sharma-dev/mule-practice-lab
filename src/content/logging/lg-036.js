import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-036',
  category: 'logging',
  title: "Product Catalogue: Paging Through a System API",
  level: 'INTERMEDIATE',
  tags: ["logging","pagination","experience-api"],
  estMinutes: 15,
  quiz: fromLogging(["log-1026","log-1027","log-1028","log-1029","log-1030"]),
  description: `
The Catalogue Experience API of an invented garden shop reads products from the Product System API page by page. Decide what to log for the request, for each page and for the whole loop.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A line inside a loop belongs at DEBUG.",
    "After the loop, one INFO line gives the pages, the count and the time.",
    "Log the query values that shape the answer, not all of attributes.",
  ],
}
