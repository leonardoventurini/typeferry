# Minimongo compatibility corpus

The fixtures and tests governed by this directory describe TypeFerry's
compatibility target for `typeferry/minimongo`. The pinned upstream baseline is
recorded in [`manifest.json`](manifest.json).

All executable cases are authored and tracked in this repository. TypeFerry
test and release commands must not execute or copy Meteor's own tests or refer
to an external checkout. When an upstream behavior informs a case, record a
stable source or documentation link beside the locally owned case.

Compatibility covers observable results, thrown versus rejected errors, error
names and messages, cloning and aliasing, callback order, and asynchronous
readiness. Known Meteor limitations remain part of the target.
