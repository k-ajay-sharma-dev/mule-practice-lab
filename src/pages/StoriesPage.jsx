import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import useVoiceRecorder, { canRecord } from '../components/useVoiceRecorder.js'
import { RecordingLive, VoiceClip } from '../components/VoiceRecording.jsx'
import { deleteStory, recordPractice, saveStory, useStories } from '../store/stories.js'
import { saveProblem, speakingTime } from '../study/recording.js'
import {
  blankStory,
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
  TARGET_SECONDS,
  topicLabel,
  TOPICS,
} from '../study/stories.js'
import { useSyncStatus } from '../sync/status.js'
import './stories.css'

const RATINGS = [
  ['missed', 'Missed it'],
  ['partly', 'Partly'],
  ['nailed', 'Nailed it'],
]
const ratingLabel = (r) => RATINGS.find(([k]) => k === r)?.[1] ?? ''

// My Stories: your own work told in four parts, then practised aloud against a timer.
export default function StoriesPage() {
  const stories = useStories()
  const { storyId } = useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(null)
  const [practice, setPractice] = useState(null) // { story, question }
  const [pick, setPick] = useState(null) // a surprise question waiting for its story

  useEffect(() => {
    setDraft(null)
    setPractice(null)
    setPick(null)
  }, [storyId])

  if (draft) {
    return (
      <StoryEditor
        draft={draft}
        onChange={setDraft}
        onCancel={() => setDraft(null)}
        onSave={() => {
          const id = saveStory(draft)
          navigate(`/stories/${id}`)
          setDraft(null)
        }}
      />
    )
  }

  if (practice) return <Practice {...practice} onClose={() => setPractice(null)} />

  if (storyId) {
    const story = stories.find((s) => s.id === storyId)
    return (
      <div className="stories-page">
        <p className="eyebrow">
          <Link to="/stories">← my stories</Link>
        </p>
        {!story && <p className="muted">This story isn't saved here. It may have been deleted.</p>}
        {story && (
          <StoryView
            story={story}
            onEdit={() => setDraft({ ...story })}
            onPractise={(question) => setPractice({ story, question })}
            onDelete={() => {
              if (!confirm(`Delete "${story.title}"? This cannot be undone.`)) return
              deleteStory(story.id)
              navigate('/stories')
            }}
          />
        )}
      </div>
    )
  }

  const cover = coverage(stories)
  const next = nextToPractise(stories)
  return (
    <div className="stories-page">
      <p className="eyebrow">// my stories</p>
      <h1>My Stories</h1>
      <p className="muted">
        Short stories about your own work, for "Tell me about a project" and "What was the hardest problem you solved?". Write
        each one in four parts, then practise saying it aloud in about two minutes.
      </p>
      <Privacy />

      <div className="settings-actions">
        <button className="btn btn-primary" onClick={() => setDraft(blankStory())} disabled={stories.length >= LIMITS.stories}>
          New story
        </button>
        {next && (
          <button className="btn" onClick={() => setPractice({ story: next, question: questionsFor(next)[0] })}>
            Practise the next story
          </button>
        )}
        {stories.length > 0 && (
          <button className="btn" onClick={() => setPick(surprise(stories))}>
            Surprise question
          </button>
        )}
      </div>

      {pick && (
        <section className="settings-card story-pick">
          <p className="story-question">{pick.question}</p>
          <p className="muted small">Which story answers this best? Pick one, then tell it.</p>
          <div className="story-pick-list">
            {pick.stories.map((s) => (
              <button key={s.id} className={`btn btn-sm${s.prompts.includes(pick.id) ? ' btn-primary' : ''}`} onClick={() => setPractice({ story: s, question: pick.question })}>
                {s.title || 'Untitled story'}
              </button>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setPick(null)}>
              Cancel
            </button>
          </div>
          <p className="muted small">Stories marked for this question are highlighted.</p>
        </section>
      )}

      <h2 className="section-heading">Topics</h2>
      <p className="muted small">Aim for at least one story for each topic you name on your CV. Empty topics are the gaps.</p>
      <div className="story-coverage">
        {TOPICS.map(([key, label]) => (
          <span key={key} className={`story-topic${cover.topics[key] ? ' has' : ''}`}>
            {label} <b>{cover.topics[key]}</b>
          </span>
        ))}
      </div>

      <h2 className="section-heading">Stories ({stories.length})</h2>
      {stories.length === 0 && (
        <p className="muted">
          No stories yet. Start with the project you know best: what was broken, what you built, and what changed because of
          it.
        </p>
      )}
      <div className="story-grid">
        {stories.map((s) => {
          const p = practiceSummary(s)
          const tips = storyChecks(s).filter((c) => !c.ok).length
          return (
            <Link key={s.id} to={`/stories/${s.id}`} className="track-card story-card">
              <h3>{s.title || 'Untitled story'}</h3>
              <span className="muted small">
                {topicLabel(s.topic)} · about {speakingTime(speakingSeconds(storyWords(s)))} aloud
              </span>
              <span className="muted small">
                {p.times ? `Practised ${p.times} time${p.times === 1 ? '' : 's'} · last: ${ratingLabel(p.last.rating)}` : 'Not practised yet'}
              </span>
              {tips > 0 && <span className="warn-text small">{tips} tip{tips === 1 ? '' : 's'} to improve it</span>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function Privacy() {
  const sync = useSyncStatus()
  const signedIn = Boolean(sync.user) && sync.state !== 'signed-out'
  return (
    <p className="muted small story-privacy">
      🔒 Your stories are saved in this browser
      {signedIn ? ' and in your Google account, so your other devices get them.' : '. Sign in to keep them in your Google account too.'} They are
      never part of the site, so nobody else can read them. Use real details: this is your own notebook.
    </p>
  )
}

function StoryEditor({ draft, onChange, onCancel, onSave }) {
  const set = (key, value) => onChange({ ...draft, [key]: value })
  const togglePrompt = (id) => set('prompts', draft.prompts.includes(id) ? draft.prompts.filter((p) => p !== id) : [...draft.prompts, id])
  const checks = storyChecks(draft)
  const seconds = speakingSeconds(storyWords(draft))
  return (
    <div className="stories-page">
      <p className="eyebrow">
        <Link to="/stories" onClick={onCancel}>
          ← my stories
        </Link>
      </p>
      <h1>{draft.id ? 'Edit story' : 'New story'}</h1>
      <div className="story-editor">
        <div className="story-form">
          <label className="field">
            <span className="small muted">Title, for you only (for example "Price files that took four hours")</span>
            <input className="input" value={draft.title} maxLength={LIMITS.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="field">
            <span className="small muted">Main topic</span>
            <select className="input" value={draft.topic} onChange={(e) => set('topic', e.target.value)}>
              {TOPICS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="field story-prompts">
            <legend className="small muted">Questions this story answers</legend>
            {PROMPTS.map(([id, q]) => (
              <label key={id} className="small">
                <input type="checkbox" checked={draft.prompts.includes(id)} onChange={() => togglePrompt(id)} /> {q}
              </label>
            ))}
          </fieldset>
          {PARTS.map(([key, label, help]) => (
            <label key={key} className="field">
              <span className="small">
                <b>{label}</b> <span className="muted">· {help}</span>
              </span>
              <textarea className="input story-part" rows={key === 'action' ? 8 : 4} maxLength={LIMITS.part} value={draft[key]} onChange={(e) => set(key, e.target.value)} />
            </label>
          ))}
          <label className="field">
            <span className="small">
              <b>What I learned</b> <span className="muted">· What you would do differently, or what you now do every time.</span>
            </span>
            <textarea className="input story-part" rows={3} maxLength={LIMITS.lesson} value={draft.lesson} onChange={(e) => set('lesson', e.target.value)} />
          </label>
          <div className="settings-actions">
            <button className="btn btn-primary" onClick={onSave} disabled={!draft.title.trim()}>
              Save story
            </button>
            <button className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            {!draft.title.trim() && <span className="muted small">Give it a title to save it.</span>}
          </div>
        </div>
        <aside className="settings-card story-tips">
          <h3>About {speakingTime(seconds)} aloud</h3>
          <div className="progress-bar">
            <div style={{ width: `${Math.min(100, (seconds / 180) * 100)}%` }} />
          </div>
          <p className="muted small">Aim for one to three minutes. Keep extra detail for the follow-up questions.</p>
          <Tips checks={checks} />
        </aside>
      </div>
    </div>
  )
}

function Tips({ checks }) {
  return (
    <ul className="check-list story-checks">
      {checks.map((c) => (
        <li key={c.id} className="small">
          <span className={c.ok ? 'ok-text' : 'warn-text'} aria-hidden="true">
            {c.ok ? '✓' : '•'}
          </span>
          <span className={c.ok ? 'muted' : ''}>{c.say}</span>
        </li>
      ))}
    </ul>
  )
}

function StoryView({ story, onEdit, onPractise, onDelete }) {
  const p = practiceSummary(story)
  function download() {
    const blob = new Blob([storyMarkdown(story)], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `${(story.title || 'story').replace(/[^\w-]+/g, '-')}.md` }).click()
    URL.revokeObjectURL(url)
  }
  return (
    <>
      <h1>{story.title || 'Untitled story'}</h1>
      <p className="muted small">
        {topicLabel(story.topic)} · about {speakingTime(speakingSeconds(storyWords(story)))} aloud ·{' '}
        {p.times ? `practised ${p.times} time${p.times === 1 ? '' : 's'}, ${p.nailed} nailed` : 'not practised yet'}
      </p>
      <div className="settings-actions">
        <button className="btn btn-primary" onClick={() => onPractise(questionsFor(story)[0])}>
          Practise aloud
        </button>
        <button className="btn" onClick={onEdit}>
          Edit
        </button>
        <button className="btn" onClick={download}>
          Download .md
        </button>
        <button className="btn btn-ghost danger" onClick={onDelete}>
          Delete
        </button>
      </div>

      <section className="settings-card">
        <h3>Questions to practise with</h3>
        <ul className="story-asks">
          {questionsFor(story).map((q) => (
            <li key={q}>
              <span>{q}</span>
              <button className="btn btn-sm" onClick={() => onPractise(q)}>
                Practise
              </button>
            </li>
          ))}
        </ul>
      </section>

      <StoryParts story={story} />
      <section className="settings-card">
        <h3>Tips</h3>
        <Tips checks={storyChecks(story)} />
      </section>
      {p.times > 0 && (
        <section className="settings-card">
          <h3>Practice so far</h3>
          <ul className="story-history small">
            {[...story.practice].reverse().map((r) => (
              <li key={r.at}>
                {new Date(r.at).toLocaleDateString()} · {speakingTime(r.seconds)} · {ratingLabel(r.rating)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function StoryParts({ story }) {
  return (
    <div className="story-parts">
      {PARTS.map(([key, label]) => (
        <section key={key} className="story-part-view">
          <h3>{label}</h3>
          <p className={story[key].trim() ? '' : 'muted'}>{story[key].trim() || 'Not written yet.'}</p>
        </section>
      ))}
      {story.lesson.trim() && (
        <section className="story-part-view">
          <h3>What I learned</h3>
          <p>{story.lesson.trim()}</p>
        </section>
      )}
    </div>
  )
}

// One telling: the question, a timer, an optional recording, then the story to compare and a rating.
function Practice({ story, question, onClose }) {
  const voice = useVoiceRecorder()
  const sync = useSyncStatus()
  const signedIn = Boolean(sync.user) && sync.state !== 'signed-out'
  const [record, setRecord] = useState(canRecord)
  const [cues, setCues] = useState(false)
  const [phase, setPhase] = useState('ready') // ready | telling | done
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(null)
  const started = useRef(0)

  useEffect(() => {
    if (phase !== 'telling') return
    const tick = setInterval(() => setElapsed((Date.now() - started.current) / 1000), 250)
    return () => clearInterval(tick)
  }, [phase])

  useEffect(() => () => voice.close(), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    voice.discard()
    setSaved(null)
    if (record && (voice.micOn || (await voice.open()))) voice.begin('story')
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
    recordPractice(story.id, { seconds: elapsed, rating })
    const clip = voice.clips.story
    if (!signedIn || !clip) return setSaved({ rating, text: null })
    setSaved({ rating, text: 'Saving the recording to your account…' })
    try {
      const { saveRecording } = await import('../sync/recordings.js')
      const info = { question: `Story: ${story.title} · ${question}`, problemId: `story-${story.id}`, rating, seconds: Math.round(clip.seconds) }
      await saveRecording(info, clip.blob)
      setSaved({ rating, text: 'Recording saved. It is listed under Saved answers in Interview Practice.' })
    } catch (error) {
      setSaved({ rating, text: saveProblem(error) })
    }
  }

  const over = elapsed > TARGET_SECONDS
  const clip = voice.clips.story
  return (
    <div className="stories-page">
      <p className="eyebrow">
        <button className="link-btn" onClick={onClose}>
          ← back
        </button>
      </p>
      <section className="settings-card story-stage">
        <p className="muted small">Practising: {story.title || 'Untitled story'}</p>
        <p className="story-question">{question}</p>

        {phase === 'ready' && (
          <>
            <p className="muted small">
              Say it out loud as if the interviewer had asked it. Start with one sentence of situation, spend most of the time on
              what you did, and end with the result and a number.
            </p>
            <div className="story-options small">
              {canRecord && (
                <label>
                  <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} /> Record my answer
                </label>
              )}
              <label>
                <input type="checkbox" checked={cues} onChange={(e) => setCues(e.target.checked)} /> Show the four headings as cues
              </label>
            </div>
            {voice.problem && <p className="warn-text small">{voice.problem}</p>}
            <button className="btn btn-primary" onClick={start}>
              Start telling
            </button>
          </>
        )}

        {phase === 'telling' && (
          <>
            <div className={`story-timer${over ? ' over' : ''}`} aria-live="off">
              {speakingTime(elapsed)} <span className="muted small">/ {speakingTime(TARGET_SECONDS)}</span>
            </div>
            <div className="progress-bar">
              <div style={{ width: `${Math.min(100, (elapsed / TARGET_SECONDS) * 100)}%` }} />
            </div>
            {over && <p className="warn-text small">Past two minutes. Move to the result.</p>}
            {voice.recording && <RecordingLive stream={voice.stream.current} />}
            {voice.problem && <p className="warn-text small">{voice.problem}</p>}
            {cues && (
              <ol className="story-cues small">
                {PARTS.map(([key, label]) => (
                  <li key={key}>{label}</li>
                ))}
                <li>What I learned</li>
              </ol>
            )}
            <button className="btn btn-primary" onClick={stop}>
              I'm done
            </button>
          </>
        )}

        {phase === 'done' && (
          <>
            <p>
              You spoke for <b>{speakingTime(elapsed)}</b>.{' '}
              {elapsed < 45 ? 'That is short. Add more about what you did.' : elapsed > 180 ? 'That is long. Keep detail for follow-ups.' : 'A good length.'}
            </p>
            {clip && <VoiceClip clip={clip} number={1} label="Your telling" />}
            <p className="muted small">Compare with your story below. Did you say each part, use "I", and give a number in the result?</p>
            {!saved ? (
              <div className="settings-actions">
                {RATINGS.map(([key, label]) => (
                  <button key={key} className={`btn${key === 'nailed' ? ' btn-primary' : ''}`} onClick={() => rate(key)}>
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <p className="small">
                  Marked as <b>{ratingLabel(saved.rating)}</b>.
                  {saved.text && <span className={saved.text.startsWith('Not saved') ? ' warn-text' : ' muted'}> {saved.text}</span>}
                </p>
                <div className="settings-actions">
                  <button className="btn btn-primary" onClick={start}>
                    Tell it again
                  </button>
                  <button className="btn" onClick={onClose}>
                    Done
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
      {phase === 'done' && <StoryParts story={story} />}
    </div>
  )
}
