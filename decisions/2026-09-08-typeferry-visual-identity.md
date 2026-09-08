# TypeFerry visual identity

Status: accepted

## Context

The root README explains TypeFerry as a type-safe, real-time application
framework, but the repository had no visual identity or hero artwork. A logo
and banner need to communicate the same server-to-client crossing described by
the product without implying that TypeFerry is a maritime or travel product.

## Decision

Use a geometric `TF` monogram joined by a cyan endpoint-to-endpoint route as
the primary TypeFerry motif. Pair it with a high-contrast geometric TypeFerry
wordmark on a deep ink-navy field.

The README banner extends that motif into an abstract bridge carrying structured
data from one server toward multiple client forms. Endpoint illustrations stay
generic and unlabeled so the identity does not depend on third-party framework
or platform marks.

The repository-owned assets are:

- `docs/assets/typeferry-logo.webp` for the standalone dark-surface lockup.
- `docs/assets/typeferry-banner.webp` for the root README hero.

The palette is deep ink navy and graphite with electric cyan as the primary
signal color and restrained violet only in supporting banner artwork.

## Rejected alternatives

- A literal ferry, waves, or other maritime imagery would make the name more
  obvious but position the project like a travel product.
- A framework-logo collage would date the artwork and borrow other projects'
  identities.
- A transparent raster lockup was rejected for the initial asset because the
  dark wordmark lost contrast on dark surfaces and generated alpha edges did
  not meet the quality bar.

## Rationale

The crossing motif connects the name to TypeFerry's actual value: carrying a
typed contract reliably between server and clients. The limited palette and
simple monogram remain recognizable inside the richer banner composition while
keeping the identity distinct from the individual technologies TypeFerry
integrates.

## Consequences

- New repository artwork should preserve the monogram geometry, wordmark
  spelling, and navy/cyan palette.
- The current assets are optimized raster WebP files. A future logo package for
  print, icons, or arbitrary scaling should create and review a proper vector
  master rather than treating the raster output as editable source geometry.
- Light-background and transparent logo variants remain future deliverables;
  consumers should use the current standalone lockup on its included background.
