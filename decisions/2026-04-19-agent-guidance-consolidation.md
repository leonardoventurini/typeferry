# Agent Guidance Consolidation

Bifrost now relies on the global `AGENTS.md` for reusable workflow rules such
as conventional commits, Cortex-first discovery, and general Git discipline.
The repo-local AGENTS symlink target stays focused on Bifrost package
architecture, test runner split, release contracts, and packaging regressions.

Keep future Bifrost AGENTS additions specific to this package. Move reusable
engineering guidance to the global file instead of copying it here.
