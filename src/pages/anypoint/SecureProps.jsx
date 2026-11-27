// The secure properties tool: a form that runs secure-properties-tool.jar in string or file mode, with the command line
// it equals. The project files of an app can be loaded, changed and saved back. The crypto is lab-made, see
// lab/platform-access.js.
import { useEffect, useState } from 'react'
import { mark } from '../../lab/platform.js'
import { ALGORITHMS, keyError, MODES, saveSecureFile, secureApps, secureFile, secureString, toolCommand } from '../../lab/platform-access.js'
import { Btn, Copy, Field, Input, Note, Radios, Select } from './parts.jsx'

const SAMPLE = '# a sample file\ndb:\n  password: "change-me"\n'

export default function SecureProps({ state, update }) {
  const [kind, setKind] = useState('string')
  const [op, setOp] = useState('encrypt')
  const [algorithm, setAlgorithm] = useState('AES')
  const [mode, setMode] = useState('CBC')
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [value, setValue] = useState('')
  const [text, setText] = useState(SAMPLE)
  const [fileName, setFileName] = useState('sample.yaml')
  const [source, setSource] = useState('')
  const [pick, setPick] = useState('')
  const [loaded, setLoaded] = useState(null)
  const [out, setOut] = useState(null)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    update((s) => mark(s, 'secure-props'))
  }, [update])

  const apps = secureApps(state)
  const sources = apps.map((a) => [`${a.name}|${a.env}`, `${a.name} (${a.env})`])
  const chosen = apps.find((a) => `${a.name}|${a.env}` === source)
  const files = Object.keys(chosen?.secureFiles ?? {})
  const command = toolCommand({ kind, op, algorithm, mode, key: key && !showKey ? '*'.repeat(key.length) : key, value, file: fileName })
  const keyBad = key ? keyError(algorithm, key) : null

  const load = () => {
    if (!chosen || !pick) return
    setText(chosen.secureFiles[pick])
    setFileName(pick)
    setLoaded({ name: chosen.name, env: chosen.env, file: pick })
    setOut(null)
    setSaved('')
  }
  const run = () => {
    const opts = { algorithm, mode, key }
    const r = kind === 'string' ? secureString(op, { ...opts, value }) : secureFile(op, { ...opts, text })
    setOut({ ...r, command })
    setSaved('')
  }
  const save = () => {
    update((s) => saveSecureFile(s, loaded.name, loaded.env, loaded.file, out.value))
    setText(out.value)
    setSaved(`Saved to ${loaded.file} in the project of ${loaded.name} (${loaded.env}). The next deploy of the app uses it.`)
  }

  return (
    <main className="pc-main sp-main">
      <div className="pc-title">
        <h2>Secure properties tool</h2>
        <span className="pc-dim">secure-properties-tool.jar</span>
      </div>
      <p className="pc-dim">Encrypts and decrypts values for the Mule secure configuration properties module. Put an encrypted value in the file as ![...] and read it in the app as {'${secure::name}'}.</p>
      <div className="sp-grid">
        <section className="sp-form">
          <div className="pc-field">
            <span className="pc-label">Mode</span>
            <Radios
              name="sp-kind"
              value={kind}
              onChange={(v) => (setKind(v), setOut(null))}
              options={[
                ['string', 'String', 'One value'],
                ['file', 'File', 'Every value of a .yaml or .properties file'],
              ]}
            />
          </div>
          <div className="pc-field">
            <span className="pc-label">Operation</span>
            <Radios
              name="sp-op"
              value={op}
              onChange={(v) => (setOp(v), setOut(null))}
              options={[
                ['encrypt', 'Encrypt'],
                ['decrypt', 'Decrypt'],
              ]}
            />
          </div>
          <div className="sp-row">
            <Field label="Algorithm">
              <Select value={algorithm} onChange={setAlgorithm} options={ALGORITHMS} />
            </Field>
            <Field label="Cipher mode">
              <Select value={mode} onChange={setMode} options={MODES} />
            </Field>
          </div>
          <Field label="Key" hint={keyBad ?? (algorithm === 'AES' ? 'AES takes a key of 16, 24 or 32 characters.' : 'Blowfish takes a key of 4 to 56 characters.')}>
            <span className="sp-key">
              <Input type={showKey ? 'text' : 'password'} value={key} onChange={setKey} autoComplete="off" aria-label="Key" />
              <Btn onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'}</Btn>
            </span>
          </Field>
          {kind === 'string' ? (
            <Field label="Value" wide>
              <Input value={value} onChange={setValue} autoComplete="off" placeholder={op === 'encrypt' ? 'The plain value' : '![...] or the base64 text'} />
            </Field>
          ) : (
            <>
              <div className="sp-row">
                <Field label="Project file">
                  <Select value={source} onChange={(v) => (setSource(v), setPick(''))} placeholder={sources.length ? 'Choose an app' : 'No app has secure files'} options={sources} />
                </Field>
                <Field label="File">
                  <Select value={pick} onChange={setPick} placeholder="Choose a file" options={files} disabled={!files.length} />
                </Field>
                <Btn disabled={!pick} onClick={load}>
                  Load
                </Btn>
              </div>
              <Field label="File name">
                <Input value={fileName} onChange={(v) => (setFileName(v), setLoaded(null))} />
              </Field>
              <Field label={`Contents of ${fileName || 'the file'}`} wide>
                <textarea className="pc-input pc-mono" rows={9} value={text} onChange={(e) => setText(e.target.value)} aria-label="File contents" spellCheck="false" />
              </Field>
              {loaded && (
                <p className="pc-dim">
                  Loaded from the project of {loaded.name} ({loaded.env}).
                </p>
              )}
            </>
          )}
          <Btn kind="primary" onClick={run}>
            Run
          </Btn>
        </section>
        <section className="sp-term" aria-label="Terminal">
          <div className="sp-bar">
            <b>Command line</b>
            <Copy text={toolCommand({ kind, op, algorithm, mode, key, value, file: fileName })} />
          </div>
          <pre className="sp-cmd">$ {command}</pre>
          {out && (
            <pre className={`sp-out${out.ok ? '' : ' sp-err'}`} role="status">
              {out.ok ? out.value : `Exception in thread "main" ${out.error}`}
            </pre>
          )}
          {out?.ok && kind === 'string' && <Copy text={out.value} />}
          {out?.ok && kind === 'file' && loaded && (
            <Btn kind="primary" onClick={save}>
              Save output to {loaded.file}
            </Btn>
          )}
          {saved && <p className="sp-saved">{saved}</p>}
        </section>
      </div>
      <h3>In the Mule app</h3>
      <pre className="sp-code">{`<secure-properties:config name="Secure_Props" file="\${mule.env}.yaml" key="\${mule.key}">
  <secure-properties:encrypt algorithm="${algorithm}" mode="${mode}"/>
</secure-properties:config>

<db:my-sql-connection password="\${secure::db.password}" ... />`}</pre>
      <p className="pc-dim">Encrypt each environment file with the key of that environment. Set mule.env and mule.key at deploy time in Runtime Manager, Settings, Properties, and press Protect on mule.key so its value is hidden. Never commit the key to the repository.</p>
      <Note>Lab-made: this tool uses a keyed transform that behaves like the real one, with the same errors, but it is not AES or Blowfish and protects nothing. In the lab, Save output writes into the project of the app and its next deploy uses the file.</Note>
    </main>
  )
}
