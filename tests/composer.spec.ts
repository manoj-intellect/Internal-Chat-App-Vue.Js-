import { describe, expect, it } from 'vitest'
import { ComposeError, composeMessage, marker, prefixLines, wrapSelection } from '@/utils/composer'

describe('composeMessage', () => {
  it('converts secure markers into indexed placeholders and a parallel secrets array', () => {
    const values = new Map([
      [3, 'hunter2'],
      [7, 'token-abc'],
    ])
    const result = composeMessage(`user ${marker(7)} pass ${marker(3)}`, values)
    expect(result.body).toBe('user {{secret:0}} pass {{secret:1}}')
    expect(result.secrets).toEqual(['token-abc', 'hunter2'])
  })

  it('never puts secret values into the body', () => {
    const result = composeMessage(`pw ${marker(1)}`, new Map([[1, 'S3cret!']]))
    expect(result.body).not.toContain('S3cret!')
  })

  it('leaves unknown or duplicated markers as plain text', () => {
    const result = composeMessage(`${marker(1)} ${marker(1)} ${marker(9)}`, new Map([[1, 'a']]))
    expect(result.body).toBe(`{{secret:0}} ${marker(1)} ${marker(9)}`)
    expect(result.secrets).toEqual(['a'])
  })

  it('rejects reserved placeholder syntax typed by the user', () => {
    expect(() => composeMessage('look {{secret:0}}', new Map())).toThrow(ComposeError)
  })
})

describe('editing helpers', () => {
  it('wraps a selection', () => {
    const r = wrapSelection({ text: 'hello world', start: 6, end: 11 }, '**')
    expect(r.text).toBe('hello **world**')
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe('world')
  })

  it('prefixes selected lines', () => {
    const r = prefixLines({ text: 'a\nb\nc', start: 0, end: 3 }, (i) => `${i + 1}. `)
    expect(r.text).toBe('1. a\n2. b\nc')
  })
})
