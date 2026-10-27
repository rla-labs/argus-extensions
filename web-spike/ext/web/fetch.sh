#!/bin/sh
# Spike only: the binaries were put in bin/ by the workflow (built in the same run).
set -eu
chmod 0755 bin/obscura bin/obscura-worker
bin/obscura --version
