// Odoo stores task descriptions and chatter messages as HTML produced by its
// own editor, which emits a narrow, predictable tag set. Orca's task surfaces
// speak markdown, so this module converts in both directions at the boundary.
import { marked } from 'marked'

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  ugrave: 'ù',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  rsquo: '’'
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
}

function escapeMarkdown(value: string): string {
  // Only the markers that would silently restructure the rendered output; a
  // full escape makes ordinary prose unreadable.
  return value.replace(/([\\`*_[\]])/g, '\\$1')
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)
  const raw = match?.[2] ?? match?.[3]
  return raw === undefined ? null : decodeEntities(raw)
}

function collapseBlankLines(value: string): string {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type ListFrame = { ordered: boolean; index: number }

/**
 * Converts an Odoo chatter/description HTML body to markdown.
 *
 * Scans the tag stream rather than parsing a full DOM: the input is
 * editor-generated and well-formed, and the main process has no DOM.
 */
export function chatterHtmlToMarkdown(html: string): string {
  if (!html) {
    return ''
  }

  // Odoo never emits these, so their presence means untrusted paste-through.
  const source = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')

  const out: string[] = []
  const listStack: ListFrame[] = []
  let pendingLink: string | null = null
  let inPre = false
  let cursor = 0

  const tagPattern = /<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi
  let match: RegExpExecArray | null

  const pushText = (raw: string): void => {
    if (!raw) {
      return
    }
    if (inPre) {
      out.push(decodeEntities(raw))
      return
    }
    // Outside <pre>, HTML whitespace is not significant.
    const text = decodeEntities(raw).replace(/\s+/g, ' ')
    if (text.trim() === '' && (out.length === 0 || /\s$/.test(out.at(-1) ?? ''))) {
      return
    }
    out.push(escapeMarkdown(text))
  }

  while ((match = tagPattern.exec(source)) !== null) {
    pushText(source.slice(cursor, match.index))
    cursor = tagPattern.lastIndex

    const [full, rawName] = match
    const name = rawName.toLowerCase()
    const closing = full.startsWith('</')

    switch (name) {
      case 'br':
        out.push('\n')
        break
      case 'p':
      case 'div':
      case 'section':
        out.push('\n\n')
        break
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        out.push(closing ? '\n\n' : `\n\n${'#'.repeat(Number(name[1]))} `)
        break
      case 'strong':
      case 'b':
        out.push('**')
        break
      case 'em':
      case 'i':
        out.push('*')
        break
      case 'code':
        if (!inPre) {
          out.push('`')
        }
        break
      case 'pre':
        inPre = !closing
        out.push(closing ? '\n```\n\n' : '\n\n```\n')
        break
      case 'blockquote':
        // Prefix applied on the assembled text below.
        out.push(closing ? '\n\n' : '\n\n> ')
        break
      case 'ul':
      case 'ol':
        if (closing) {
          listStack.pop()
        } else {
          listStack.push({ ordered: name === 'ol', index: 0 })
        }
        out.push('\n')
        break
      case 'li': {
        if (closing) {
          break
        }
        const frame = listStack.at(-1)
        const indent = '  '.repeat(Math.max(0, listStack.length - 1))
        if (frame?.ordered) {
          frame.index += 1
          out.push(`\n${indent}${frame.index}. `)
        } else {
          out.push(`\n${indent}- `)
        }
        break
      }
      case 'a':
        if (closing) {
          out.push(pendingLink ? `](${pendingLink})` : '')
          pendingLink = null
        } else {
          const href = attribute(full, 'href')
          pendingLink = href
          if (href) {
            out.push('[')
          }
        }
        break
      case 'img': {
        const src = attribute(full, 'src')
        const alt = attribute(full, 'alt') ?? ''
        if (src) {
          out.push(`![${alt}](${src})`)
        }
        break
      }
      default:
        break
    }
  }
  pushText(source.slice(cursor))

  return collapseBlankLines(out.join(''))
}

/**
 * Converts markdown written in Orca to the HTML Odoo's chatter stores.
 *
 * Why: RPC callers cannot hand Odoo a `Markup` object, so bodies must travel as
 * HTML strings alongside `body_is_html: true`. Odoo sanitizes on write.
 */
export function markdownToChatterHtml(markdown: string): string {
  if (!markdown.trim()) {
    return ''
  }
  return marked.parse(markdown, { async: false, gfm: true, breaks: true }).trim()
}
