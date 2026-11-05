// Voice recording helpers. Plain functions, so scripts/check-recording.js can test them.

// Clear for speech, and small enough that a 3 minute answer (about 540 KB) fits in one Firestore document (1 MiB).
export const AUDIO_BITS = 24000
export const MAX_SAVED_BYTES = 900000 // firestore.rules enforces the same limit
export const KEEP_RECORDINGS = 30

// The list is newest first. What falls off the end is deleted, so storage can't grow without limit.
export const expired = (recordings, keep = KEEP_RECORDINGS) => recordings.slice(keep)

export function saveProblem(error) {
  if (error?.code === 'permission-denied') return 'Not saved: publish the new rules in firestore.rules to your Firebase project.'
  if (error?.message === 'signed-out') return 'Not saved: sign in to keep recordings.'
  return 'Not saved: check your connection. You can still save this one to your device.'
}

// Browsers disagree on audio formats: Chrome and Firefox record webm, Safari records mp4.
const FORMATS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

// Empty means no listed format is supported, so the browser's own default is used.
export const pickFormat = (isSupported) => FORMATS.find(isSupported) ?? ''

export function clipName(number, type) {
  const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
  return `interview-answer-${number}.${extension}`
}

export function speakingTime(seconds) {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// A short message for each way the microphone can fail, because the fix is different for each.
export function micProblem(errorName) {
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return 'Microphone access is blocked. Allow it for this site in your browser settings, then start again.'
  }
  if (errorName === 'NotFoundError') return 'No microphone was found on this device.'
  if (errorName === 'NotReadableError') return 'Another app is using the microphone. Close it and start again.'
  return "The microphone couldn't be started."
}
