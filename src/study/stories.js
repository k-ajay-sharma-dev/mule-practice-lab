// My Stories: short stories about your own work, told in four parts (situation, task, action, result), to answer
// "Tell me about a project" and "What was the hardest problem you solved?". Plain functions, so
// scripts/check-stories.js can test them. The stories themselves are yours and are never part of the site.

export const TOPICS = [
  ['queues', 'Queues'],
  ['azure-blob', 'Azure Blob Storage'],
  ['azure-file-share', 'Azure File Share'],
  ['sftp', 'SFTP'],
  ['ftp', 'FTP'],
  ['sql-server', 'SQL Server'],
  ['oracle', 'Oracle'],
  ['email', 'Email sending'],
  ['batch', 'Batch processing'],
  ['large-files', 'Large files'],
  ['general', 'General'],
]
export const topicLabel = (key) => TOPICS.find(([k]) => k === key)?.[1] ?? 'General'

// Questions interviewers ask about your own work. One story can answer several of them.
export const PROMPTS = [
  ['project', 'Tell me about a recent integration project you worked on.'],
  ['hardest', 'What was the hardest problem you solved in an integration?'],
  ['incident', 'Tell me about a production issue you fixed. How did you find the cause?'],
  ['performance', 'Tell me about a time you made a flow faster or lighter on memory.'],
  ['no-loss', 'How did you make sure no data was lost when a system was down?'],
  ['design', 'Describe a design decision you made and the other options you looked at.'],
  ['mistake', 'Tell me about a mistake you made and what you changed after it.'],
  ['disagree', 'Tell me about a time you disagreed with a teammate or an architect.'],
  ['proud', 'Which piece of work are you most proud of, and why?'],
  ['deadline', 'Tell me about a time you delivered under a tight deadline.'],
]

// One question per focus topic, asked when a story is about that topic.
export const TOPIC_PROMPTS = {
  queues: 'How did you handle retries and failed messages on a queue in your project?',
  'azure-blob': 'How did your integration read or write files in Azure Blob Storage?',
  'azure-file-share': 'Tell me how your flows used an Azure file share and what went wrong with it.',
  sftp: 'How did you make SFTP transfers reliable in your project?',
  ftp: 'Tell me about an FTP integration you built and a problem you met with it.',
  'sql-server': 'How did your integration load data into SQL Server safely?',
  oracle: 'Tell me about working with Oracle from Mule. What did you have to watch for?',
  email: 'How did your integration send emails, and how did you stop them from becoming noise?',
  batch: 'Tell me about a batch job you built. How did you handle failed records?',
  'large-files': 'How did you process a very large file without running out of memory?',
}

export const PARTS = [
  ['situation', 'Situation', 'Where and what. The business, the systems and the problem, in two or three sentences.'],
  ['task', 'Task', 'What you were asked to do, or what had to be true at the end.'],
  ['action', 'Action', 'What you did, step by step. Say "I", name the tools and why you chose them. This is the longest part.'],
  ['result', 'Result', 'What changed. Use numbers: time saved, files a day, errors gone, money or hours.'],
]

export const LIMITS = { title: 120, part: 4000, lesson: 2000, stories: 60, practice: 20 }
export const WORDS_PER_MINUTE = 140
export const TARGET_SECONDS = 120

export const words = (text) => (String(text ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’.,-]*/gu) ?? []).length
export const storyWords = (s) => PARTS.reduce((n, [key]) => n + words(s?.[key]), 0)
export const speakingSeconds = (wordCount) => Math.round((wordCount / WORDS_PER_MINUTE) * 60)

export const blankStory = () => ({ title: '', topic: 'general', prompts: ['project'], situation: '', task: '', action: '', result: '', lesson: '' })

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
const RATINGS = ['missed', 'partly', 'nailed']

// Anything read from storage passes through here, so a damaged or old copy never breaks the page.
export function cleanStory(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null
  const promptIds = PROMPTS.map(([id]) => id)
  return {
    id: raw.id.slice(0, 40),
    title: text(raw.title, LIMITS.title),
    topic: TOPICS.some(([k]) => k === raw.topic) ? raw.topic : 'general',
    prompts: Array.isArray(raw.prompts) ? [...new Set(raw.prompts.filter((p) => promptIds.includes(p)))] : [],
    situation: text(raw.situation, LIMITS.part),
    task: text(raw.task, LIMITS.part),
    action: text(raw.action, LIMITS.part),
    result: text(raw.result, LIMITS.part),
    lesson: text(raw.lesson, LIMITS.lesson),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    practice: (Array.isArray(raw.practice) ? raw.practice : [])
      .filter((p) => p && typeof p.at === 'string' && RATINGS.includes(p.rating) && Number.isFinite(p.seconds))
      .slice(-LIMITS.practice),
  }
}

export function cleanStories(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  return raw
    .map(cleanStory)
    .filter((s) => s && !seen.has(s.id) && seen.add(s.id))
    .slice(0, LIMITS.stories)
}

// Tips on the story as written. They are advice for telling it well, not a grade.
export function storyChecks(s) {
  const n = Object.fromEntries(PARTS.map(([key]) => [key, words(s?.[key])]))
  const total = storyWords(s)
  const seconds = speakingSeconds(total)
  const missing = PARTS.filter(([key]) => n[key] < 8).map(([, label]) => label)
  const action = String(s?.action ?? '')
  const mine = (action.match(/\b(I|I'm|I've|I'd|my|me)\b/g) ?? []).length
  const ours = (action.match(/\b(we|our|us)\b/gi) ?? []).length
  return [
    { id: 'parts', ok: missing.length === 0, say: missing.length ? `Write a few sentences for: ${missing.join(', ')}.` : 'All four parts are written.' },
    {
      id: 'short-situation',
      ok: n.situation > 0 && n.situation <= 70,
      say: n.situation > 70 ? 'Shorten the situation to two or three sentences. Interviewers want to reach what you did.' : 'The situation is short.',
    },
    {
      id: 'action-longest',
      ok: n.action > 0 && n.action >= Math.max(n.situation, n.task, n.result),
      say: 'Spend the most words on the action: what you did and why.',
    },
    {
      id: 'say-i',
      ok: mine >= 2 && mine >= ours,
      say: mine >= 2 && mine >= ours ? 'The action says what you did.' : 'Say "I" in the action. The interviewer is hiring you, not the team.',
    },
    { id: 'number', ok: /\d/.test(String(s?.result ?? '')), say: 'Put a number in the result, such as minutes saved, files a day or errors gone.' },
    {
      id: 'length',
      ok: seconds >= 60 && seconds <= 180,
      say:
        seconds < 60
          ? `About ${seconds} seconds aloud. Add detail to the action so it lasts one to three minutes.`
          : seconds > 180
            ? `About ${Math.round(seconds / 60)} minutes aloud. Cut it to three minutes or less, and keep detail for follow-ups.`
            : `About ${seconds} seconds aloud, which is a good length.`,
    },
    { id: 'lesson', ok: words(s?.lesson) >= 5, say: 'Add what you learned or would do differently. It is a common follow-up.' },
  ]
}

// The questions a story is practised with: the ones you ticked, then its topic's own question.
export function questionsFor(s) {
  const asked = PROMPTS.filter(([id]) => s?.prompts?.includes(id)).map(([, q]) => q)
  const topic = TOPIC_PROMPTS[s?.topic]
  return topic ? [...asked, topic] : asked.length ? asked : [PROMPTS[0][1]]
}

// How many stories each topic and each question has, so the gaps show.
export function coverage(stories) {
  const topics = Object.fromEntries(TOPICS.map(([k]) => [k, 0]))
  const prompts = Object.fromEntries(PROMPTS.map(([k]) => [k, 0]))
  for (const s of stories) {
    topics[s.topic] = (topics[s.topic] ?? 0) + 1
    for (const p of s.prompts) prompts[p] = (prompts[p] ?? 0) + 1
  }
  return { topics, prompts }
}

// A question for "surprise me", with the stories that answer it first and the rest after them.
export function surprise(stories, rand = Math.random) {
  const [id, question] = PROMPTS[Math.floor(rand() * PROMPTS.length)]
  const fits = stories.filter((s) => s.prompts.includes(id))
  return { id, question, stories: [...fits, ...stories.filter((s) => !fits.includes(s))] }
}

// The story least practised comes first, then the one practised longest ago, so every story gets its turn.
export function nextToPractise(stories) {
  const last = (s) => s.practice.at(-1)?.at ?? ''
  return [...stories].sort((a, b) => a.practice.length - b.practice.length || last(a).localeCompare(last(b)))[0] ?? null
}

export function practiceSummary(s) {
  const list = s?.practice ?? []
  const last = list.at(-1) ?? null
  return { times: list.length, last, nailed: list.filter((p) => p.rating === 'nailed').length }
}

export function withPractice(s, { seconds, rating }, at = new Date().toISOString()) {
  return { ...s, practice: [...s.practice, { at, seconds: Math.max(0, Math.round(seconds)), rating }].slice(-LIMITS.practice) }
}

export function storyMarkdown(s) {
  const lines = [`# ${s.title || 'Untitled story'}`, '', `Topic: ${topicLabel(s.topic)}`, '']
  const asked = PROMPTS.filter(([id]) => s.prompts.includes(id)).map(([, q]) => `- ${q}`)
  if (asked.length) lines.push('Answers:', ...asked, '')
  for (const [key, label] of PARTS) lines.push(`## ${label}`, '', s[key].trim() || '(not written yet)', '')
  if (s.lesson.trim()) lines.push('## What I learned', '', s.lesson.trim(), '')
  return lines.join('\n')
}

export const newStoryId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
