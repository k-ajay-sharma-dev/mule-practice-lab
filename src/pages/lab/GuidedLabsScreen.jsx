import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GUIDED_LABS, labById, runCheck } from '../../lab/labs.js'
import { GROUPS, PLATFORM_LABS } from '../../lab/platform-labs.js'
import { PIPELINE_LABS } from '../../lab/pipeline-labs.js'
import PipelineScreen from './PipelineScreen.jsx'
import { policyByType } from '../../lab/policies.js'
import Assumed from './Assumed.jsx'
import { AppsTab, NodesTab, PoliciesTab, TiersTab } from './ConfigTabs.jsx'
import { formFor, RuntimeWorkbench } from './RuntimeManagerScreen.jsx'
import { topologyOf } from '../../lab/engine.js'
import { markLabSolved, mergeSolvedLabs, readSolvedLabs, writeSolvedLabs } from '../../store/labs.js'
import { useSyncStatus } from '../../sync/status.js'
import { drillBonus, readDrills } from '../../store/lab-points.js'
import { noteSolve } from '../../store/solves.js'
import { beginHideHowOverride, endHideHowOverride, readMysteryGroups, writeMysteryGroups } from './lab-prefs.js'
import { defaultMysteryGroups, maskLab, pickMystery, recordMystery } from './mystery.js'
import PostIncident from './Writeup.jsx'
import WeakTopics from './WeakTopics.jsx'

const PlatformLab = lazy(() => import('../anypoint/PlatformLab.jsx').then((m) => ({ default: m.PlatformLab })))

const PROGRESS_KEY = 'pl.lab.guided'
const ALL = [...PLATFORM_LABS, ...PIPELINE_LABS, ...GUIDED_LABS]
const platformIds = new Set(PLATFORM_LABS.map((l) => l.id))
const pipelineIds = new Set(PIPELINE_LABS.map((l) => l.id))
const SECTIONS = [
  ...GROUPS.map((name) => [name, PLATFORM_LABS.filter((l) => l.group === name)]),
  ['CI/CD with GitHub Actions', PIPELINE_LABS],
  ['Policies and quotas', GUIDED_LABS.filter((l) => l.kind !== 'runtime')],
  ['Deployments', GUIDED_LABS.filter((l) => l.kind === 'runtime')],
]

// the console groups an on call drill picks from: things that break in production
const DRILL_GROUPS = ['Failed jobs', 'More production failures', 'API-led failures', 'Versioning without breaking consumers', 'Your own servers', 'Files, SFTP and batch', 'Databases and queues', 'Kafka', 'Security']
const minutesOf = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

function DrillPanel({ drills, onStart, onOpen }) {
  const titles = new Map(PLATFORM_LABS.map((l) => [l.id, l.title]))
  const best = Object.entries(drills.best)
    .filter(([id]) => titles.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const recent = drills.history.slice(0, 5)
  return (
    <section className="lab-drill" aria-label="On call drills">
      <div className="lab-panel-head">
        <h2>On call drills</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={onStart}>
          Start an on call drill
        </button>
      </div>
      <p className="muted small">
        A random production failure opens in the console with the steps hidden. A timer counts up while you work. Hints show the next step and then how to do it, and each one costs points. Each lab gives up to 20 bonus points: your best score divided by 5.
      </p>
      {(best.length > 0 || recent.length > 0) && (
        <div className="lab-drill-lists small">
          {best.length > 0 && (
            <div>
              <b>Best scores</b>
              <ol>
                {best.map(([id, score]) => (
                  <li key={id}>
                    <button type="button" className="link-btn" onClick={() => onOpen(id)}>
                      {titles.get(id)}
                    </button>{' '}
                    <span className="mono">{score}</span> <span className="muted">(+{drillBonus(score)} points)</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <b>Recent drills</b>
              <ol>
                {recent.map((d) => (
                  <li key={d.at}>
                    {d.title} <span className="muted">{d.gaveUp ? 'gave up' : `score ${d.score}, ${minutesOf(d.seconds)}, ${d.hints} hint${d.hints === 1 ? '' : 's'}`}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function MysteryPanel({ groups, onGroups, onStart }) {
  const count = PLATFORM_LABS.filter((l) => groups.includes(l.group)).length
  const toggle = (name, on) => onGroups(on ? GROUPS.filter((g) => g === name || groups.includes(g)) : groups.filter((g) => g !== name))
  return (
    <section className="lab-drill lab-mystery" aria-label="Mystery incident">
      <div className="lab-panel-head">
        <h2>Mystery incident</h2>
        <button type="button" className="btn btn-primary btn-sm" disabled={count === 0} onClick={onStart}>
          Mystery incident
        </button>
      </div>
      <p className="muted small">
        A random lab from the groups you choose opens with its title, its group and the step titles that give the cause away hidden. You see only the symptoms: the scenario, the mail and the logs. Steps still tick off as you work. The lab shows at the end. Labs you have not solved come first.
      </p>
      <details className="lab-mystery-groups small">
        <summary>
          Groups: {groups.length} of {GROUPS.length} chosen, {count} labs
        </summary>
        <fieldset>
          <legend className="muted">Pick from these groups</legend>
          {GROUPS.map((name) => (
            <label key={name}>
              <input type="checkbox" checked={groups.includes(name)} onChange={(e) => toggle(name, e.target.checked)} /> {name}
            </label>
          ))}
        </fieldset>
        <div className="lab-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGroups(defaultMysteryGroups(GROUPS))}>
            Production failures only
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGroups(GROUPS)}>
            All groups
          </button>
        </div>
      </details>
    </section>
  )
}

const isConfig = (c) =>
  Array.isArray(c?.apps) && Array.isArray(c?.tiers) && Array.isArray(c?.policies) && [...c.policies, ...(c.automated ?? [])].every((p) => policyByType.has(p?.type))
const isRuntimeState = (s) => Number.isFinite(s?.clock) && Array.isArray(s?.apps)
const isSaved = (lab, config) => (lab.kind === 'runtime' ? isRuntimeState(config) : isConfig(config))

// Solved labs live in their own key, which cloud sync carries. The states of labs in progress stay in this browser.
function loadProgress() {
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(PROGRESS_KEY))
  } catch {
    // unreadable: start from nothing
  }
  const configs = Object.fromEntries(Object.entries(saved?.configs ?? {}).filter(([id, config]) => labById.has(id) && isSaved(labById.get(id), config)))
  // labs solved before sync existed were kept as { id: true } in pl.lab.guided: move them over once
  const before = Object.fromEntries(Object.keys(saved?.solved ?? {}).filter((id) => saved.solved[id]).map((id) => [id, '2026-01-01T00:00:00.000Z']))
  const solved = readSolvedLabs()
  if (Object.keys(before).some((id) => !solved[id])) {
    const merged = mergeSolvedLabs(solved, before)
    writeSolvedLabs(merged)
    return { solved: merged, configs }
  }
  return { solved, configs }
}

function saveProgress({ solved, configs }) {
  try {
    // solved stays here too, so an older copy of the site still shows it
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ solved: Object.fromEntries(Object.keys(solved).map((id) => [id, true])), configs }))
  } catch {
    // storage blocked: progress lasts for this visit
  }
}

export default function GuidedLabsScreen() {
  const [progress, setProgress] = useState(loadProgress)
  const [labId, setLabId] = useState(null)
  const lab = ALL.find((l) => l.id === labId)
  const solvedCount = ALL.filter((l) => progress.solved[l.id]).length

  useEffect(() => saveProgress(progress), [progress])
  // a sync can bring labs solved on another device
  const { lastSync } = useSyncStatus()
  useEffect(() => {
    if (lastSync) setProgress((p) => ({ ...p, solved: readSolvedLabs() }))
  }, [lastSync])

  // takes a value or an updater, because a running deployment advances its state on a timer
  const setConfig = useCallback(
    (next) =>
      setProgress((p) => {
        const value = typeof next === 'function' ? next(p.configs[labId] ?? labById.get(labId).start()) : next
        return { ...p, configs: { ...p.configs, [labId]: value } }
      }),
    [labId],
  )
  // points come from pl.lab.solved (store/lab-points.js), so a lab counts once; the celebration shows on the first solve only
  const markSolved = useCallback(() => {
    if (!readSolvedLabs()[labId]) noteSolve(`Lab solved: ${ALL.find((l) => l.id === labId)?.title ?? 'lab'}`)
    const solved = markLabSolved(labId)
    setProgress((p) => ({ ...p, solved }))
  }, [labId])

  // an on call drill: a random console lab from the failure groups, one not solved yet when there is one
  const [drill, setDrill] = useState(null) // { labId, startedAt }
  const [drills, setDrills] = useState(readDrills)
  function startDrill() {
    setMystery(null)
    const pool = PLATFORM_LABS.filter((l) => DRILL_GROUPS.includes(l.group) && l.id !== labId)
    const fresh = pool.filter((l) => !readSolvedLabs()[l.id])
    const from = fresh.length ? fresh : pool
    const picked = from[Math.floor(Math.random() * from.length)]
    if (!picked) return
    setDrill({ labId: picked.id, startedAt: Date.now() })
    setLabId(picked.id)
  }
  const openLab = (id) => {
    setDrill(null)
    setMystery(null)
    setLabId(id)
  }

  // a mystery incident: a random console lab from the chosen groups, shown masked until it is solved or revealed
  const [mystery, setMystery] = useState(null) // { labId, runId, end: null | 'solved' | 'revealed' }
  const [mysteryGroups, setMysteryGroups] = useState(() => readMysteryGroups(defaultMysteryGroups(GROUPS)).filter((g) => GROUPS.includes(g)))
  const chooseGroups = (groups) => {
    setMysteryGroups(groups)
    writeMysteryGroups(groups)
  }
  function startMystery() {
    const picked = pickMystery(PLATFORM_LABS, mysteryGroups, readSolvedLabs(), labId)
    if (!picked) return
    setDrill(null)
    setMystery({ labId: picked.id, runId: Date.now(), end: null })
    setLabId(picked.id)
  }
  const solving = mystery?.labId === labId ? mystery : null
  const revealed = useRef(false)
  revealed.current = Boolean(solving?.end)
  const masked = useMemo(() => (solving && lab ? maskLab(lab, () => revealed.current, solving.runId) : null), [lab, solving?.runId]) // eslint-disable-line react-hooks/exhaustive-deps
  // the how text stays hidden while the mystery is open; the saved setting comes back after
  useEffect(() => {
    if (!solving || solving.end) return undefined
    beginHideHowOverride(true)
    return endHideHowOverride
  }, [solving?.runId, solving?.end]) // eslint-disable-line react-hooks/exhaustive-deps
  // the record is written outside the state updater, which React may run twice
  const mysteryNow = useRef(null)
  mysteryNow.current = mystery
  const endMystery = useCallback((end) => {
    const m = mysteryNow.current
    if (!m || m.end) return
    recordMystery(m.labId, end)
    mysteryNow.current = { ...m, end }
    setMystery(mysteryNow.current)
  }, [])
  const onMysterySolved = useCallback(() => {
    markSolved()
    endMystery('solved')
  }, [markSolved, endMystery])
  useEffect(() => {
    if (!labId) setDrills(readDrills())
  }, [labId])
  const drilling = drill?.labId === labId ? drill : null

  // the home page shows one group at a time; it stays picked while a lab is open
  const [group, setGroup] = useState(() => SECTIONS.find(([, labs]) => labs.some((l) => !progress.solved[l.id]))?.[0] ?? SECTIONS[0][0])
  const [find, setFind] = useState('')
  const [hideSolved, setHideSolved] = useState(false)
  const pickGroup = (name) => {
    setGroup(name)
    setFind('')
  }

  function restart() {
    setProgress((p) => ({ ...p, configs: Object.fromEntries(Object.entries(p.configs).filter(([id]) => id !== labId)) }))
  }

  if (!lab) {
    const q = find.trim().toLowerCase()
    const doneIn = (labs) => labs.filter((l) => progress.solved[l.id]).length
    const keep = (l) => (!hideSolved || !progress.solved[l.id]) && (!q || `${l.title} ${l.scenario}`.toLowerCase().includes(q))
    // a search looks through every group; otherwise only the chosen group shows
    const shown = (q ? SECTIONS : SECTIONS.filter(([name]) => name === group)).map(([name, labs]) => [name, labs.filter(keep), labs]).filter(([, labs]) => !q || labs.length)
    return (
      <div className="lab-sections">
        <p className="muted small">
          {solvedCount} of {ALL.length} solved. The first {GROUPS.length} groups run in the Anypoint console and the CI/CD labs run on a GitHub Actions page, with steps that tick off as you work.
        </p>
        <div className="lab-home-top">
          <DrillPanel drills={drills} onStart={startDrill} onOpen={openLab} />
          <MysteryPanel groups={mysteryGroups} onGroups={chooseGroups} onStart={startMystery} />
        </div>
        <WeakTopics sections={SECTIONS} solved={progress.solved} onOpen={openLab} />
        <div className="lab-browse">
          <nav className="lab-browse-nav" aria-label="Lab groups">
            {SECTIONS.map(([name, labs]) => (
              <button type="button" key={name} aria-current={!q && name === group ? 'true' : undefined} className={!q && name === group ? 'on' : ''} onClick={() => pickGroup(name)}>
                <span>{name}</span>
                <small className={doneIn(labs) === labs.length ? 'done' : ''}>
                  {doneIn(labs)}/{labs.length}
                </small>
              </button>
            ))}
          </nav>
          <div className="lab-browse-main">
            <div className="lab-browse-bar">
              <select className="lab-browse-pick" aria-label="Lab group" value={group} onChange={(e) => pickGroup(e.target.value)}>
                {SECTIONS.map(([name, labs]) => (
                  <option key={name} value={name}>
                    {name} ({doneIn(labs)}/{labs.length})
                  </option>
                ))}
              </select>
              <input type="search" className="lab-browse-find" placeholder="Find a lab in every group" aria-label="Find a lab" value={find} onChange={(e) => setFind(e.target.value)} />
              <label className="small lab-browse-hide">
                <input type="checkbox" checked={hideSolved} onChange={(e) => setHideSolved(e.target.checked)} /> Hide solved
              </label>
            </div>
            {q && !shown.length && <p className="muted small">No lab matches "{find}".</p>}
            {shown.map(([name, labs, all]) => (
              <section key={name} aria-label={name}>
                <div className="lab-panel-head">
                  <h2>{name}</h2>
                  <span className="muted small">
                    {doneIn(all)} of {all.length} solved
                  </span>
                </div>
                {!labs.length && <p className="muted small">Every lab in this group is solved.</p>}
                <div className="lab-cards">
                  {labs.map((l) => (
                    <button type="button" key={l.id} className="lab-card" onClick={() => openLab(l.id)}>
                      <b>{l.title}</b>
                      <span className="muted small">{l.scenario}</span>
                      <span className="lab-card-foot small">
                        <span className="muted">{l.steps ? `${l.steps.length} steps, about ${l.minutes} min` : l.kind === 'runtime' ? 'Runtime Manager' : 'API Manager'}</span>
                        {progress.solved[l.id] && <span className="lab-badge lab-approved">solved</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const position = ALL.indexOf(lab)
  return (
    <div className="lab-open">
      <div className="lab-row-head">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => openLab(null)}>
          ← All labs
        </button>
        <span className="lab-grow" />
        {solving ? (
          <>
            {!solving.end && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => endMystery('revealed')}>
                Show which lab it was
              </button>
            )}
            <button type="button" className="btn btn-sm btn-ghost" onClick={startMystery}>
              Another mystery
            </button>
          </>
        ) : drilling ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={startDrill}>
            Another drill
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-sm btn-ghost" disabled={position === 0} onClick={() => openLab(ALL[position - 1].id)}>
              Previous lab
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={position === ALL.length - 1} onClick={() => openLab(ALL[position + 1].id)}>
              Next lab
            </button>
          </>
        )}
      </div>
      {solving && (
        <div className={`lab-mystery-bar small${solving.end ? ' ended' : ''}`} role="status">
          {solving.end ? (
            <>
              <b>{solving.end === 'solved' ? 'Solved. ' : ''}It was: {lab.title}</b> <span className="muted">({lab.group})</span>
            </>
          ) : (
            <>
              <b>Mystery incident.</b> The lab and its cause are hidden. Work from the scenario, the mail and the logs. The how text is hidden too. Open it on a step if you need it.
            </>
          )}
        </div>
      )}
      {pipelineIds.has(labId) ? (
        <PipelineScreen key={labId} guided={lab} solved={Boolean(progress.solved[labId])} onSolved={markSolved} />
      ) : platformIds.has(labId) ? (
        <Suspense fallback={<p className="muted">Loading the console…</p>}>
          <PlatformLab
            key={solving ? `mystery-${solving.runId}` : drilling ? `drill-${drilling.startedAt}` : labId}
            lab={masked ?? lab}
            solved={solving ? solving.end === 'solved' || (solving.end === 'revealed' && Boolean(progress.solved[labId])) : Boolean(progress.solved[labId])}
            onSolved={solving ? onMysterySolved : markSolved}
            drill={drilling}
            onNewDrill={startDrill}
          />
        </Suspense>
      ) : (
        <LabWorkspace
          key={labId}
          lab={lab}
          config={progress.configs[labId] ?? lab.start()}
          solved={Boolean(progress.solved[labId])}
          onChange={setConfig}
          onSolved={markSolved}
          onRestart={restart}
        />
      )}
      {progress.solved[labId] && (!solving || solving.end) && <PostIncident key={labId} lab={lab} />}
    </div>
  )
}

function LabWorkspace({ lab, config, solved, onChange, onSolved, onRestart }) {
  const [tab, setTab] = useState('policies')
  const [result, setResult] = useState(null)
  const [hints, setHints] = useState(0)
  const [showSolution, setShowSolution] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const isRuntime = lab.kind === 'runtime'

  const update = (patch) => {
    onChange({ ...config, ...patch })
    setResult(null)
  }

  const updateState = useCallback(
    (next) => {
      onChange(next)
      setResult(null)
    },
    [onChange],
  )

  function check() {
    const outcome = runCheck(lab, config)
    setResult(outcome)
    if (outcome.passed) onSolved()
  }

  function restart() {
    onRestart()
    setAttempt((a) => a + 1)
    setResult(null)
    setHints(0)
    setShowSolution(false)
  }

  return (
    <section className="lab-panel" aria-label={lab.title}>
      <div className="lab-panel-head">
        <h2>{lab.title}</h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={restart}>
          Restart this lab
        </button>
      </div>
      <p className="small">{lab.scenario}</p>
      <p className="small lab-goal">
        <b>Goal:</b> {lab.goal}
      </p>

      {isRuntime ? (
        <RuntimeWorkbench
          key={attempt}
          state={config}
          onChange={updateState}
          onReset={restart}
          resetLabel="Restart this lab"
          focus={lab.focus}
          startForm={() => formFor((config.apps.find((a) => a.name === lab.focus) ?? config.apps[0])?.config)}
        />
      ) : (
        <>
          <div className="lab-tabs" role="tablist">
            {[
              ['policies', `Policies (${config.policies.length + (config.automated?.length ?? 0)})`],
              ['apps', `Client Applications (${config.apps.length})`],
              ['tiers', `SLA Tiers (${config.tiers.length})`],
              ['nodes', `Nodes (${topologyOf(config).nodes})`],
            ].map(([key, label]) => (
              <button type="button" key={key} role="tab" aria-selected={tab === key} className={`lab-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'policies' && (
            <PoliciesTab
              policies={config.policies}
              automated={config.automated}
              onChange={(policies) => update({ policies })}
              onAutomatedChange={(automated) => update({ automated })}
            />
          )}
          {tab === 'apps' && <AppsTab apps={config.apps} tiers={config.tiers} onChange={(apps) => update({ apps })} />}
          {tab === 'tiers' && <TiersTab tiers={config.tiers} onChange={(tiers) => update({ tiers })} />}
          {tab === 'nodes' && <NodesTab config={config} onChange={(topology) => update({ topology })} />}
        </>
      )}

      <div className="lab-actions">
        <button type="button" className="btn btn-primary" onClick={check}>
          Check my work
        </button>
        {hints < lab.hints.length && (
          <button type="button" className="btn btn-ghost" onClick={() => setHints(hints + 1)}>
            Show a hint
          </button>
        )}
        {hints === lab.hints.length && !showSolution && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowSolution(true)}>
            Show the solution
          </button>
        )}
      </div>
      {hints > 0 && (
        <ul className="muted small">
          {lab.hints.slice(0, hints).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
      {showSolution && (
        <p className="small">
          <b>Solution:</b> {lab.solution}
        </p>
      )}
      {result && <CheckResult lab={lab} result={result} isRuntime={isRuntime} />}
      {!result && solved && <p className="muted small">You have solved this lab. Restart it to practise again.</p>}
    </section>
  )
}

function CheckResult({ lab, result, isRuntime }) {
  return (
    <div className="lab-result" aria-live="polite">
      <div className="lab-row-head">
        <span className={`lab-status ${result.passed ? 'lab-s2' : 'lab-s4'}`}>{result.passed ? 'Passed' : 'Not yet'}</span>
        <span className="lab-grow small">{isRuntime ? 'Every deployment was played to its end in the simulator.' : 'Real requests were sent through the simulator.'}</span>
      </div>
      <ul className="lab-checks small">
        {result.items.map((item) => (
          <li key={item.label} className={item.ok ? 'lab-pass' : 'lab-reject'}>
            <b>{item.ok ? 'Met' : 'Not met'}</b> {item.label}
            <span className="muted mono"> saw {item.seen}</span>
            {item.basis === 'assumed' && <Assumed />}
          </li>
        ))}
      </ul>
      {result.passed && (
        <p className="small">
          {lab.why}{' '}
          <a href={lab.docs} target="_blank" rel="noreferrer">
            {isRuntime ? 'Docs' : 'Policy docs'}
          </a>
        </p>
      )}
    </div>
  )
}
