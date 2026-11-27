import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import useVoiceRecorder, { canRecord } from '../../components/useVoiceRecorder.js'
import { RecordingLive, VoiceClip } from '../../components/VoiceRecording.jsx'
import { saveProblem, speakingTime } from '../../study/recording.js'
import { useSyncStatus } from '../../sync/status.js'

const TARGET_SECONDS = 120
const RATINGS = [
  ['missed', 'Missed it'],
  ['partly', 'Partly'],
  ['nailed', 'Nailed it'],
]

export const explainQuestion = (lab) => `Walk me through how you found and fixed: ${lab.title}`

// The points a good answer covers, from the lab itself: what broke, what you did, and why it works.
// Sentences about how the simulator differs from the platform are left out: they are not for the interview.
export function talkingPoints(lab) {
  const did = lab.steps.filter((s) => !s.ask).map((s) => s.title)
  const picks = did.length > 5 ? [...did.slice(0, 2), ...did.slice(-3)] : did
  const why = String(lab.why ?? '')
    .split(/(?<=\.)\s+/)
    .filter((s) => !/\b(the|this) lab\b/i.test(s))
    .join(' ')
  return [
    ['The incident', lab.title],
    ['What I did', picks.join('. ') + (picks.length ? '.' : '')],
    ['Why it works', why],
  ].filter(([, text]) => text)
}

// Interview Practice recording for a lab: the same recorder as Interview Practice and My Stories. A recording is kept in
// the account when you are signed in and shows under Saved answers in Interview Practice.
export default function ExplainAloud({ lab, onClose }) {
  const voice = useVoiceRecorder()
  const sync = useSyncStatus()
  const signedIn = Boolean(sync.user) && sync.state !== 'signed-out'
  const [record, setRecord] = useState(canRecord)
  const [phase, setPhase] = useState('ready') // ready | telling | done
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(null)
  const started = useRef(0)
  const question = explainQuestion(lab)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (phase !== 'telling') return undefined
    const tick = setInterval(() => setElapsed((Date.now() - started.current) / 1000), 250)
    return () => clearInterval(tick)
  }, [phase])

  useEffect(() => {
    const key = (e) => e.key === 'Escape' && close.current()
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      voice.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    voice.discard()
    setSaved(null)
    if (record && (voice.micOn || (await voice.open()))) voice.begin('lab')
    started.current = Date.now()
    setElapsed(0)
    setPhase('telling')
  }

  function stop() {
    voice.finish()
    setElapsed((Date.now() - started.current) / 1000)
    setPhase('done')
  }

  async function rate(rating) {
    const clip = voice.clips.lab
    if (!signedIn || !clip) return setSaved({ rating, text: clip ? 'Sign in to keep recordings in your account.' : null })
    setSaved({ rating, text: 'Saving the recording to your account…' })
    try {
      const { saveRecording } = await import('../../sync/recordings.js')
      await saveRecording({ question: `Lab: ${question}`, problemId: `lab-${lab.id}`, rating, seconds: Math.round(clip.seconds) }, clip.blob)
      setSaved({ rating, text: 'Recording saved. It is listed under Saved answers in Interview Practice.' })
    } catch (error) {
      setSaved({ rating, text: saveProblem(error) })
    }
  }

  const clip = voice.clips.lab
  const over = elapsed > TARGET_SECONDS
  return createPortal(
    <div className="pl-explain-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="pl-explain" role="dialog" aria-modal="true" aria-label="Explain this fix out loud">
        <div className="pl-explain-head">
          <b>Explain this fix out loud</b>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="pl-explain-q">{question}</p>

        {phase === 'ready' && (
          <>
            <p className="muted small">Answer as if the interviewer asked it. Say what broke, how you found the cause, what you changed and how you proved it worked. Aim for about two minutes.</p>
            {canRecord && (
              <label className="small">
                <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} /> Record my answer
              </label>
            )}
            {voice.problem && <p className="warn-text small">{voice.problem}</p>}
            <div className="pl-explain-actions">
              <button type="button" className="btn btn-primary" onClick={start}>
                Start answering
              </button>
            </div>
          </>
        )}

        {phase === 'telling' && (
          <>
            <div className={`pl-explain-timer mono${over ? ' over' : ''}`} aria-live="off">
              {speakingTime(elapsed)} <span className="muted small">/ {speakingTime(TARGET_SECONDS)}</span>
            </div>
            {over && <p className="warn-text small">Past two minutes. Move to the result.</p>}
            {voice.recording && <RecordingLive stream={voice.stream.current} />}
            {voice.problem && <p className="warn-text small">{voice.problem}</p>}
            <div className="pl-explain-actions">
              <button type="button" className="btn btn-primary" onClick={stop}>
                I'm done
              </button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <p className="small">
              You spoke for <b>{speakingTime(elapsed)}</b>. {elapsed < 45 ? 'That is short. Add how you found the cause.' : elapsed > 180 ? 'That is long. Keep detail for follow ups.' : 'A good length.'}
            </p>
            {clip && <VoiceClip clip={clip} number={1} label="Your answer" />}
            <p className="muted small">Compare with the points below. Did you cover each one?</p>
            <dl className="pl-explain-points small">
              {talkingPoints(lab).map(([label, text]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
            {!saved ? (
              <div className="pl-explain-actions">
                {RATINGS.map(([key, label]) => (
                  <button key={key} type="button" className={`btn${key === 'nailed' ? ' btn-primary' : ''}`} onClick={() => rate(key)}>
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <p className="small">
                  Marked as <b>{RATINGS.find(([k]) => k === saved.rating)?.[1]}</b>.{saved.text && <span className={saved.text.startsWith('Not saved') ? ' warn-text' : ' muted'}> {saved.text}</span>}
                </p>
                <div className="pl-explain-actions">
                  <button type="button" className="btn btn-primary" onClick={start}>
                    Answer again
                  </button>
                  <Link to="/interview" className="btn">
                    Open Interview Practice
                  </Link>
                  <button type="button" className="btn" onClick={onClose}>
                    Done
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>,
    document.body,
  )
}
