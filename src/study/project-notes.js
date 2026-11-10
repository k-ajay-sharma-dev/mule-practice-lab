// Turns a project's Markdown notes into what the My Projects page shows: sections with a contents list,
// and the practice questions written in the notes. Also prepares an architecture page to run in a sandbox.

const FENCE = /^\s*(```|~~~)/

// "## Heading" lines start a section; text before the first one is the intro. Headings inside code are ignored.
export function splitSections(body) {
  const intro = []
  const sections = []
  let inCode = false
  for (const line of String(body ?? '').split(/\r?\n/)) {
    if (FENCE.test(line)) inCode = !inCode
    const heading = !inCode && line.match(/^##\s+(.+?)\s*#*\s*$/)
    if (heading) sections.push({ title: heading[1].replace(/\*\*|`/g, ''), lines: [] })
    else (sections.length ? sections[sections.length - 1].lines : intro).push(line)
  }
  return {
    intro: intro.join('\n').trim(),
    sections: sections.map((s, i) => ({ id: `section-${i + 1}`, title: s.title, text: s.lines.join('\n').trim() })),
  }
}

// A paragraph that starts with a bold question, "**Why not API-led?** Because ...", is a practice question.
// Paragraphs after it belong to the answer until the next question, heading or code block.
export function questionsIn(body) {
  const paragraphs = String(body ?? '').replace(/\r\n/g, '\n').split(/\n\s*\n/)
  const found = []
  let current = null
  for (const raw of paragraphs) {
    const p = raw.trim()
    const ask = p.match(/^\*\*([^*\n]+\?)\*\*[ \t]*([\s\S]*)$/)
    if (ask) {
      current = { q: ask[1].trim(), a: [ask[2].trim()].filter(Boolean) }
      found.push(current)
    } else if (!current || !p || /^(#|```|~~~|---)/.test(p)) {
      current = null
    } else {
      current.a.push(p)
    }
  }
  return found.filter((x) => x.a.length).map((x) => ({ q: x.q, a: x.a.join('\n\n') }))
}

// The page runs in a sandboxed frame with no access to this site (no same-origin), and this policy adds:
// no network calls, no forms, no nested frames. Scripts, styles, images and fonts may come from https CDNs,
// so diagrams drawn by libraries such as Mermaid still work. blob: and data: are allowed because bundled pages
// unpack their own scripts and fonts into them; both stay inside the frame and never reach the network.
export const ARCH_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https: blob: data:",
  "style-src 'unsafe-inline' https: blob: data:",
  'img-src data: blob: https:',
  'font-src data: blob: https:',
  'media-src data: blob:',
  'worker-src blob:',
  'connect-src blob: data:',
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

// Tells the site how tall the page is, so the frame grows to fit instead of scrolling inside. It watches the
// document itself, because bundled pages replace the whole <html> element once they have unpacked.
const HEIGHT_REPORTER = `<script>(function(){var q=0,w=null,ro=window.ResizeObserver?new ResizeObserver(f):null;function s(){q=0;var d=document.documentElement;if(d)parent.postMessage({plArchHeight:Math.ceil(Math.max(d.scrollHeight,document.body?document.body.scrollHeight:0))},'*')}function f(){if(!q)q=requestAnimationFrame(s)}function watch(){var d=document.documentElement;if(ro&&d&&d!==w){ro.disconnect();ro.observe(d);if(document.body)ro.observe(document.body);w=d}}new MutationObserver(function(){watch();f()}).observe(document,{childList:true,subtree:true,attributes:true});addEventListener('load',function(){watch();f()});addEventListener('resize',f);watch();setTimeout(s,50);setTimeout(s,1000);setTimeout(s,3000)})()</script>`

export function architectureDoc(html, { fitHeight = true } = {}) {
  const head = `<meta http-equiv="Content-Security-Policy" content="${ARCH_POLICY}"><meta name="referrer" content="no-referrer">${fitHeight ? HEIGHT_REPORTER : ''}`
  const text = String(html ?? '')
  // the policy must come before anything the page loads, so it goes first inside <head>
  // "<head" alone would also match "<header>", so the tag name must end there
  const headTag = /<head(\s[^>]*)?>/i
  const htmlTag = /<html(\s[^>]*)?>/i
  if (headTag.test(text)) return text.replace(headTag, (m) => m + head)
  if (htmlTag.test(text)) return text.replace(htmlTag, (m) => `${m}<head>${head}</head>`)
  return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${text}</body></html>`
}
