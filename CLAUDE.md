# Runtime & package manager

- **Use Bun**, not npm/yarn/pnpm. All install, run, and script commands should use `bun` (e.g., `bun install`, `bun run test`, `bun add`).

# Git discipline

- **Semantic commit messages.** Use conventional commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`, `perf:`, `ci:`, `build:`). Focus on what changed and why.
- **Commit frequently.** Small, focused commits reduce merge conflicts and make it easier to cherry-pick or revert.
