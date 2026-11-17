export default {
  id: 'dw-136',
  category: 'dataweave',
  title: 'Rank a Quiz League with Shared Places',
  level: 'INTERMEDIATE',
  tags: ['ranking', 'ties', 'filter', 'distinctBy', 'orderBy', 'flatMap', 'interview-classic', 'json'],
  estMinutes: 20,
  description: `
Lantern Lane Leisure runs a quiz league across its pubs. After each round, the app shows a league table. Teams with the same score share a place, and the next place is skipped. Two teams on 47 points are both 1st, and the next team is 3rd.

Output one object per team with:

- \`place\`: 1 plus the number of teams with a **higher** score
- \`name\` and \`score\`: copied from the input
- \`joint\`: \`true\` when another team has the same score

Sort the table by \`place\`, and teams that share a place by \`name\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "name": "Brainstormers", "score": 42 },
  { "name": "Quizzly Bears", "score": 47 },
  { "name": "Pens Down", "score": 38 },
  { "name": "Les Quizerables", "score": 42 },
  { "name": "Late Arrivals", "score": 29 },
  { "name": "The Know-Alls", "score": 47 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "place": 1, "name": "Quizzly Bears", "score": 47, "joint": true },
  { "place": 1, "name": "The Know-Alls", "score": 47, "joint": true },
  { "place": 3, "name": "Brainstormers", "score": 42, "joint": true },
  { "place": 3, "name": "Les Quizerables", "score": 42, "joint": true },
  { "place": 5, "name": "Pens Down", "score": 38, "joint": false },
  { "place": 6, "name": "Late Arrivals", "score": 29, "joint": false }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload orderBy -$.score map (team, i) -> {
  place: i + 1,
  name: team.name,
  score: team.score,
  joint: false
}
`,
  hints: [
    'The starter numbers rows by position, so two teams on 47 get 1 and 2. A place has to come from the scores instead.',
    'For one team, `sizeOf(payload filter ($.score > team.score))` counts the teams above it. Add 1 for its place.',
    'The same idea with `==` counts teams on the same score. The team itself is one of them, so `joint` is a count above 1.',
    'To sort by place and then by name, take each distinct place in order and, for each one, the teams on that place sorted by name. `flatMap` joins those lists into one.',
  ],
  solution: `%dw 2.0
output application/json
var ranked = payload map (team) -> {
  place: 1 + sizeOf(payload filter ($.score > team.score)),
  name: team.name,
  score: team.score,
  joint: sizeOf(payload filter ($.score == team.score)) > 1
}
var places = (ranked map $.place) distinctBy $ orderBy $
---
places flatMap (p) -> (ranked filter ($.place == p)) orderBy $.name`,
  explanation: `
**Place from the scores.** A team's place is 1 plus the number of teams that beat it. Teams on the same score beat the same teams, so they get the same place. The next place is skipped by itself, because two teams now sit above the team on 42.

**joint.** Counting the teams on the same score includes the team itself. A count of 1 means it is alone, and more than 1 means it shares the place.

**Sorting on two keys.** Each distinct place is taken in order. For each place, the teams on it are sorted by name. \`flatMap\` joins the small lists into one table. Every step has one clear sort key, so the result does not depend on how a sort treats equal items.

**Cost.** Each team scans the whole list, so the work grows with the square of the number of teams. For a league of a few dozen teams that does not matter.
`,
  tests: [
    {
      name: 'Every team on the same score',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "name": "Zeta", "score": 10 }, { "name": "Alpha", "score": 10 }]' }],
      expected: '[{ "place": 1, "name": "Alpha", "score": 10, "joint": true }, { "place": 1, "name": "Zeta", "score": 10, "joint": true }]',
    },
    {
      name: 'No ties',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "name": "Owls", "score": 12 }, { "name": "Foxes", "score": 30 }]' }],
      expected: '[{ "place": 1, "name": "Foxes", "score": 30, "joint": false }, { "place": 2, "name": "Owls", "score": 12, "joint": false }]',
    },
    {
      name: 'No teams',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'The league wants places of 1, 1, 2 instead of 1, 1, 3. What changes?',
      a: 'That is dense ranking. Count the **distinct** scores above the team instead of the teams: `1 + sizeOf((payload filter ($.score > team.score)) map $.score distinctBy $)`.',
    },
    {
      q: 'How would you make it faster for 50,000 players?',
      a: 'Sort the scores once and give each distinct score its place from its position, for example in a lookup object keyed by score. Each player then reads its place from the lookup instead of scanning the whole list.',
    },
    {
      q: 'How would you print 1st, 2nd and 3rd?',
      a: 'Add a small function that picks the ending. Numbers ending in 11, 12 and 13 take th. Otherwise a last digit of 1 takes st, 2 takes nd, 3 takes rd, and the rest take th.',
    },
  ],
}
