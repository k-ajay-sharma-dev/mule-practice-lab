// My Stories: cleaning stored stories, the tips on a story, practice order and records, and the Markdown download.
import assert from 'node:assert/strict'
import {
  blankStory,
  cleanStories,
  cleanStory,
  coverage,
  LIMITS,
  nextToPractise,
  PARTS,
  practiceSummary,
  PROMPTS,
  questionsFor,
  speakingSeconds,
  storyChecks,
  storyMarkdown,
  storyWords,
  surprise,
  TOPIC_PROMPTS,
  TOPICS,
  withPractice,
  words,
} from '../src/study/stories.js'
import { BACKUP_KEYS, SYNCED_KEYS } from '../src/store/local.js'
import { STORIES_KEY } from '../src/store/stories.js'

// stories travel with backups and the account sync
assert.ok(BACKUP_KEYS.includes(STORIES_KEY))
assert.ok(SYNCED_KEYS.includes(STORIES_KEY))

// every focus topic has its own practice question, and every id is unique
for (const [key] of TOPICS) if (key !== 'general') assert.ok(TOPIC_PROMPTS[key], `question for ${key}`)
assert.equal(new Set(PROMPTS.map(([id]) => id)).size, PROMPTS.length)
assert.equal(new Set(TOPICS.map(([id]) => id)).size, TOPICS.length)

// words and speaking time
assert.equal(words(''), 0)
assert.equal(words('I moved 4,000 files a day.'), 6)
assert.equal(words("We didn't retry."), 3)
assert.equal(speakingSeconds(140), 60)
assert.equal(speakingSeconds(280), 120)

const filler = (n, word = 'data') => Array.from({ length: n }, () => word).join(' ')
const good = {
  ...blankStory(),
  id: 's1',
  title: 'Price files',
  topic: 'sftp',
  prompts: ['project', 'hardest'],
  situation: `A grocer sent price files over SFTP every night and ${filler(20)}.`,
  task: `I had to load them before stores opened and ${filler(15)}.`,
  action: `I added a done file check. I moved files to an archive after the load. My retry used a queue and ${filler(120)}.`,
  result: `Loads finished in 25 minutes instead of 4 hours and ${filler(20)}.`,
  lesson: 'I now check partial files first.',
}
const failing = (s) => storyChecks(s).filter((c) => !c.ok).map((c) => c.id)
assert.deepEqual(failing(good), [])

// empty story: every tip is open
assert.deepEqual(failing(blankStory()), ['parts', 'short-situation', 'action-longest', 'say-i', 'number', 'length', 'lesson'])
// a long situation, a team story, no number, too short, too long
assert.ok(failing({ ...good, situation: filler(90) }).includes('short-situation'))
assert.ok(failing({ ...good, action: `We built it and our team ran it. We tested. I helped. ${filler(120)}` }).includes('say-i'))
assert.ok(failing({ ...good, result: `Loads became much faster and ${filler(20)}.` }).includes('number'))
assert.ok(failing({ ...good, action: 'I did it. I fixed it.' }).includes('length'))
assert.match(storyChecks({ ...good, action: `I ${filler(500)} I` }).find((c) => c.id === 'length').say, /minutes aloud/)
assert.ok(failing({ ...good, task: '' }).includes('parts'))
assert.match(storyChecks({ ...good, task: '' }).find((c) => c.id === 'parts').say, /Task/)

// questions: the ticked ones, then the topic's own; a general story with none ticked still gets one
assert.deepEqual(questionsFor(good), [PROMPTS[0][1], PROMPTS[1][1], TOPIC_PROMPTS.sftp])
assert.deepEqual(questionsFor({ ...good, topic: 'general', prompts: [] }), [PROMPTS[0][1]])

// cleaning: bad entries, duplicates, unknown topics and prompts, long text, bad practice records
const cleaned = cleanStories([
  good,
  { ...good },
  null,
  { title: 'no id' },
  { id: 's2', topic: 'mainframe', prompts: ['project', 'nope', 'project'], title: 'x'.repeat(500), practice: [{ at: 'a', seconds: 5, rating: 'great' }, { at: 'b', seconds: 70, rating: 'partly' }] },
])
assert.equal(cleaned.length, 2)
assert.equal(cleaned[1].topic, 'general')
assert.deepEqual(cleaned[1].prompts, ['project'])
assert.equal(cleaned[1].title.length, LIMITS.title)
assert.deepEqual(cleaned[1].practice, [{ at: 'b', seconds: 70, rating: 'partly' }])
assert.equal(cleaned[1].action, '')
assert.deepEqual(cleanStories('not a list'), [])
assert.equal(cleanStory({ id: '' }), null)
assert.equal(cleanStories(Array.from({ length: 80 }, (_, i) => ({ id: `x${i}` }))).length, LIMITS.stories)

// practice records: newest kept, seconds rounded, at most LIMITS.practice
let s = cleanStory(good)
for (let i = 0; i < 25; i++) s = withPractice(s, { seconds: 100.6, rating: i % 2 ? 'nailed' : 'partly' }, `2026-11-${String(i + 1).padStart(2, '0')}`)
assert.equal(s.practice.length, LIMITS.practice)
assert.equal(s.practice.at(-1).at, '2026-11-25')
assert.equal(s.practice[0].seconds, 101)
const summary = practiceSummary(s)
assert.equal(summary.times, LIMITS.practice)
assert.equal(summary.last.rating, 'partly')
assert.equal(summary.nailed, 10)

// next to practise: fewest practices first, then the one practised longest ago
const a = { ...cleanStory({ ...good, id: 'a' }), practice: [{ at: '2026-11-10', seconds: 90, rating: 'nailed' }] }
const b = { ...cleanStory({ ...good, id: 'b' }), practice: [{ at: '2026-11-02', seconds: 90, rating: 'nailed' }] }
const c = { ...cleanStory({ ...good, id: 'c' }), practice: [] }
assert.equal(nextToPractise([a, b, c]).id, 'c')
assert.equal(nextToPractise([a, b]).id, 'b')
assert.equal(nextToPractise([]), null)

// surprise: stories marked for the question come first
const pick = surprise([{ ...a, prompts: ['mistake'] }, { ...b, prompts: ['project'] }], () => 0)
assert.equal(pick.id, 'project')
assert.deepEqual(pick.stories.map((x) => x.id), ['b', 'a'])

// coverage counts topics and questions
const cover = coverage([a, { ...b, topic: 'queues', prompts: ['deadline'] }])
assert.equal(cover.topics.sftp, 1)
assert.equal(cover.topics.queues, 1)
assert.equal(cover.topics.oracle, 0)
assert.equal(cover.prompts.project, 1)
assert.equal(cover.prompts.deadline, 1)

// Markdown download has every part, in order, and the lesson
const md = storyMarkdown(cleanStory(good))
let at = 0
for (const [, label] of PARTS) {
  const i = md.indexOf(`## ${label}`)
  assert.ok(i > at, `${label} in order`)
  at = i
}
assert.match(md, /^# Price files/)
assert.match(md, /Topic: SFTP/)
assert.match(md, /## What I learned/)
assert.match(storyMarkdown(cleanStory({ id: 'e' })), /\(not written yet\)/)
assert.equal(storyWords(blankStory()), 0)

console.log('All story checks pass.')
