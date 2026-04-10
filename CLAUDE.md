# Runtime & package manager

- **Use Bun**, not npm/yarn/pnpm. All install, run, and script commands should use `bun` (e.g., `bun install`, `bun run test`, `bun add`).

# Git discipline

- **Semantic commit messages.** Use conventional commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`, `perf:`, `ci:`, `build:`). Focus on what changed and why.
- **Commit frequently.** Small, focused commits reduce merge conflicts and make it easier to cherry-pick or revert.

# Cortex workflow

- **Use Cortex first.** Prefer Cortex queries over broad manual file spelunking whenever the answer can be found in the graph.
- **Start with discovery.** Use `architecture_report` or `graph_context` to understand the repo, then narrow with `search_code`, `find_symbol`, `get_symbol_info`, `get_related`, and `find_references`.
- **Check blast radius before edits.** Run `contract_check` and `impact_analysis` before changing exported APIs, shared hooks, transports, or other widely used symbols.
- **Check risk before larger changes.** Use `regression_risk_report` and `test_coverage_map` for substantive edits, and `documentation_coverage` or `consistency_check` when touching public symbols or files that should match local conventions.
- **Use architecture tools when in doubt.** `pagerank` and `leiden` help identify key files, hotspots, and module boundaries. `dead_code_detection` is useful when cleaning up or removing code.
- **Keep Cortex fresh.** After editing files, refresh the index with `ingest_files` for the changed paths so later work sees the latest code.
- **Prefer the smallest useful query.** Reach for the most specific Cortex tool that answers the question, and fall back to direct file reads only when the graph does not have enough context.
