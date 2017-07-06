#!/usr/bin/env bash

set -eu
source $(dirname $0)/lib/utils.sh

testId=0
PASSED=0
FAILED=0

subShell () {
  exitCode=$(echo $?)
  assert 'equal' $exitCode 1
}

tag_test 'GithubAccessToken with inadequate permissions should throw helpful error message'
export GithubAccessToken=ffffffffffffffffffffffffffffffffffffffff
subShell $(./$(dirname $0)/../scripts/watch.sh)