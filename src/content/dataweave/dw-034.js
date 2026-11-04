export default {
  id: 'dw-034',
  category: 'dataweave',
  title: 'Second-Highest Distinct Salary per Department',
  level: 'INTERMEDIATE',
  tags: ['interview-classic', 'groupBy', 'distinctBy', 'orderBy', 'coercion'],
  estMinutes: 20,
  description: `
"Find the second-highest salary" is a classic SQL interview question that also shows up in DataWeave rounds. The HR system exports employees, but its \`salary\` field is loosely typed: some records send a number, others a numeric **string**.

Return one entry per department: \`{ department, secondHighest, earners }\`.

**Rules**
- Compare salaries **numerically** (\`"9500"\` is less than \`12000\`). \`secondHighest\` is output as a number.
- \`secondHighest\` is the second-largest **distinct** salary in the department. Equal salaries count once (\`"100"\` and \`100\` are the same salary).
- If a department has fewer than two distinct salaries, \`secondHighest\` is \`null\` and \`earners\` is \`[]\`.
- \`earners\` — names of everyone in that department paid exactly \`secondHighest\`, sorted A→Z.
- Sort the result by \`department\` ascending.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "name": "Ben", "dept": "Engineering", "salary": "105000" },
  { "name": "Asha", "dept": "Finance", "salary": 72000 },
  { "name": "Hana", "dept": "Support", "salary": "9500" },
  { "name": "Farah", "dept": "Engineering", "salary": "98000" },
  { "name": "Chen", "dept": "Engineering", "salary": 98000 },
  { "name": "Ivan", "dept": "Support", "salary": 12000 },
  { "name": "Dara", "dept": "Finance", "salary": "72000" },
  { "name": "Eli", "dept": "Engineering", "salary": 105000 },
  { "name": "Jo", "dept": "Support", "salary": "11000" },
  { "name": "Gus", "dept": "Engineering", "salary": 87000 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "department": "Engineering", "secondHighest": 98000, "earners": ["Chen", "Farah"] },
  { "department": "Finance", "secondHighest": null, "earners": [] },
  { "department": "Support", "secondHighest": 11000, "earners": ["Jo"] }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Normalise first: `payload map (e) -> { name: e.name, dept: e.dept, salary: e.salary as Number }`. Everything after that is purely numeric.',
    'Per department: `(staff map $.salary) distinctBy $ orderBy -$` gives distinct salaries highest first, so the answer is index `[1]` — which is `null` when it does not exist.',
    'Wrap `groupBy ... pluck (...) -> ...` in parentheses before you `orderBy` the result, otherwise `orderBy` lands inside the lambda.',
  ],
  solution: `%dw 2.0
output application/json

var emps = payload map (e) -> { name: e.name, dept: e.dept, salary: e.salary as Number }
---
((emps groupBy $.dept) pluck ((staff, dept) -> do {
  var distinctDesc = ((staff map $.salary) distinctBy $) orderBy -$
  var second = distinctDesc[1]
  ---
  {
    department: dept as String,
    secondHighest: second,
    earners: if (second == null) []
             else ((staff filter ($.salary == second)) map $.name) orderBy $
  }
})) orderBy $.department`,
  explanation: `
**Distinct, then sort, then index.** "Second-highest" means second-highest *value*, not second row: with salaries 105000, 105000, 98000 the answer is 98000. \`distinctBy $\` removes ties, \`orderBy -$\` sorts descending, and \`[1]\` picks the second. Indexing past the end returns \`null\`, which handles small departments with no special case.

**The coercion trap.** If you skip \`as Number\`, the mixed input breaks in two ways: \`"98000"\` and \`98000\` are not equal, so the duplicate survives \`distinctBy\`; and comparing strings is alphabetical, so \`"9500"\` would rank above \`"12000"\`. Coerce once, at the start.

**Precedence.** A lambda body extends as far right as it can, so \`groupBy ... pluck (s, d) -> {...} orderBy $.department\` would try to sort *inside* each department. The outer parentheses fix that.
`,
  tests: [
    {
      name: 'String and number duplicates, single-person department',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "name": "Lu", "dept": "Legal", "salary": 100 }, { "name": "Ned", "dept": "Admin", "salary": "50" }, { "name": "Kai", "dept": "Legal", "salary": "100" }, { "name": "Mo", "dept": "Legal", "salary": "90" }, { "name": "Al", "dept": "Legal", "salary": 90 }]',
        },
      ],
      expected:
        '[{ "department": "Admin", "secondHighest": null, "earners": [] }, { "department": "Legal", "secondHighest": 90, "earners": ["Al", "Mo"] }]',
    },
    {
      name: 'Empty export',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'How would you generalise this to the Nth highest salary?',
      a: 'Turn the index into a parameter: `fun nthHighest(xs, n) = ((xs distinctBy $) orderBy -$)[n - 1]`. It still returns null when there are fewer than n distinct values.',
    },
    {
      q: 'How do you find duplicate values in an array (another classic)?',
      a: '`(xs groupBy $) filterObject (v) -> sizeOf(v) > 1` gives the duplicated values as keys; `namesOf` (or `keysOf`) turns them into a list.',
    },
    {
      q: 'Why not use `maxBy` twice?',
      a: 'You could take `max`, filter it out and take `max` again, but that is two passes and easy to get wrong with ties. Distinct-sort-index is one readable expression that also generalises to N.',
    },
  ],
}
