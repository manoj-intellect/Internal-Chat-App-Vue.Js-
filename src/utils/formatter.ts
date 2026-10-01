/**
 * Lightweight message markup -> safe AST.
 *
 * Supported syntax (deliberately small):
 *   **bold**   *italic*   __underline__   `code`   ```code block```
 *   - bullet   1. numbered   > quote   [label](https://url)   bare https://urls
 *   {{secret:123}}  -> secure-content placeholder (never contains the secret)
 *
 * SECURITY: this module never produces HTML strings. The AST is rendered by
 * FormattedMessage.ts through Vue render functions, so all text is emitted as
 * text nodes (auto-escaped) and only whitelisted elements/attributes exist.
 * Link targets are validated by `safeUrl` (http/https/mailto only).
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'underline'; children: InlineNode[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: InlineNode[] }
  | { type: 'secret'; id: number }

export type BlockNode =
  | { type: 'paragraph'; lines: InlineNode[][] }
  | { type: 'codeblock'; value: string }
  | { type: 'quote'; lines: InlineNode[][] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }

const MAX_DEPTH = 4
const MAX_INPUT = 20_000

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Returns a normalised URL if it is safe to use as a link target, else null. */
export function safeUrl(raw: string): string | null {
  const candidate = raw.trim()
  // Reject whitespace/control characters and protocol-relative URLs outright.
  if (candidate === '' || /[\s\u0000-\u001f\u007f]/.test(candidate) || candidate.startsWith('//')) {
    return null
  }
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return null
  }
  if (url.protocol !== 'mailto:' && !url.hostname) {
    return null
  }
  return url.href
}

interface InlineRule {
  pattern: RegExp
  build: (m: RegExpExecArray, depth: number) => InlineNode | null
}

const INLINE_RULES: InlineRule[] = [
  { pattern: /`([^`\n]+)`/y, build: (m) => ({ type: 'code', value: m[1] }) },
  { pattern: /\{\{secret:(\d{1,18})\}\}/y, build: (m) => ({ type: 'secret', id: Number(m[1]) }) },
  {
    pattern: /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/y,
    build: (m, depth) => {
      const href = safeUrl(m[2])
      // Unsafe target: keep the whole thing as inert text.
      return href ? { type: 'link', href, children: parseInline(m[1], depth + 1, false) } : null
    },
  },
  { pattern: /\*\*(?=\S)([\s\S]*?\S)\*\*/y, build: (m, d) => ({ type: 'bold', children: parseInline(m[1], d + 1) }) },
  { pattern: /__(?=\S)([\s\S]*?\S)__/y, build: (m, d) => ({ type: 'underline', children: parseInline(m[1], d + 1) }) },
  { pattern: /\*(?=[^\s*])([^*\n]*?[^\s*])\*/y, build: (m, d) => ({ type: 'italic', children: parseInline(m[1], d + 1) }) },
  {
    pattern: /(?:https?:\/\/)[^\s<>()]+[^\s<>().,;:!?'"]/y,
    build: (m) => {
      const href = safeUrl(m[0])
      return href ? { type: 'link', href, children: [{ type: 'text', value: m[0] }] } : null
    },
  },
]

const TRIGGERS = new Set(['`', '{', '[', '*', '_', 'h'])

export function parseInline(text: string, depth = 0, allowLinks = true): InlineNode[] {
  if (depth > MAX_DEPTH) {
    return [{ type: 'text', value: text }]
  }

  const nodes: InlineNode[] = []
  let buffer = ''
  let i = 0

  const flush = () => {
    if (buffer) {
      nodes.push({ type: 'text', value: buffer })
      buffer = ''
    }
  }

  outer: while (i < text.length) {
    if (TRIGGERS.has(text[i])) {
      for (const rule of INLINE_RULES) {
        rule.pattern.lastIndex = i
        const match = rule.pattern.exec(text)
        if (!match) continue
        const node = rule.build(match, depth)
        if (!node) continue
        if (node.type === 'link' && !allowLinks) continue
        flush()
        nodes.push(node)
        i += match[0].length
        continue outer
      }
    }
    buffer += text[i]
    i++
  }

  flush()
  return nodes
}

const BULLET = /^\s*[-*]\s+(.*)$/
const ORDERED = /^\s*\d{1,3}[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const FENCE = /^\s*```/

export function parseMessage(input: string | null | undefined): BlockNode[] {
  const text = (input ?? '').slice(0, MAX_INPUT).replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const blocks: BlockNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (FENCE.test(line)) {
      const body: string[] = []
      const firstRest = line.replace(FENCE, '')
      // Single-line fence: ```code```
      if (firstRest.endsWith('```') && firstRest.length > 3) {
        blocks.push({ type: 'codeblock', value: firstRest.slice(0, -3) })
        i++
        continue
      }
      if (firstRest.trim()) body.push(firstRest)
      i++
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      i++ // closing fence (or end of input)
      blocks.push({ type: 'codeblock', value: body.join('\n') })
      continue
    }

    if (QUOTE.test(line)) {
      const quoted: InlineNode[][] = []
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(parseInline(QUOTE.exec(lines[i])![1]))
        i++
      }
      blocks.push({ type: 'quote', lines: quoted })
      continue
    }

    const listMatch = BULLET.test(line) ? BULLET : ORDERED.test(line) ? ORDERED : null
    if (listMatch) {
      const items: InlineNode[][] = []
      while (i < lines.length && listMatch.test(lines[i])) {
        items.push(parseInline(listMatch.exec(lines[i])![1]))
        i++
      }
      blocks.push({ type: 'list', ordered: listMatch === ORDERED, items })
      continue
    }

    // Paragraph: consecutive plain lines (blank lines separate paragraphs).
    const paragraph: InlineNode[][] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !FENCE.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i])
    ) {
      paragraph.push(parseInline(lines[i]))
      i++
    }
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', lines: paragraph })
    } else {
      i++ // blank line
    }
  }

  return blocks
}

/** Plain-text rendering (used for previews / notifications). */
export function toPlainText(input: string | null | undefined): string {
  const walk = (nodes: InlineNode[]): string =>
    nodes
      .map((n) => {
        switch (n.type) {
          case 'text':
          case 'code':
            return n.value
          case 'secret':
            return '🔒'
          default:
            return walk(n.children)
        }
      })
      .join('')

  return parseMessage(input)
    .map((b) => {
      switch (b.type) {
        case 'codeblock':
          return b.value
        case 'list':
          return b.items.map(walk).join(' ')
        default:
          return b.lines.map(walk).join(' ')
      }
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
