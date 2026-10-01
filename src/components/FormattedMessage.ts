import { defineComponent, h, type PropType, type VNode, type VNodeChild } from 'vue'
import { parseMessage, type BlockNode, type InlineNode } from '@/utils/formatter'
import SecureSecret from './SecureSecret.vue'

/**
 * Renders message markup with Vue render functions only.
 *
 * There is intentionally no `innerHTML` / `v-html` anywhere: every piece of
 * user text becomes a text VNode, so HTML in messages is displayed literally.
 * Only the element types created below can ever appear in the DOM.
 */
export default defineComponent({
  name: 'FormattedMessage',
  props: {
    body: { type: String as PropType<string | null>, default: '' },
    messageId: { type: Number, required: true },
    /** Ids of secrets that really belong to this message. */
    secretIds: { type: Array as PropType<number[]>, default: () => [] },
  },
  setup(props) {
    const inline = (nodes: InlineNode[]): VNodeChild[] =>
      nodes.map((node): VNodeChild => {
        switch (node.type) {
          case 'text':
            return node.value
          case 'bold':
            return h('strong', inline(node.children))
          case 'italic':
            return h('em', inline(node.children))
          case 'underline':
            return h('u', inline(node.children))
          case 'code':
            return h('code', { class: 'md-code' }, node.value)
          case 'link':
            // href was validated by safeUrl(): http, https or mailto only.
            return h('a', { href: node.href, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, inline(node.children))
          case 'secret':
            return props.secretIds.includes(node.id)
              ? h(SecureSecret, { messageId: props.messageId, secretId: node.id })
              : h('span', { class: 'secure-missing' }, '[secure content unavailable]')
        }
      })

    const lines = (rows: InlineNode[][]): VNodeChild[] =>
      rows.flatMap((row, index) => (index === 0 ? inline(row) : [h('br'), ...inline(row)]))

    const block = (b: BlockNode): VNode => {
      switch (b.type) {
        case 'paragraph':
          return h('p', lines(b.lines))
        case 'quote':
          return h('blockquote', lines(b.lines))
        case 'codeblock':
          return h('pre', { class: 'md-pre' }, [h('code', b.value)])
        case 'list':
          return h(b.ordered ? 'ol' : 'ul', b.items.map((item) => h('li', inline(item))))
      }
    }

    return () => h('div', { class: 'md' }, parseMessage(props.body).map(block))
  },
})
