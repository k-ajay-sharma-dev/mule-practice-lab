// Line icons for the Flow Designer's components, on a 24 by 24 grid. A component takes the first rule its type matches,
// so a new operation of a connector gets the icon of its verb (read, write, delete) without being listed here.
const folder = 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2.2 2.5h8.2A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z'
const cylinder = 'M4.5 6c0-1.7 3.4-3 7.5-3s7.5 1.3 7.5 3-3.4 3-7.5 3-7.5-1.3-7.5-3zM4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6'
const cloud = 'M7 18.5a4.2 4.2 0 0 1-.6-8.4 5.8 5.8 0 0 1 11.2-.7 4.6 4.6 0 0 1-.4 9.1z'
const globe = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z'
const envelope = 'M3.5 5h17A1.5 1.5 0 0 1 22 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 17.5v-11A1.5 1.5 0 0 1 3.5 5zM2.5 6.5 12 13l9.5-6.5'
const queue = 'M3 7h18v10H3zM8 7v10M13 7v10M18 7v10'
const waves = 'M3 7c3-3 6 3 9 0s6 3 9 0M3 12c3-3 6 3 9 0s6 3 9 0M3 17c3-3 6 3 9 0s6 3 9 0'
const trash = 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13'
const check = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.2l2.8 2.8L16 9.5'
const download = 'M12 4v11M7 10.5l5 5 5-5M4 20h16'
const upload = 'M12 16V5M7 9.5l5-5 5 5M4 20h16'
const list = 'M8.5 6H21M8.5 12H21M8.5 18H21M4 6h.01M4 12h.01M4 18h.01'
const loop = 'M17 2.5l4 4-4 4M3 11.5V10a3.5 3.5 0 0 1 3.5-3.5H21M7 21.5l-4-4 4-4M21 12.5V14a3.5 3.5 0 0 1-3.5 3.5H3'
const send = 'M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z'

const RULES = [
  // sources
  [/^scheduler$/, 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.2l3.5 2'],
  [/^http-listener$/, 'M3 12h11M10 8l4 4-4 4M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13'],
  [/^(file|sftp|ftp)-listener$/, `${folder}M12 10.5v5M9.8 13.3l2.2 2.2 2.2-2.2`],
  [/^email-(listener|send)/, envelope],
  [/^(mq-subscriber|jms-listener|vm-listener|sqs-receive)$/, queue],
  [/^kafka-(listener|batch-listener|publish|bulk-publish|consume)$/, waves],
  [/^db-/, cylinder],
  [/^sap-/, 'M3 6h18l-9 12H3zM6.5 13.5c3 1 4-3 1-3s-2-3 1-2'],
  [/^wd-/, 'M4 6l3.5 12L12 8l4.5 10L20 6'],
  [/^sf-/, cloud],
  // core
  [/^logger$/, 'M5 3.5h10l4 4V20.5H5zM8.5 11h7M8.5 14.5h7M8.5 18h4'],
  [/^transform$/, 'M3 7h9l-3-3M12 7l-3 3M21 17h-9l3-3M12 17l3 3'],
  [/^set-payload$/, 'M8 4H6.5A1.5 1.5 0 0 0 5 5.5V10l-2 2 2 2v4.5A1.5 1.5 0 0 0 6.5 20H8M16 4h1.5A1.5 1.5 0 0 1 19 5.5V10l2 2-2 2v4.5a1.5 1.5 0 0 1-1.5 1.5H16M10 12h4'],
  [/^set-variable$/, 'M4 8l7 8M11 8l-7 8M15 10.5h6M15 14h6'],
  [/^flow-ref$/, 'M4 5v6a3 3 0 0 0 3 3h12M14.5 9.5 19 14l-4.5 4.5'],
  [/^apikit-router$/, 'M12 3v18M12 5.5h6.5l2 2-2 2H12M12 12H5.5l-2 2 2 2H12'],
  [/^raise-error$/, 'M12 3.5 21.5 20h-19zM12 10v4.5M12 17.2h.01'],
  [/^validation$/, 'M4.5 4.5h15v15h-15zM8 12.2l2.8 2.8L16 9.5'],
  [/^idempotent$/, 'M3.5 5h17l-6.5 8v6.5l-4-2V13z'],
  [/^os-/, 'M3.5 4h17v5h-17zM5 9v11h14V9M9.5 13h5'],
  [/^parse-template$/, 'M5 3.5h14v17H5zM5 8.5h14M9 12.5h6M9 16h4'],
  // routers and scopes
  [/^choice$/, 'M12 3l5 5-5 5-5-5zM7 8H4v12M17 8h3v12M12 13v7'],
  [/^scatter-gather$/, 'M3 12h5M8 12c4 0 3-7 7-7h6M8 12h13M8 12c4 0 3 7 7 7h6'],
  [/^first-successful$/, 'M4 6l1.5 1.5L8 5M4 12.5 5.5 14 8 11.5M12 6.5h9M12 12.5h9M12 18.5h9M4 18.5h4'],
  [/^round-robin$/, 'M20 11a8 8 0 0 0-14-4.5L3.5 9M3.5 4v5h5M4 13a8 8 0 0 0 14 4.5l2.5-2.5M20.5 20v-5h-5'],
  [/^foreach$/, loop],
  [/^parallel-foreach$/, 'M4 5.5h13M13.5 2.5l3.5 3-3.5 3M4 12h16M16.5 9l3.5 3-3.5 3M4 18.5h13M13.5 15.5l3.5 3-3.5 3'],
  [/^try$/, 'M12 2.5 20 5.5v6c0 4.8-3.2 8.3-8 10-4.8-1.7-8-5.2-8-10v-6z'],
  [/^until-successful$/, 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5M3.5 3.5v5h5M9 12.2l2.3 2.3L15.5 10'],
  [/^async$/, 'M4 12h6M10 12c4 0 3-6 7-6h4M18 3l3 3-3 3M10 12c4 0 3 6 7 6h1'],
  [/^cache$/, 'M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z'],
  [/^batch-job$/, 'M12 3 20.5 7.5 12 12 3.5 7.5zM3.5 12 12 16.5 20.5 12M3.5 16.5 12 21l8.5-4.5'],
  [/^batch-aggregator$/, 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  // connectors
  [/^http-request$/, globe],
  [/^wsc-/, 'M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4l-3 16'],
  [/^json-/, 'M8 4H6.5A1.5 1.5 0 0 0 5 5.5V10l-2 2 2 2v4.5A1.5 1.5 0 0 0 6.5 20H8M16 4h1.5A1.5 1.5 0 0 1 19 5.5V10l2 2-2 2v4.5a1.5 1.5 0 0 1-1.5 1.5H16'],
  [/^xml-/, 'M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5'],
  // errors
  [/^on-error-propagate$/, 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5v-9M8.5 11 12 7.5l3.5 3.5'],
  [/^on-error-continue$/, 'M4 5l9 7-9 7zM19 5v14'],
  // by verb
  [/delete|abort/, trash],
  [/list|get-job|retrieve/, list],
  [/rename/, 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4'],
  [/copy/, 'M9 9h11v11H9zM5 15H4V4h11v1'],
  [/create-directory/, `${folder}M12 11v5M9.5 13.5h5`],
  [/move|seek/, 'M4 12h15M13 6l6 6-6 6'],
  [/mark-read|-ack$|commit/, check],
  [/-nack$/, 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6'],
  [/recover-session/, 'M20 11a8 8 0 0 0-14-4.5L3.5 9M3.5 4v5h5M4 13a8 8 0 0 0 14 4.5l2.5-2.5M20.5 20v-5h-5'],
  [/publish-consume/, 'M7 4L3.5 7.5 7 11M3.5 7.5H20M17 13l3.5 3.5L17 20M20.5 16.5H4'],
  [/publish|send/, send],
  [/consume/, 'M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2.5h4l1-2.5h5'],
  [/read|get|download/, download],
  [/write|put|upload/, upload],
]
const OTHER = 'M12 2.5 20.2 7.2v9.6L12 21.5 3.8 16.8V7.2z'
const FLOW = 'M5 4h6v5H5zM13 15h6v5h-6zM8 9v5a3 3 0 0 0 3 3h2'

const paths = new Map()
function pathFor(type) {
  if (!paths.has(type)) paths.set(type, type === 'flow' ? FLOW : (RULES.find(([re]) => re.test(type))?.[1] ?? OTHER))
  return paths.get(type)
}

export default function FlowIcon({ type }) {
  return (
    <span className="node-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={pathFor(type)} />
      </svg>
    </span>
  )
}
