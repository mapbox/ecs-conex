#!/usr/bin/env bash

set -eu
source $(dirname $0)/lib/utils.sh
FAILED=0
PASSED=0

# initialize test id counter
testId=0
function aws() {
  if [[ $2 == "describe-repositories" ]]; then
    cat "$(dirname $0)/fixtures/retag/desc_repo.json"
  elif [[ $2 == "describe-images" ]]; then
    cat "$(dirname $0)/fixtures/retag/desc_images.json"
  elif [[ $2 == "batch-get-image" ]]; then
    echo "manifest"
  elif [[ $2 == "put-image" ]]; then
    if [[ ${tag} == "d5e593e26d489bce9ba1407edf40e55bd9174ac1" ]]; then
      tag_test "d5e593e26d489bce9ba1407edf40e55bd9174ac1 marked for cleanup"
      assert "equal" "$6" "commit"
    elif [[ ${tag} == "58d077f8357c9f507e106a09d4c73709a09623b6" ]]; then
      tag_test "58d077f8357c9f507e106a09d4c73709a09623b6 marked for cleanup"
      assert "equal" "$6" "commit"
    elif [[ ${tag} == "a5e3696f0d6450fae530c99a1b8598c71c11d41c" ]]; then
      tag_test "a5e3696f0d6450fae530c99a1b8598c71c11d41c marked to be saved"
      assert "equal" "$6" "merge-commit"
    elif [[ ${tag} == "the-tiger" ]]; then
      tag_test "the-tiger marked to be saved"
      assert "equal" "$6" "custom"
    fi
  fi
}

source $(dirname $0)/../retag-existing.sh

if [[ ${FAILED} != 0 ]]; then
  exit 1
else
  exit 0
fi