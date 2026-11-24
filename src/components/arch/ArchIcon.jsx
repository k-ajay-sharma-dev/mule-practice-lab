// Line icons for the Architecture Designer's components, one per type in src/arch/catalog.js, all on a 24 by 24 grid.
// The three API layers share a hexagon with the layer's letter.
const hexagon = 'M12 2.5 20.2 7.2v9.6L12 21.5 3.8 16.8V7.2z'
const cylinder = 'M4.5 6c0-1.7 3.4-3 7.5-3s7.5 1.3 7.5 3-3.4 3-7.5 3-7.5-1.3-7.5-3zM4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6'
const cloud = 'M7 18.5a4.2 4.2 0 0 1-.6-8.4 5.8 5.8 0 0 1 11.2-.7 4.6 4.6 0 0 1-.4 9.1z'
const folder = 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2.2 2.5h8.2A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z'

const PATHS = {
  // consumers
  'mobile-app': 'M8.5 2.5h7A1.5 1.5 0 0 1 17 4v16a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 20V4a1.5 1.5 0 0 1 1.5-1.5zM11 18.5h2',
  'web-app': 'M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM12 16v4M8 20h8',
  partner: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  'internal-app': 'M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21M3 21h18M9 7.5h1.5M13.5 7.5H15M9 11.5h1.5M13.5 11.5H15M10 21v-5h4v5',
  chatbot: 'M4.5 4h15A1.5 1.5 0 0 1 21 5.5v10a1.5 1.5 0 0 1-1.5 1.5H11l-5 4v-4H4.5A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4zM8 10.5h.01M12 10.5h.01M16 10.5h.01',
  device: 'M6.5 3h11A1.5 1.5 0 0 1 19 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 13.5v-9A1.5 1.5 0 0 1 6.5 3zM12 15v6M8 21h8M9 7h6M9 10.5h3',
  // edge
  'api-gateway': 'M12 2.5 20 5.5v6c0 4.8-3.2 8.3-8 10-4.8-1.7-8-5.2-8-10v-6zM8.5 12l2.5 2.5 4.5-5',
  'identity-provider': 'M8 19.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM11.3 11.8 20 3.5M16.5 7l2.8 2.8M14 9.3l2 2',
  'load-balancer': 'M12 3v5M12 8H5.5v7M12 8h6.5v7M12 8v7M3.5 15h4v5h-4zM10 15h4v5h-4zM16.5 15h4v5h-4z',
  // jobs
  'batch-job': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.2l3.5 2',
  // messaging
  queue: 'M3 7h18v10H3zM8 7v10M13 7v10M18 7v10',
  topic: 'M5.5 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 12h8.5M7.6 10.6 16.8 6M7.6 13.4 16.8 18',
  'event-stream': 'M3 7c3-3 6 3 9 0s6 3 9 0M3 12c3-3 6 3 9 0s6 3 9 0M3 17c3-3 6 3 9 0s6 3 9 0',
  dlq: 'M12 3.5 21.5 20h-19zM12 10v4.5M12 17.2h.01',
  'cloud-queue': `${cloud}M9.5 14.5v-2.5M12 14.5v-2.5M14.5 14.5v-2.5`,
  // backends and data
  erp: 'M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z',
  crm: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  wms: 'M3 21V8.5L12 3l9 5.5V21M7 21v-9h10v9M7 16.5h10',
  tms: 'M2.5 6H14v10.5H2.5zM14 9.5h4l3.5 3.5v3.5H14M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  pos: 'M4 9.5 5.5 4h13L20 9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5 12.5V20.5h14v-8M10 20.5V16h4v4.5',
  database: `${cylinder}M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3`,
  'oracle-db': `${cylinder}M9 15h6`,
  'sql-server': `${cylinder}M9.5 13l2 2-2 2M13.5 17H15`,
  'sftp-server': `${folder}M9.5 16v-4.5M7.8 13.2l1.7-1.7 1.7 1.7M14.5 11.5V16M12.8 14.3l1.7 1.7 1.7-1.7`,
  'azure-blob': 'M12 3 20.5 7.5 12 12 3.5 7.5zM3.5 12 12 16.5 20.5 12M3.5 16.5 12 21l8.5-4.5',
  's3-bucket': 'M4 5.5c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5S16.4 8 12 8 4 6.9 4 5.5zM4 5.5 6 19c.2 1.1 2.8 2 6 2s5.8-.9 6-2l2-13.5',
  legacy: 'M4 3.5h16v7H4zM4 13.5h16v7H4zM7.5 7h.01M7.5 17h.01M11 7h6M11 17h6',
  saas: 'M4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-13A1.5 1.5 0 0 1 4.5 4zM3 8.5h18M6 6.3h.01M8.5 6.3h.01',
  payment: 'M4 5h16a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 4 5zM2.5 9.5h19M6 15h4',
  'external-api': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z',
  notification: 'M3.5 5h17A1.5 1.5 0 0 1 22 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 17.5v-11A1.5 1.5 0 0 1 3.5 5zM2.5 6.5 12 13l9.5-6.5',
  cache: 'M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z',
  'file-store': folder,
  'data-warehouse': 'M4 20.5h16M6.5 20.5V12M12 20.5V4M17.5 20.5V8.5',
  monitoring: 'M2.5 12H7l2.5-7 5 14 2.5-7h4.5',
}

const LETTERS = { 'experience-api': 'E', 'process-api': 'P', 'system-api': 'S' }

export default function ArchIcon({ type }) {
  const letter = LETTERS[type]
  return (
    <span className="arch-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={letter ? hexagon : (PATHS[type] ?? hexagon)} />
        {letter && (
          <text x="12" y="12.2" textAnchor="middle" dominantBaseline="central" fontSize="10.5" fontWeight="700" fill="currentColor" stroke="none">
            {letter}
          </text>
        )}
      </svg>
    </span>
  )
}
