/**
 * Pure helpers for the message composer (kept separate for unit testing).
 *
 * Secure content is represented in the textarea by a visible marker
 * "🔒[secure N]" while the real value lives in memory only. On send the
 * markers are converted to {{secret:i}} placeholders + a parallel array.
 */

export const MARKER_PATTERN = /🔒\[secure (\d+)\]/g

export const marker = (n: number) => `🔒[secure ${n}]`

export interface ComposedMessage {
  body: string
  secrets: string[]
}

export class ComposeError extends Error {}

/** Convert draft text + in-memory secret values into the API payload. */
export function composeMessage(draft: string, values: Map<number, string>): ComposedMessage {
  const secrets: string[] = []
  const used = new Set<number>()

  const withoutMarkers = draft.replace(MARKER_PATTERN, '')
  if (withoutMarkers.includes('{{secret:')) {
    throw new ComposeError('The text "{{secret:" is reserved. Please rephrase.')
  }

  const body = draft.replace(MARKER_PATTERN, (whole, n: string) => {
    const id = Number(n)
    const value = values.get(id)
    if (value === undefined || used.has(id)) return whole // unknown/duplicate marker: plain text
    used.add(id)
    secrets.push(value)
    return `{{secret:${secrets.length - 1}}}`
  })

  return { body: body.trim(), secrets }
}

export interface Selection {
  text: string
  start: number
  end: number
}

export interface EditResult {
  text: string
  selectionStart: number
  selectionEnd: number
}

/** Wrap the selection with inline markers (e.g. ** for bold). */
export function wrapSelection(sel: Selection, before: string, after = before, placeholder = 'text'): EditResult {
  const chosen = sel.text.slice(sel.start, sel.end) || placeholder
  const text = sel.text.slice(0, sel.start) + before + chosen + after + sel.text.slice(sel.end)
  const start = sel.start + before.length
  return { text, selectionStart: start, selectionEnd: start + chosen.length }
}

/** Prefix every selected line (lists / quotes). */
export function prefixLines(sel: Selection, prefix: (index: number) => string): EditResult {
  const lineStart = sel.text.lastIndexOf('\n', sel.start - 1) + 1
  const lineEndIdx = sel.text.indexOf('\n', sel.end)
  const lineEnd = lineEndIdx === -1 ? sel.text.length : lineEndIdx
  const block = sel.text.slice(lineStart, lineEnd)
  const replaced = block
    .split('\n')
    .map((line, i) => prefix(i) + line)
    .join('\n')
  const text = sel.text.slice(0, lineStart) + replaced + sel.text.slice(lineEnd)
  return { text, selectionStart: lineStart, selectionEnd: lineStart + replaced.length }
}
