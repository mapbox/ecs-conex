#!/usr/bin/env bash

set -eu
source $(dirname $0)/../utils.sh
source $(dirname $0)/lib/utils.sh
FAILED=0
PASSED=0

# initialize test id counter
testId=0

# after_image() 1 param test
tag_test "after_image with 1 param"
export AccountId=1
export repo=repo
export after=2
export sha_tag=""

log=$(after_image us-east-1)
expected="1.dkr.ecr.us-east-1.amazonaws.com/repo:2"
assert "equal" "${log}" "${expected}"

# after_image() 2 param test
tag_test "after_image with 2 params"
export AccountId=1
export repo=repo
export after=2

log=$(after_image us-east-1 v1.0.0)
expected="1.dkr.ecr.us-east-1.amazonaws.com/repo:v1.0.0"
assert "equal" "${log}" "${expected}"

# login() test
tag_test "login"
test_region=us-east-1

function aws() {
  if [ "${1}" != "ecr" ]; then
    echo "First argument must be ecr"
  elif [ "${2}" != "get-login" ]; then
    echo "Second argument must be get-login"
  elif [ "${4}" != "${test_region}" ]; then
    echo "Fourth argument must be region"
  else
    echo "echo All good"
  fi
}

log=$(login ${test_region})
expected="All good"
assert "equal" "${log}" "${expected}"

# ecr_logins() test
tag_test "ecr_logins"
test_regions=(us-east-1 us-west-2 eu-west-1)
logged_into=""

function login() {
  logged_into="${logged_into}|$1"
}

ecr_logins "${test_regions[@]}"
assert "equal" "$logged_into" "|us-east-1|us-west-2|eu-west-1"

# ensure_repo() setup
copy_func create_repo old_create_repo
test_region=us-east-1
FAILURE_MESSAGE=""
CALLED=0

function aws() {
  if [ "${1}" != "ecr" ]; then
    FAILURE_MESSAGE="First argument must be ecr"
  elif [ "${2}" != "describe-repositories" ]; then
    FAILURE_MESSAGE="Second argument must be describe-repositories"
  elif [ "${4}" != "${test_region}" ]; then
    FAILURE_MESSAGE="Fourth argument must be region"
  elif [ "${6}" == "exists" ]; then
    return 0
  elif [ "${6}" == "not_exists" ]; then
    return 1
  else
    FAILURE_MESSAGE="${6} must be exists or not_exists"
  fi
}

function create_repo() {
  CALLED=1
}

# ensure_repo() exists test
tag_test "ensure_repo exists"
repo=exists

ensure_repo ${test_region}
assert "equal" "${CALLED}" "0"
assert "equal" "${FAILURE_MESSAGE}" "" "should not have any failures"

# ensure_repo() doesn't exist test
tag_test "ensure_repo doesn't exist"
repo="not_exists"

ensure_repo ${test_region}
assert "equal" "${CALLED}" "1"
assert "equal" "${FAILURE_MESSAGE}" "" "should not have any failures"

# ensure_repo() cleanup
copy_func old_create_repo create_repo

# create_repo() test
tag_test "create_repo"
repo=repo
test_region=us-east-1
FAILURE_MESSAGE=""
CALLED=0

function aws() {
  if [ "${1}" != "ecr" ]; then
    FAILURE_MESSAGE="First argument must be ecr"
  elif [ "$2" != "create-repository" ]; then
    FAILURE_MESSAGE="Second argument must be create-repository"
  elif [ "$4" != "${test_region}" ]; then
    FAILURE_MESSAGE="Fourth argument must be region"
  elif [ "$6" != "repo" ]; then
    FAILURE_MESSAGE="Sixth argument must be repo"
  else
    CALLED=1
  fi
}

create_repo ${test_region}
assert "equal" "${FAILURE_MESSAGE}" "" "should not have any failures"
assert "equal" "${CALLED}" "1"

# image_exists() test
tag_test "image_exists"

function aws() {
  if [ ${4} == "us-east-1" ]; then
    echo "IMAGES"
  else
    echo "FAILURES"
  fi
}

repo=repo after=test image_exists us-east-1 ; assert "equal" "$?" "0" "finds existing image"
repo=repo after=test image_exists us-west-1 || assert "equal" "$?" "1" "finds no image"

function aws() {
  if [ ${8} == "imageTag=v1.0" ]; then
    echo "IMAGES"
  else
    echo "FAILURES"
  fi
}

repo=repo after=test image_exists us-east-1 v1.0 ; assert "equal" "$?" "0" "finds existing tagged image"
repo=repo after=test image_exists us-east-1 v2.0 || assert "equal" "$?" "1" "finds no tagged image"
repo=repo after=test image_exists us-east-1 || assert "equal" "$?" "1" "finds no tagged image"

# github_status() test
tag_test "github_status"
test_status="good"
test_description="clear"
status_url="https://api.github.com/repos/someone/stuff"
FAILURE_MESSAGE=""
CALLED=0

function curl() {
  if [ "${3}" != "POST" ]; then
    FAILURE_MESSAGE="Must be a POST request"
  elif [ "${7}" != "{\"state\":\"${test_status}\",\"description\":\"${test_description}\",\"context\":\"ecs-conex\"}" ]; then
    FAILURE_MESSAGE="Must post correct body"
  elif [ "${8}" != "${status_url}" ]; then
    FAILURE_MESSAGE="Must post to the status url"
  else
    CALLED=1
  fi
}

github_status ${test_status} ${test_description}
assert "equal" "${FAILURE_MESSAGE}" "" "should not have any failures"
assert "equal" "${CALLED}" "1"

# check_dockerfile() test
tag_test "check_dockerfile"
filepath="/fake/file/path"
log=$(check_dockerfile ${filepath})
assert "equal" "${log}" "no Dockerfile found"
assert "equal" "$?" "0"

filepath="ecs-conex.sh"
log=$(check_dockerfile ${filepath})
assert "equal" "${log}" ""

# check_receives() test
tag_test "check_receives"
ApproximateReceiveCount=3
check_receives && assert "equal" "$?" "0"

ApproximateReceiveCount=4
check_receives || assert "equal" "$?" "3"

# parse_message() test
tag_test "parse_message"
Message=$(cat ./test/fixtures/message.test.json)
GithubAccessToken=test
parse_message
assert "equal" "${status_url}" "https://api.github.com/repos/test/test/statuses/test?access_token=test"

# credentials() setup
tmpdocker=$(mktemp /tmp/dockerfile-XXXXXX)
tmpcreds=$(cat ./test/fixtures/creds.test.json)

function curl() {
  nullRole=$(printenv | grep nullRole | sed 's/.*=//')
  role=test_role

  if [[ "${nullRole}" == "1" ]]; then
    echo ""
  elif [[ "${2}" != *"${role}"* ]]; then
    echo ${role}
  else
    echo ${creds}
  fi
}

function write_dockerfile() {
  creds=$1
  echo "ARG NPMAccessToken" > ${tmpdocker}
  echo "ARG GithubAccessToken" >> ${tmpdocker}
  echo "ARG AWS_ACCESS_KEY_ID" >> ${tmpdocker}
  echo "ARG AWS_SECRET_ACCESS_KEY" >> ${tmpdocker}
  echo "ARG AWS_SESSION_TOKEN" >> ${tmpdocker}
}

function clear_dockerfile() {
  echo "" > ${tmpdocker}
}

# credentials() no npm token in env test
tag_test "credentials missing npm token in env"
export NPMAccessToken=""
write_dockerfile "${tmpcreds}"
credentials ${tmpdocker}
assert "doesNotContain" "${args}" "NPMAccessToken=${NPMAccessToken}"

# credentials() no npm token in dockerfile test
tag_test "credentials missing npm token in dockerfile"
export NPMAccessToken=test_NPMAccessToken
clear_dockerfile
credentials ${tmpdocker}
assert "doesNotContain" "${args}" "NPMAccessToken=${NPMAccessToken}"

# credentials() no github token in dockerfile test
tag_test "credentials missing github token in dockerfile"
export GithubAccessToken=test_GithubAccessToken
clear_dockerfile
credentials ${tmpdocker}
assert "doesNotContain" "${args}" "GithubAccessToken=${GithubAccessToken}"

# credentials() no role test
tag_test "credentials missing role"
export nullRole=1
write_dockerfile "${tmpcreds}"
credentials ${tmpdocker}
assert "equal" "${args}" "--build-arg NPMAccessToken=test_NPMAccessToken --build-arg GithubAccessToken=test_GithubAccessToken"

# credentials() role test
tag_test "credentials role"
export nullRole=""
write_dockerfile "${tmpcreds}"
credentials ${tmpdocker}
assert "contains" "${args}" "NPMAccessToken=${NPMAccessToken}"
assert "contains" "${args}" "GithubAccessToken=${GithubAccessToken}"
assert "contains" "${args}" "AWS_ACCESS_KEY_ID=$(node -e "console.log(${creds}.AccessKeyId)")"
assert "contains" "${args}" "AWS_SECRET_ACCESS_KEY=$(node -e "console.log(${creds}.SecretAccessKey)")"
assert "contains" "${args}" "AWS_SESSION_TOKEN=$(node -e "console.log(${creds}.SessionToken)")"

# credentials() missing build arguments in dockerfile test
tag_test "credentials missing build arguments in dockerfile"
clear_dockerfile
credentials ${tmpdocker}
assert "equal" "${args}" "" "should be empty"

# credentials() missing build arguments in creds test
tag_test "credentials missing build arguments in creds"
write_dockerfile "{}"
credentials ${tmpdocker}
assert "equal" "${args}" "--build-arg NPMAccessToken=test_NPMAccessToken --build-arg GithubAccessToken=test_GithubAccessToken"

# exact_match() test
tag_test "exact_match"
AccountId=1
region=us-east-1
repo=test

function git () {
  echo "test_tag"
}

function docker() {
  if [ ${1} == "tag" ]; then
    assert "equal" "${3}" "1.dkr.ecr.us-east-1.amazonaws.com/test:test_tag"
  elif [ ${1} == "push" ]; then
    assert "equal" "${2}" "1.dkr.ecr.us-east-1.amazonaws.com/test:test_tag"
  else
    FAILURE="Tried to push a tag that already exists"
  fi
}

FAILURE=""
log="$(exact_match)"
assert "equal" "$FAILURE" ""
assert "contains" "$log" "test_tag"

function git () {
  echo "v1.0"
}

FAILURE=""
log="$(exact_match)"
assert "equal" "$FAILURE" ""
assert "contains" "$log" ""

# ecr_cleanup()
tag_test "ecr_cleanup"
test_region="us-east-1"
test_repo="test-repo"
cleanup_location="./scripts"

function ecr_cleanup() {
  if [ ${1} != "${test_region}" ]; then
    echo "First argument must be region"
  elif [ ${2} != "${test_repo}" ]; then
    echo "Second argument must be repo"
  else
    echo "All good"
  fi
}

log=$(ecr_cleanup ${test_region} ${test_repo})
assert "equal" "${log}" "All good"

# docker_push() test
tag_test "docker_push"
sha_tag=""
regions=(us-east-1)
repo="test"
after="test"
FAILURE=""

function ensure_repo() {
  if [ "${1}" != "us-east-1" ]; then
    FAILURE="Region not passed into ensure_repo"
  fi
}

function login() {
  FAILURE="Should expect prior login"
}

function image_exists {
  return 1
}

function ecr_cleanup {
  if [ "${1}" != "us-east-1" ]; then
    FAILURE="Region not passed into ecr_cleanup"
  elif [ "${2}" != "test" ]; then
    FAILURE="Repository not passed into ecr_cleanup"
  fi
}

function after_image {
  if [ "${1}" != "us-east-1" ]; then
    FAILURE="Region not passed into after_image"
  else
    echo "some_after_image"
  fi
}

function docker() {
  if [ ${1} == "tag" ]; then
    assert "equal" "${3}" "some_after_image"
  elif [ ${1} == "push" ]; then
    assert "equal" "${2}" "some_after_image"
  else
    FAILURE="should call docker tag or docker push"
  fi
}

# export functions explicitly for parallel called from within docker_push
export -f assert passed failed docker

function git() {
  exit 1
}

log=$(docker_push)
assert "equal" "$?" "0"
assert "contains" "${log}" "pushing \"test\" to us-east-1"
assert "equal" "${FAILURE}" "" "should not have any failures"

# docker_push() test to region with existing images
function image_exists() {
  if [ "$1" == "us-west-2" ]; then
    return 0
  else
    return 1
  fi
}

regions=(us-east-1 us-west-2)
log=$(docker_push)
assert "equal" "$?" "0"
assert "contains" "${log}" "pushing \"test\" to us-east-1"
assert "contains" "${log}" "found existing image for \"test\" in us-west-2, skipping push"
assert "equal" "${FAILURE}" "" "should not have any failures"

# cleanup()
tag_test "cleanup"
tmpdir=$(mktemp -d /tmp/ecs-conex-test-XXXXXX)
Message=$(cat ./test/fixtures/message.test.json)
GithubAccessToken=test
status=""
message=""
FAILURE=""

function docker() {
  if [ ${1} == "images" ]; then
    assert "equal" "$*" "images -q test:test" "calls images with repo:tag" >&2
    echo "12345678"
  elif [ ${1} == "rmi" ]; then
    assert "equal" "$*" "rmi -f 12345678" "calls rmi with image ID" >&2
  else
    FAILURE="should call docker images or docker rmi"
  fi
}

function github_status() {
  github_status=$1
  github_message=$2
}

false || cleanup
assert "equal" "${github_status}" "failure"
assert "equal" "${github_message}" "ecs-conex failed to build an image"
assert "equal" "${FAILURE}" "" "should not have any failures"

function docker() {
  if [ ${1} == "images" ]; then
    assert "equal" "$*" "images -q test:test" "calls images with repo:tag" >&2
    echo ""
  else [ ${1} == "rmi" ];
    FAILURE="should call docker images only"
  fi
}

true
cleanup
assert "equal" "${github_status}" "success"
assert "equal" "${github_message}" "ecs-conex successfully completed"
assert "equal" "${FAILURE}" "" "should not have any failures"

if [ -d ${tmpdir} ]; then
  FAILURE="directory was not deleted"
  rm -rf ${tmpdir}
fi
assert "equal" "${FAILURE}" "" "should not have any failures"

# summary
summarize

if [[ ${FAILED} != 0 ]]; then
  exit 1
else
  exit 0
fi
