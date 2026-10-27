#!/bin/sh
# Start the extension's MCP server and drive it: a page built by JavaScript read as
# Markdown, a form filled and sent, and a private address refused. Run in a project's folder.
set -eu
exec node "$(dirname "$0")/smoke.mjs"
