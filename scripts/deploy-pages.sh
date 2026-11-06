#!/usr/bin/env bash
# Build the client for GitHub Pages and publish it to the `gh-pages` branch ("Deploy from a
# branch"). Built here, not on GitHub: no workflow file, no build step on GitHub's side (the
# `.nojekyll` file makes Pages skip Jekyll and only copy the files out).
#
#   pnpm deploy:pages               build + commit to gh-pages + push
#   pnpm deploy:pages --no-push     build + commit locally only (inspect with `git show gh-pages`)
#
# Env:
#   MUDDERS_BASE     URL path the site lives under (default /mudders/, the project-site path)
#   VITE_SIGNAL_URL  lobby server, e.g. https://mudders-signal.onrender.com. Without it the online
#                    lobby shows "unreachable" and points players to Direct (no server) play.
#   PAGES_REMOTE     git remote to push to (default origin)
set -euo pipefail

push=1
[[ "${1:-}" == "--no-push" ]] && push=0

root="$(git rev-parse --show-toplevel)"
cd "$root"
base="${MUDDERS_BASE:-/mudders/}"
remote="${PAGES_REMOTE:-origin}"
src_rev="$(git rev-parse --short HEAD)"
dirty=""
git diff --quiet HEAD || dirty=" (+ uncommitted changes)"

echo "› building client for base ${base}${VITE_SIGNAL_URL:+, lobby ${VITE_SIGNAL_URL}}"
MUDDERS_BASE="$base" pnpm --filter @mudders/client build

dist="$root/packages/client/dist"
work="$(mktemp -d)"
trap 'git worktree remove --force "$work" >/dev/null 2>&1 || rm -rf "$work"' EXIT

# start from the remote branch if it exists, so each deploy is one new commit on top
git fetch "$remote" gh-pages 2>/dev/null || true
if git rev-parse --verify -q "$remote/gh-pages" >/dev/null; then
  git worktree add -f -B gh-pages "$work" "$remote/gh-pages" >/dev/null
elif git rev-parse --verify -q gh-pages >/dev/null; then
  git worktree add -f "$work" gh-pages >/dev/null # a local --no-push deploy, not pushed yet
else
  git worktree add -f --detach "$work" >/dev/null
  git -C "$work" checkout --orphan gh-pages >/dev/null
fi

git -C "$work" rm -rfq --ignore-unmatch . >/dev/null
# source maps stay out of the public site (they'd triple its size)
cp -a "$dist/." "$work/"
find "$work" -name '*.map' -delete
rm -f "$work/_headers" # Cloudflare-only; GitHub Pages ignores it
touch "$work/.nojekyll"

git -C "$work" add -A
if git -C "$work" diff --cached --quiet; then
  echo "› nothing changed since the last deploy"
  exit 0
fi
git -C "$work" commit -qm "Deploy ${src_rev}${dirty} to GitHub Pages"
echo "› committed $(git -C "$work" rev-parse --short HEAD) on gh-pages"

if [[ $push == 1 ]]; then
  git -C "$work" push "$remote" gh-pages
  echo "› pushed; live in about a minute at https://slimboyfats.github.io${base}"
fi
