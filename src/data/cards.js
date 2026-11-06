import { CATEGORIES } from './categories.js'
import { problems } from './problems.js'
import { choiceLabel } from '../study/mix.js'
import { trackProblems, TRACKS } from './tracks.js'

export const shuffle = (list) => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const followUpCards = (p) =>
  (p.followUps ?? []).map((f, i) => ({ id: `${p.id}:f${i}`, problem: p, kind: 'Follow-up', front: f.q, back: f.a }))

export function cardsOf(p) {
  const cards = followUpCards(p)
  if (p.keyPoints?.length)
    cards.push({
      id: `${p.id}:k`,
      problem: p,
      kind: 'Key points',
      front: `What are the key points of **${p.title}**?`,
      back: p.keyPoints.map((k) => `- ${k}`).join('\n'),
    })
  return cards
}

export const DECKS = [
  { key: 'all', label: 'Everything', pick: () => problems },
  ...CATEGORIES.map((c) => ({ key: c.slug, label: c.label, group: 'Sections', pick: () => problems.filter((p) => p.category === c.slug) })),
  ...TRACKS.map((t) => ({ key: `track:${t.slug}`, label: t.title, group: 'Topic tracks', pick: () => trackProblems(t) })),
]

// everything except the "all" deck: choosing nothing already means everything
export const DECK_OPTIONS = DECKS.slice(1).map((d) => ({ value: d.key, label: d.label, group: d.group }))

const deckByKey = (key) => DECKS.find((d) => d.key === key) ?? DECKS[0]

// The problems of each chosen deck, one list per deck. Nothing chosen means everything.
export const deckLists = (keys) => (keys.length ? keys : ['all']).map((key) => deckByKey(key).pick())
export const decksLabel = (keys) => choiceLabel(keys.map((key) => deckByKey(key).label))
