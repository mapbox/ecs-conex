#!/usr/bin/env bash

set -eu
source utils.sh

# credentials

function curl () {
  role=test_role
  creds=test_creds

  if [[ $2 == *"${role}"* ]]; then
    echo ${creds}
  else
    echo ${role}
  fi
}

export NPMToken=test_NPMToken
credentials ./test/fixtures/Dockerfile
echo $args
echo $NPMToken
if [[ *"$args"* == $NPMToken ]]; then
  echo PASS
fi
