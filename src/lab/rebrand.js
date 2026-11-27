// The fictional retailer of the Platform Lab was called Harbor and is now Brightmart. A console, lab or pipeline
// saved before the rename still holds the old names (app names, hosts, mail addresses), so its saved text is renamed
// the same way the source was before it is read. Import free.
const RULES = [
  [/Harborview/g, '\u0000HV\u0000'], // a town name, kept
  [/Harbor Foods/g, 'Brightmart'],
  [/Harbor Deli/g, 'Maple Deli'],
  [/harbordeli/g, 'mapledeli'],
  [/Harbor Bistro/g, 'Maple Bistro'],
  [/HARBORWEB/g, 'BRIGHTWEB'],
  [/HARBOR_DEV/g, 'BRIGHT_DEV'],
  [/Harbor/g, 'Brightmart'],
  [/harbor/g, 'brightmart'],
  [/HARBOR/g, 'BRIGHTMART'],
  [/\u0000HV\u0000/g, 'Harborview'],
]
const OLD = /harbor(?!view)/i

export function rebrandText(text) {
  if (typeof text !== 'string' || !OLD.test(text)) return text
  return RULES.reduce((t, [re, to]) => t.replace(re, to), text)
}
