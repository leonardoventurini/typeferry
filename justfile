set shell := ['bash', '-euo', 'pipefail', '-c']

package_dir := 'typeferry-ts'
registry := 'https://registry.npmjs.org/'

# List repository-level release recipes.
default:
    @just --list --unsorted

# Install the exact Node.js and npm versions used by release recipes.
[private]
install-npm-toolchain:
    mise install

# Run the complete non-uploading npm release and artifact gate.
verify-npm-release: install-npm-toolchain
    test "$(mise exec -- node --version)" = "v24.19.0"
    test "$(mise exec -- npm --version)" = "11.17.0"
    cd {{ package_dir }} && mise exec -- npm ci
    cd {{ package_dir }} && mise exec -- npm run lint
    cd {{ package_dir }} && mise exec -- npm run typecheck
    cd {{ package_dir }} && mise exec -- npm test
    cd {{ package_dir }} && mise exec -- npm run build
    mise exec -- node scripts/verify-npm-package.mjs

# Validate irreversible publish preconditions before running the longer gate.
[private]
assert-npm-publish-state: install-npm-toolchain
    test "$(git symbolic-ref --quiet HEAD)" = "refs/heads/main"
    git diff --quiet
    git diff --cached --quiet
    test -z "$(git status --porcelain)"
    mise exec -- npm whoami --registry={{ registry }} >/dev/null
    mise exec -- node scripts/verify-npm-package.mjs --check-version-available

# Publish the verified TypeScript package to the public npm registry.
publish-npm: assert-npm-publish-state verify-npm-release
    cd {{ package_dir }} && mise exec -- npm publish --access public --registry={{ registry }}
