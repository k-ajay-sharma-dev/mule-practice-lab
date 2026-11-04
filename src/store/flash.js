import { writeLocal } from './local.js'

// Leitner boxes per card: pl.flash = { cardId: box } with box 1..5. A miss sends a card to box 1 and a success
// moves it up, starting from box 2, so box 1 always means "missed last time".
const FLASH_KEY = 'pl.flash'
const MAX_BOX = 5

export function loadBoxes() {
  try {
    const boxes = JSON.parse(localStorage.getItem(FLASH_KEY))
    return boxes && typeof boxes === 'object' && !Array.isArray(boxes) ? boxes : {}
  } catch {
    return {}
  }
}

export function saveBoxes(boxes) {
  writeLocal(FLASH_KEY, JSON.stringify(boxes))
}

export const nextBox = (box, good) => (good ? Math.min(MAX_BOX, (box ?? 1) + 1) : 1)

// Card ids are "<problemId>:<card>"
export const problemOfCard = (cardId) => cardId.split(':')[0]
