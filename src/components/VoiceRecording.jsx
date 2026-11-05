import { useEffect, useRef, useState } from 'react'
import { clipName, KEEP_RECORDINGS, saveProblem, speakingTime } from '../study/recording.js'
import Markdown from './Markdown.jsx'

// Shows that sound is really arriving, so a muted microphone is noticed now and not after the answer.
export function RecordingLive({ stream }) {
  const bar = useRef(null)

  useEffect(() => {
    if (!stream) return
    const audio = new AudioContext()
    audio.resume() // phones can start this suspended, which would leave the meter flat
    const analyser = audio.createAnalyser()
    analyser.fftSize = 256
    audio.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    let frame
    const draw = () => {
      analyser.getByteTimeDomainData(samples)
      const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v - 128)), 0) / 128
      if (bar.current) bar.current.style.width = `${Math.min(100, peak * 160)}%`
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(frame)
      audio.close()
    }
  }, [stream])

  return (
    <div className="voice-live small">
      <span className="voice-dot timer-blink" aria-hidden="true" />
      <span>Recording</span>
      <div className="voice-level" aria-hidden="true">
        <div ref={bar} />
      </div>
    </div>
  )
}

export function VoiceClip({ clip, number, label = 'Your answer', status }) {
  return (
    <div className="voice-clip">
      <div className="voice-clip-head small">
        <span className="muted">
          {label} · {speakingTime(clip.seconds)}
        </span>
        <a href={clip.url} download={clipName(number, clip.type)}>
          Download
        </a>
      </div>
      <audio controls preload="metadata" src={clip.url} />
      {status && <span className={`small ${status.startsWith('Not saved') ? 'warn-text' : 'muted'}`}>{status}</span>}
    </div>
  )
}

const RATING_LABELS = { missed: 'Missed it', partly: 'Partly', nailed: 'Nailed it' }

// Answers kept in the account. The list is light: audio downloads only when an answer is played.
export function SavedAnswers({ version }) {
  const [list, setList] = useState(null)
  const [problem, setProblem] = useState(null)
  const [audio, setAudio] = useState({}) // recording id -> url
  const urls = useRef([])

  useEffect(() => {
    let live = true
    import('../sync/recordings.js')
      .then((r) => r.listRecordings())
      .then(
        (found) => live && setList(found),
        (error) => live && setProblem(saveProblem(error).replace('Not saved', "Couldn't load your saved answers")),
      )
    return () => {
      live = false
    }
  }, [version])

  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), [])

  async function play(recording) {
    setProblem(null)
    try {
      const { loadAudio } = await import('../sync/recordings.js')
      const url = URL.createObjectURL(await loadAudio(recording))
      urls.current.push(url)
      setAudio((a) => ({ ...a, [recording.id]: url }))
    } catch {
      setProblem("Couldn't load that recording. Check your connection and try again.")
    }
  }

  async function remove(id) {
    if (!confirm('Delete this recording from your account? This cannot be undone.')) return
    try {
      const { deleteRecording } = await import('../sync/recordings.js')
      await deleteRecording(id)
      setList((l) => l.filter((r) => r.id !== id))
    } catch {
      setProblem("Couldn't delete that recording. Check your connection and try again.")
    }
  }

  if (!list?.length && !problem) return null
  return (
    <>
      <h2 className="section-heading">
        Saved answers <span className="muted">({list?.length ?? 0})</span>
      </h2>
      <p className="muted small">Your latest {KEEP_RECORDINGS} are kept in your Google account. Older ones are removed automatically.</p>
      {problem && <p className="warn-text small">{problem}</p>}
      <ul className="voice-list">
        {list?.map((r) => (
          <li key={r.id} className="voice-saved">
            <Markdown>{r.question}</Markdown>
            <div className="voice-clip-head small">
              <span className="muted">
                {RATING_LABELS[r.rating]} · {speakingTime(r.seconds)} · {new Date(r.recordedAt).toLocaleDateString()}
              </span>
              <span className="voice-actions">
                {!audio[r.id] && (
                  <button className="btn btn-sm" onClick={() => play(r)}>
                    Play
                  </button>
                )}
                <button className="btn btn-ghost btn-sm danger" onClick={() => remove(r.id)}>
                  Delete
                </button>
              </span>
            </div>
            {audio[r.id] && <audio controls autoPlay src={audio[r.id]} />}
          </li>
        ))}
      </ul>
    </>
  )
}
