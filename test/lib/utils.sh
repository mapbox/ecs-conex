#!/usr/bin/env bash

set -eu
set -o pipefail

function copy_func() {
  declare -F $1 >/dev/null || (echo "Error: Can't find function '$1' to copy" && exit 255)
  eval "$(echo "${2}()"; declare -f ${1} | tail -n +2)"
}

function tag_test() {
  label=$1
  echo -e "\n# test ${label}"
}

function test () {
  testId=$((testId+1))
}

function passed() {
  PASSED=$((PASSED+1))
  message=$1
  echo -e "ok ${testId} ${message}"
}

function failed() {
  FAILED=$((FAILED+1))
  message=$1
  expected=$2
  actual=$3
  echo -e "not ok ${testId} ${message}\n  ---\n    expected: ${expected}\n    actual:   ${actual}\n  ---"
}

function summarize() {
  echo -e "\n# tests $((PASSED + FAILED))"
  echo -e "# pass  ${PASSED}"
  echo -e "# fail  ${FAILED}\n"
}
