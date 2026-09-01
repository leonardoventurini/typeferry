import '@/client/styles.css'

import { ClientProvider } from 'typeferry-ts/react'
import { createRoot } from 'react-dom/client'

import { App } from '@/client/app'
import { typeferryClientOptions } from '@/client/typeferry-client'

const root = document.getElementById('root')

if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <ClientProvider clientOptions={typeferryClientOptions}>
    <App />
  </ClientProvider>,
)
