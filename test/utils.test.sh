#!/usr/bin/env bash

set -eu
source $(dirname $0)/../utils.sh
source $(dirname $0)/lib/utils.sh
FAILED=0
PASSED=0

# initialize test id counter
testId=0

# before_image() test
tag_test "before_image()"
export AccountId=1
export repo=repo
export before=1
export after=2

log=$(before_image us-east-1)
expected="1.dkr.ecr.us-east-1.amazonaws.com/repo:1"
assert "equal" "${log}" "${expected}"

# after_image() 1 param test
tag_test "after_image() with 1 param"
export AccountId=1
export repo=repo
export before=1
export after=2

log=$(after_image us-east-1)
expected="1.dkr.ecr.us-east-1.amazonaws.com/repo:2"
assert "equal" "${log}" "${expected}"

# after_image() 2 param test
tag_test "after_image() with 2 params"
export AccountId=1
export repo=repo
export before=1
export after=2

log=$(after_image us-east-1 v1.0.0)
expected="1.dkr.ecr.us-east-1.amazonaws.com/repo:v1.0.0"
assert "equal" "${log}" "${expected}"

# login() test
tag_test "login()"
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
tag_test "ensure_repo() exists"
repo=exists

ensure_repo ${test_region}
assert "equal" "${CALLED}" "0"
assert "equal" "${FAILURE_MESSAGE}" "" "should not have any failures"

# ensure_repo() doesn't exist test
tag_test "ensure_repo() doesn't exist"
repo="not_exists"

ensure_repo ${test_region}
assert "equal" "${CALLED}" "1"
assert "equal" "${FAILURE_MESSAGE}" "" "should not have any failures"

# ensure_repo() cleanup
copy_func old_create_repo create_repo

# create_repo() test
tag_test "create_repo()"
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

# github_status() test
tag_test "github_status()"
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
tag_test "check_dockerfile()"
filepath="/fake/file/path"
log=$(check_dockerfile ${filepath})
assert "equal" "${log}" "no Dockerfile found"
assert "equal" "$?" "0"

filepath="ecs-conex.sh"
log=$(check_dockerfile ${filepath})
assert "equal" "${log}" ""

# check_receives() test
tag_test "check_receives()"
ApproximateReceiveCount=3
check_receives && assert "equal" "$?" "0"

ApproximateReceiveCount=4
check_receives || assert "equal" "$?" "3"

# parse_message() test
tag_test "parse_message()"
Message=$(cat ./test/fixtures/message.test.json)
GithubAccessToken=test
parse_message
assert "equal" "${status_url}" "https://api.github.com/repos/test/test/statuses/test?access_token=test"

# credentials() setup
tmpdocker=$(mktemp /tmp/dockerfile-XXXXXX)
tmpcreds=$(cat ./test/fixtures/creds.test.json)
MessageId=not_test

function curl () {
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
  echo "ARG NPMToken" > ${tmpdocker}
  echo "ARG AWS_ACCESS_KEY_ID" >> ${tmpdocker}
  echo "ARG AWS_SECRET_ACCESS_KEY" >> ${tmpdocker}
  echo "ARG AWS_SESSION_TOKEN" >> ${tmpdocker}
}

function clear_dockerfile() {
  echo "" > ${tmpdocker}
}

# credentials() no npm token in env test
tag_test "credentials() missing npm token in env"
export NPMToken=""
write_dockerfile "${tmpcreds}"
credentials ${tmpdocker}
assert "doesNotContain" "${args}" "NPMToken=${NPMToken}"

# credentials() no npm token in dockerfile test
tag_test "credentials() missing npm token in dockerfile"
export NPMToken=test_NPMToken
clear_dockerfile
credentials ${tmpdocker}
assert "doesNotContain" "${args}" "NPMToken=${NPMToken}"

# credentials() no role test
tag_test "credentials() missing role"
export nullRole=1
write_dockerfile "${tmpcreds}"
credentials ${tmpdocker}
assert "equal" "${args}" "--build-arg NPMToken=test_NPMToken"

# credentials() role test
tag_test "credentials() role"
export nullRole=""
write_dockerfile "${tmpcreds}"
credentials ${tmpdocker}
assert "contains" "${args}" "NPMToken=${NPMToken}"
assert "contains" "${args}" "AWS_ACCESS_KEY_ID=$(node -e "console.log(${creds}.AccessKeyId)")"
assert "contains" "${args}" "AWS_SECRET_ACCESS_KEY=$(node -e "console.log(${creds}.SecretAccessKey)")"
assert "contains" "${args}" "AWS_SESSION_TOKEN=$(node -e "console.log(${creds}.SessionToken)")"

# credentials() missing build arguments in dockerfile test
tag_test "credentials() missing build arguments in dockerfile"
clear_dockerfile
credentials ${tmpdocker}
assert "equal" "${args}" "" "should be empty"

# credentials() missing build arguments in creds test
tag_test "credentials() missing build arguments in creds"
write_dockerfile "{}"
credentials ${tmpdocker}
assert "equal" "${args}" "--build-arg NPMToken=test_NPMToken"

# exact_match() test
region=us-east-1
repo=test
FAILURE=""

function git () {
  echo "test_tag"
}

function after_image {
  if [ "${1}" != "us-east-1" ]; then
    FAILURE="Region not passed into after_image"
  elif [ "${2}" != "test_tag" ]; then
    FAILURE="Tag not passed into after_image"
  else
    echo "some_after_image"
  fi
}

function docker() {
  if [ ${1} == "tag" ]; then
    assert "equal" "${4}" "some_after_image"
  elif [ ${1} == "push" ]; then
    assert "equal" "${2}" "some_after_image"
  else
    FAILURE="should call docker tag or docker push"
  fi
}

exact_match
assert "equal" "${FAILURE}" ""

# docker_push() test
regions=(us-east-1)
repo=test
after=test
FAILURE=""

function ensure_repo() {
  if [ "${1}" != "us-east-1" ]; then
    FAILURE="Region not passed into ensure_repo"
  fi
}

function login() {
  if [ "${1}" != "us-east-1" ]; then
    FAILURE="Region not passed into login"
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
    assert "equal" "${4}" "some_after_image"
  elif [ ${1} == "push" ]; then
    assert "equal" "${2}" "some_after_image"
  else
    FAILURE="should call docker tag or docker push"
  fi
}

function git() {
  exit 1
}

function exact_match() {
  assert "equal" "${FAILURE}" ""
}

docker_push

# cleanup()
tag_test "cleanup()"
tmpdir=$(mktemp -d /tmp/ecs-conex-test-XXXXXX)
Message=$(cat ./test/fixtures/message.test.json)
GithubAccessToken=test
status=""
message=""
FAILURE=""

function github_status() {
  github_status=$1
  github_message=$2
}

cleanup 1
assert "equal" "${github_status}" "failure"
assert "equal" "${github_message}" "ecs-conex failed to build an image"

cleanup 0
assert "equal" "${github_status}" "success"
assert "equal" "${github_message}" "ecs-conex successfully completed"

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
