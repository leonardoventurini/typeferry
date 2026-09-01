# Lit Integration

The Lit adapter exposes reactive controllers backed by the core TypeFerry client.

```ts
// client/greeting-element.ts
import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import {
  TypeFerryClientController,
  TypeFerryMethodController,
} from 'typeferry-ts/lit'

@customElement('greeting-element')
export class GreetingElement extends LitElement {
  private readonly client = new TypeFerryClientController(this, {
    clientOptions: {
      host: window.location.hostname,
      port: 8002,
    },
  })

  private readonly greeting = new TypeFerryMethodController(
    this,
    this.client,
    {
      method: 'greeting.hello',
      params: { name: 'Ada' },
      defaultValue: '' as string,
    },
  )

  protected render() {
    if (this.greeting.loading) return html`<p>Loading…</p>`
    if (this.greeting.error) return html`<p role="alert">Request failed</p>`

    return html`<p>${this.greeting.result}</p>`
  }
}
```

Controllers participate in the host element lifecycle and request updates when state changes. Call `this.greeting.refresh()` for an explicit refetch. Reuse one client controller for multiple method controllers in an element tree where practical.

The controller options parallel the core [client](client.md). Authentication and server event behavior remain core concerns; see [authentication](authentication.md) and [events and channels](events-and-channels.md).
