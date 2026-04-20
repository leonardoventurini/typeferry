# Releasing

Bifrost ships three independently-versioned packages from one repo:

| Package         | Manifest                       | Registry (Forgejo)                                                          |
|-----------------|--------------------------------|------------------------------------------------------------------------------|
| `@example-app/bifrost`  | `bifrost-ts/package.json`     | `https://forgejo.example-app.com/api/packages/leonardoventurini/npm/`           |
| `example-app-bifrost`   | `bifrost-py/pyproject.toml`   | `https://forgejo.example-app.com/api/packages/leonardoventurini/pypi/`          |
| `bifrost`* (Cargo)   | `bifrost-rs/Cargo.toml`       | `https://forgejo.example-app.com/api/packages/leonardoventurini/cargo/`         |

\* The Rust workspace publishes nine crates: `bifrost-protocol`, `bifrost-ejson`, `bifrost-runtime`, `bifrost-http`, `bifrost-ws`, `bifrost-redis`, `bifrost-auth`, `bifrost-macros`, plus the `bifrost` umbrella.

You **never edit `version` fields by hand**. Versions move forward only through the release-bot. You write Conventional Commits; the bot bumps the right packages and publishes them.

---

## The release cycle

```
  developer push                bot push                   per-package publish
  ──────────────                ─────────                  ───────────────────
  $ git push       ──►  release-bump        ──►  chore(release): bump …
                          (parses commits,                │
                           edits manifests,               ├──►  publish-ts.yml
                           commits as bot,                ├──►  publish-py.yml
                           pushes back to main)           └──►  publish-rs.yml
                                                                (probe registry,
                                                                 publish only the
                                                                 versions that
                                                                 don't exist yet)
```

Every step is in `.forgejo/workflows/`. The path-filter on each workflow + the `chore(release):` gate on the publish jobs keep the pipeline tight: a `feat(rs):` push fires `release-bump` once, the bot's commit fires the publish jobs, and only `publish-rs` does real work — `publish-ts` and `publish-py` start, see no version changes, and exit clean.

---

## Conventional Commits cheatsheet

Subject must look like `<type>(<scope>)?<!>?: <subject>`. The release-bot reads `<type>`, `<scope>`, and the `!` marker (or `BREAKING CHANGE:` in the body) to decide if and how to bump.

| Subject                                          | Bumps                            |
|--------------------------------------------------|----------------------------------|
| `feat(py): add X`                                | `bifrost-py` → minor             |
| `fix(rs): handle race in Y`                      | `bifrost-rs` → patch             |
| `feat(ts)!: rewrite client API`                  | `bifrost-ts` → major             |
| `fix: typo in shared util` (touches both py + rs) | both → patch                     |
| `feat: shared change` (touches all three)        | all three → minor                |
| `chore(release): bump …` (the bot's own commits) | ignored (loop guard)             |
| `docs:`, `chore:`, `ci:`, `test:`, `refactor:`, `style:`, `perf:`, `build:`, `revert:` | no bump |

Recognized scopes: `ts`, `py`, `rs`, `bifrost-ts`, `bifrost-py`, `bifrost-rs`. Any other scope is treated like an unscoped commit (applies to every package whose path was touched).

If multiple commits in the bump window land different levels for the same package, the **highest level wins** — one `feat:` plus three `fix:` for the same package = one minor bump.

---

## What lives where

### `scripts/bump-versions.py`

The brain. Walks `last-release-commit..HEAD`, classifies each commit, computes the highest bump level per package, and rewrites manifests. Idempotent — re-running it on the same range with no new commits is a no-op.

Useful flags:

```sh
# What would happen on the next release?
scripts/bump-versions.py --dry-run

# Same, but emit JSON so you can pipe it.
scripts/bump-versions.py --dry-run --json

# Override the range (e.g. preview from a tag).
scripts/bump-versions.py --dry-run release/v0.2.9 HEAD
```

The Rust path also rewrites `bifrost-* version = "<old>"` lines inside `[workspace.dependencies]` so the umbrella crate's published artifact references the just-bumped sibling crates.

### `.forgejo/workflows/release-bump.yml`

Triggers on push to `main` when files under `bifrost-{ts,py,rs}/**` changed. Job-level guards:

- Skips when `head_commit.message` already starts with `chore(release):` (loop guard — the bot's own commit doesn't re-trigger itself).
- Skips when `forgejo.actor == 'release-bot'` (defence in depth; doesn't actually fire today because the bot pushes under the token owner's identity).

Runs `scripts/bump-versions.py --json`, and if any package needs a bump:

1. Configures git as `release-bot <release-bot@example-app.com>`.
2. Stages only the manifest files the script touched.
3. Commits with subject `chore(release): bifrost-py 0.0.1 → 0.1.0, bifrost-rs 0.0.1 → 0.0.2` and a body listing every bump.
4. Pushes back to main using `secrets.FORGEJO_TOKEN`.

That bot push is what lights up the publish workflows.

### `.forgejo/workflows/publish-ts.yml` / `publish-py.yml` / `publish-rs.yml`

Each gates on `if: startsWith(forgejo.event.head_commit.message, 'chore(release):')` so they only fire on the bot's commits. Each is **independently idempotent**:

- **TS**: `npm view @example-app/bifrost@<version> version --registry $REGISTRY` — skips if the version is already there, otherwise `bun publish`.
- **Python**: `curl …/pypi/simple/example-app-bifrost/` and grep for the version's filename — skips on hit, otherwise `python -m build` + `twine upload`.
- **Rust**: walks the nine publishable crates in dependency order (`bifrost-protocol → bifrost-ejson → bifrost-runtime → http/ws/redis/auth/macros → bifrost`); for each, hits Forgejo's Cargo API and skips when the version is listed, otherwise `cargo publish -p <crate> --registry forgejo --no-verify`.

Three properties this gives you:

1. **No double-publish.** Re-running a publish workflow against the same versions is a guaranteed no-op.
2. **Mixed bumps work.** A `chore(release):` that bumps only `bifrost-py` triggers all three publish workflows; only `publish-py` does real work.
3. **Ordering is mechanical.** The Rust workflow knows the dep graph and publishes accordingly; the Forgejo Cargo registry sees crates in the order their dependents need them.

---

## Consuming the published packages

### npm

```sh
cat > .npmrc <<'EOF'

EOF

bun add @example-app/bifrost     # or: npm install @example-app/bifrost
```

### PyPI

```sh
pip install \
  --extra-index-url https://forgejo.example-app.com/api/packages/leonardoventurini/pypi/simple/ \
  example-app-bifrost[full]      # or [http,ws,redis,auth,schema] subset
```

### Cargo

Add the registry once in `~/.cargo/config.toml`:

```toml
[registries.forgejo]
index = "sparse+https://forgejo.example-app.com/api/packages/leonardoventurini/cargo/"
```

Then in your project's `Cargo.toml`:

```toml
[dependencies]
bifrost = { version = "0.0.1", registry = "forgejo", features = ["full"] }
```

Or pull individual sub-crates: `bifrost-runtime`, `bifrost-http`, etc.

---

## Setup (one-time)

### `FORGEJO_TOKEN` secret

The pipeline depends on a single repo secret:

1. Forgejo profile → Settings → Applications → generate a token with `write:repository` and `write:package` scopes.
2. Repo → Settings → Secrets → add `FORGEJO_TOKEN`.

The bot uses this token to push back to `main` AND each publish workflow uses it to authenticate against the npm / PyPI / Cargo registries.

### Branch settings

Don't enable "require PR" or signed-commit enforcement on `main` — the bot pushes directly. If you ever do, you'll need to switch the bot to opening release PRs instead (a non-trivial change).

### Local clone — nothing to install

There are no per-developer hooks to install. Just commit using Conventional Commits and push.

---

## Manual escape hatches

| Scenario                                                | What to do                                                                                                |
|---------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Push without triggering a release for some commits      | Use a non-bumping type: `chore: …`, `docs: …`, `ci: …`, `refactor: …`, etc.                              |
| Force a release with no eligible code change            | Add an empty commit: `git commit --allow-empty -m "feat: trigger release"` — the bot will bump and publish. |
| Reset the bump window (e.g. after a manual version edit) | Land a `git commit --allow-empty -m "chore(release): bootstrap @ <version>"` commit on main. The bot's next scan starts after that commit. |
| Re-publish an already-pushed version                    | You can't — the registries reject duplicate versions. Bump the manifest by hand + commit + push, or write a `feat:` / `fix:` commit and let the bot bump for you. |
| Inspect what the bot would do                           | `scripts/bump-versions.py --dry-run --json`                                                              |
| Disable the publish for a single bot commit             | Land the bump commit, then immediately revert it (`git revert <sha>`). The publish workflow already ran for the original commit; the revert lands a new HEAD that doesn't trigger publish (no `chore(release):` prefix). |

---

## Troubleshooting

**"no matching package named `bifrost-*` found, location searched: crates.io index"** during a Rust publish. Means a `[workspace.dependencies]` entry is missing `registry = "forgejo"`. Cargo strips `path` at publish time and falls back to the default registry without it.

**Twine: "The configured repository does not have support for `--skip-existing`"**. Forgejo's PyPI doesn't expose that capability. The publish workflow probes the simple index manually before uploading; if you see this message, something edited the workflow back to the unsupported flag.

**Publish workflows fire but immediately exit clean.** Expected on bot commits where only one package was bumped — the other two probe their registries, find no new version, and exit. Not an error.

**Bot pushes but no publish workflow runs.** Check that the `chore(release):` commit landed on `main` (not a different branch) and that the `FORGEJO_TOKEN` secret has `write:repository` scope (without it, the bot's push is anonymous and Forgejo Actions doesn't fire downstream workflows).

**`cargo publish` fails with "could not execute process `rustc -vV`"**. The runner shell isn't sourcing the toolchain dir. The Rust workflow exports `CARGO=<abs-path>` via `FORGEJO_ENV` and prepends `dirname $CARGO` to PATH inline — if you change the workflow, preserve both.

**Bot makes a release commit you didn't expect.** The bot scans all commits since the last `chore(release):` — if you pushed a `feat:` commit weeks ago and only just landed an unrelated `ci:` change today, the next bot run still picks up the old `feat:`. Workaround: drop a `chore(release): bootstrap @ <current>` commit on main to reset the window.

---

## Known limitations

- **No PR-based release flow.** The bot pushes straight to main. If you want changesets-style "release PRs", that's a separate redesign.
- **No major-version coordination across packages.** Each package versions independently. A `feat(rs)!:` bump only majors `bifrost-rs`; if you want lockstep majors, do them in a single commit with a body of `BREAKING CHANGE:` and an unscoped subject so it touches every package.
- **First-publish bootstrap is implicit.** The first run scans full history. If pre-existing `feat:`/`fix:` commits sit on main when the bot is enabled, the first bumps will reflect that history.
- **Path filter is conservative.** Touching only `docs/`, `decisions/`, `PROTOCOL.md`, etc. won't trigger the release-bump workflow at all — even if you tag those commits with `feat:`. This is intentional: only changes inside `bifrost-{ts,py,rs}/` produce releases.
