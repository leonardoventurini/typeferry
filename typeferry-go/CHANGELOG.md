# TypeFerry Go changelog

The Go server remains an unpublished candidate pending API and release review.

## 2026-09-30

- fix(go): freeze runtime admission during joined shutdown
  Runtime retirement clears presence and rooms, closes late clients, rejects
  new work and preserves concurrent close results. Both real client transports
  now cover values, validation, caching and errors; WebSockets also cover
  protected/user events, exclusion and disconnected subscription cleanup.
