import { defineMarkdocConfig } from '@markdoc/next.js/config'
import { Callout } from './components/Callout'

export default defineMarkdocConfig({
  tags: {
    callout: {
      render: Callout,
      attributes: {
        type: {
          type: String,
          default: 'note',
          matches: ['note', 'warning', 'error', 'info'],
        },
        title: {
          type: String,
        },
      },
    },
  },
})