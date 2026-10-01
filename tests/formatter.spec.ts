import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FormattedMessage from '@/components/FormattedMessage'
import { parseMessage, safeUrl, toPlainText } from '@/utils/formatter'

const render = (body: string, secretIds: number[] = []) =>
  mount(FormattedMessage, { props: { body, messageId: 1, secretIds } })

describe('safeUrl', () => {
  it('allows http, https and mailto', () => {
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeUrl('http://example.com')).toBe('http://example.com/')
    expect(safeUrl('mailto:someone@example.com')).toBe('mailto:someone@example.com')
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example.com',
    '/relative/path',
    'https://exa mple.com',
    '',
  ])('rejects %s', (url) => {
    expect(safeUrl(url)).toBeNull()
  })
})

describe('FormattedMessage XSS protection', () => {
  it('renders HTML in messages as literal text', () => {
    const wrapper = render('<script>alert(1)</script><img src=x onerror=alert(1)>')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
  })

  it('never produces dangerous links', () => {
    const wrapper = render('[click](javascript:alert(1)) [x](data:text/html,hi) [ok](https://example.com)')
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(1)
    expect(links[0].attributes('href')).toBe('https://example.com/')
    expect(links[0].attributes('rel')).toContain('noopener')
    expect(links[0].attributes('target')).toBe('_blank')
    expect(wrapper.text()).toContain('[click](javascript:alert(1))')
  })

  it('does not allow attribute injection through link labels or urls', () => {
    const wrapper = render('[a" onmouseover="alert(1)](https://example.com/"onmouseover="x)')
    const link = wrapper.get('a').element
    // The quote in the URL is percent-encoded; the label stays a text node.
    expect(link.getAttribute('href')).toBe('https://example.com/%22onmouseover=%22x')
    expect(link.getAttributeNames().sort()).toEqual(['href', 'rel', 'target'])
    expect(link.textContent).toBe('a" onmouseover="alert(1)')
    for (const el of Array.from(wrapper.element.querySelectorAll('*')) as Element[]) {
      expect(el.getAttributeNames().some((n: string) => n.startsWith('on'))).toBe(false)
    }
  })

  it('handles malformed and deeply nested markup without throwing', () => {
    const nasty = '**'.repeat(500) + '*__`[' + '](' + '{{secret:'.repeat(50)
    expect(() => render(nasty)).not.toThrow()
    expect(() => parseMessage('```\nunterminated')).not.toThrow()
  })

  it('only emits whitelisted elements', () => {
    const wrapper = render('**b** *i* __u__ `c`\n- one\n1. two\n> quote\n```\npre\n```\n[l](https://x.test)')
    const allowed = new Set(['DIV', 'P', 'STRONG', 'EM', 'U', 'CODE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'A', 'BR'])
    const root = wrapper.element as Element
    const descendants = Array.from(root.querySelectorAll('*'))
    for (const el of descendants) {
      expect(allowed.has(el.tagName)).toBe(true)
    }
    for (const el of [root, ...descendants]) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name).toMatch(/^(class|href|target|rel)$/)
      }
    }
  })
})

describe('formatting', () => {
  it('supports the lightweight syntax', () => {
    const wrapper = render('**bold** *italic* __under__ `code`')
    expect(wrapper.find('strong').text()).toBe('bold')
    expect(wrapper.find('em').text()).toBe('italic')
    expect(wrapper.find('u').text()).toBe('under')
    expect(wrapper.find('code').text()).toBe('code')
  })

  it('supports lists, quotes and code blocks', () => {
    const wrapper = render('- a\n- b\n\n1. x\n2. y\n\n> quoted\n\n```\n**not bold**\n```')
    expect(wrapper.findAll('ul li')).toHaveLength(2)
    expect(wrapper.findAll('ol li')).toHaveLength(2)
    expect(wrapper.find('blockquote').text()).toBe('quoted')
    expect(wrapper.find('pre').text()).toBe('**not bold**')
    expect(wrapper.find('pre strong').exists()).toBe(false)
  })

  it('auto-links bare https URLs safely', () => {
    const wrapper = render('see https://example.com/docs.')
    expect(wrapper.find('a').attributes('href')).toBe('https://example.com/docs')
  })
})

describe('secure placeholders', () => {
  it('renders a reveal control for secrets that belong to the message', () => {
    const wrapper = render('Password: {{secret:42}}', [42])
    expect(wrapper.text()).toContain('Secure content')
    expect(wrapper.text()).toContain('Reveal')
  })

  it('does not render reveal controls for foreign secret ids', () => {
    const wrapper = render('Password: {{secret:99}}', [42])
    expect(wrapper.text()).not.toContain('Reveal')
    expect(wrapper.text()).toContain('secure content unavailable')
  })

  it('secret placeholders inside code stay inert', () => {
    const wrapper = render('`{{secret:42}}`', [42])
    expect(wrapper.text()).not.toContain('Reveal')
  })

  it('plain text conversion masks secrets', () => {
    expect(toPlainText('pw: {{secret:1}} **bold**')).toBe('pw: 🔒 bold')
  })
})
