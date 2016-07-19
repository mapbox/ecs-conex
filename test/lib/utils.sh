#!/usr/bin/env bash

set -eu
set -o pipefail

function copy_func() {
  declare -F $1 >/dev/null || (echo "Error: Can't find function '$1' to copy" && exit 255)
  eval "$(echo "${2}()"; declare -f ${1} | tail -n +2)"
}
