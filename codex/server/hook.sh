#!/bin/sh
# Argus extension codex: the hook Codex runs before and after each tool call. Codex lets a
# tool run when its hook fails (an error, a timeout, an answer it cannot read), so this
# wrapper turns every failure into a refusal: only hook.mjs's explicit answer, or its exit
# 2, ever leaves here.
out="$(node "$(dirname "$0")/hook.mjs")"
status=$?
if [ "${status}" -eq 2 ]; then exit 2; fi
if [ "${status}" -eq 0 ]; then
  printf '%s' "${out}"
  exit 0
fi
echo "Argus: the approval hook failed (${status}); not allowed" >&2
exit 2
