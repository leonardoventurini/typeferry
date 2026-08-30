import '@/client/styles.css'

import { ClientProvider } from '@example-app/bifrost/react'
import { createRoot } from 'react-dom/client'

import { App } from '@/client/app'
import { bifrostClientOptions } from '@/client/bifrost-client'

const root = document.getElementById('root')

if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <ClientProvider clientOptions={bifrostClientOptions}>
    <App />
  </ClientProvider>,
)
