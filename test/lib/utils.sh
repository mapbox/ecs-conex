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

function assert () {
  testId=$((testId+1))
  evaluation=${1:-}
  result=${2:-}
  expected=${3:-}
  message=${4:-""}

  # equal
  if [ "${evaluation}" == "equal" ]; then
    if [[ -z ${message} ]]; then
      message="should be equal"
    fi

    if [ "${result}" != "${expected}" ]; then
      failed "${message}" "${expected}" "${result}"
    else
      passed "${message}"
    fi
  fi

  # not equal
  if [ "${evaluation}" == "notEqual" ]; then
    if [ ! ${message} ]; then
      message="should not equal"
    fi

    if [ "${result}" == "${expected}" ]; then
      failed "${message}" "${expected}" "${result}"
    else
      passed "${message}"
    fi
  fi

  # contains
  if [ "${evaluation}" == "contains" ]; then
    if [ ! ${message} ]; then
      message="should contain"
    fi

    if [[ "${result}" != *"${expected}"* ]]; then
      failed "${message}" "string that contains: \"${expected}\"" "${result}"
    else
      passed "${message}"
    fi
  fi

  # does not contain
  if [ "${evaluation}" == "doesNotContain" ]; then
    if [ ! ${message} ]; then
      message="should not contain"
    fi

    if [[ "${result}" == *"${expected}"* ]]; then
      failed "${message}" "string that does not contain: \"${expected}\"" "${result}"
    else
      passed "${message}"
    fi
  fi

  # success
  if [ "${evaluation}" == "success" ]; then
    if $result; then
      passed "${expected}"
    else
      failed "${expected}" "exit 0" "exit $?"
    fi
  fi
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
