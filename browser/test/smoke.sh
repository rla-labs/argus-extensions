#!/bin/sh
# Start the extension's MCP server as Argus does, confined, and drive it: a page, a
# snapshot, a screenshot and a PDF in the project's folder. Run in that folder.
set -eu
exec node "$(dirname "$0")/smoke.mjs"
