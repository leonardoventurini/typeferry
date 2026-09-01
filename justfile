set shell := ['bash', '-euo', 'pipefail', '-c']

package_dir := 'typeferry-ts'
registry := 'https://registry.npmjs.org/'

# List repository-level release recipes.
default:
    @just --list --unsorted

# Run the complete non-uploading npm release and artifact gate.
verify-npm-release:
    test "$(node --version)" = "v24.19.0"
    test "$(npm --version)" = "11.17.0"
    cd {{ package_dir }} && npm ci
    cd {{ package_dir }} && npm run lint
    cd {{ package_dir }} && npm run typecheck
    cd {{ package_dir }} && npm test
    cd {{ package_dir }} && npm run build
    node scripts/verify-npm-package.mjs

# Validate irreversible publish preconditions before running the longer gate.
[private]
assert-npm-publish-state:
    test "$(git symbolic-ref --quiet HEAD)" = "refs/heads/main"
    git diff --quiet
    git diff --cached --quiet
    test -z "$(git status --porcelain)"
    npm whoami --registry={{ registry }} >/dev/null
    node scripts/verify-npm-package.mjs --check-version-available

# Publish the verified TypeScript package to the public npm registry.
publish-npm: assert-npm-publish-state verify-npm-release
    cd {{ package_dir }} && npm publish --access public --registry={{ registry }}
