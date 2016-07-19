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

test
if [ "${log}" != "${expected}" ]; then
  failed "should be equal" "${expected}" "${log}"
else
  passed "should be equal"
fi

# after_image() 1 param test
tag_test "after_image() with 1 param"
export AccountId=1
export repo=repo
export before=1
export after=2

log=$(after_image us-east-1)
expected="1.dkr.ecr.us-east-1.amazonaws.com/repo:2"

test
if [ "${log}" != "${expected}" ]; then
  failed "should be equal" "${expected}" "${log}"
else
  passed "should be equal"
fi

# after_image() 2 param test
tag_test "after_image() with 2 params"
export AccountId=1
export repo=repo
export before=1
export after=2

log=$(after_image us-east-1 v1.0.0)
expected="1.dkr.ecr.us-east-1.amazonaws.com/repo:v1.0.0"

test
if [ "${log}" != "${expected}" ]; then
  failed "should be equal" "${expected}" "${log}"
else
  passed "should be equal"
fi

# login() test
tag_test "login()"
test_region=us-east-1

function aws() {
  if [ "${1}" != "ecr" ]; then
    echo "First argument must be ecr"
  else
    if [ "${2}" != "get-login" ]; then
      echo "Second argument must be get-login"
    else
      if [ "${4}" != "${test_region}" ]; then
        echo "Fourth argument must be region"
      else
        echo "All good"
      fi
    fi
  fi
}

function eval() {
  echo $1
}

log=$(login ${test_region})
expected="All good"

test
if [ "${log}" != "${expected}" ]; then
  failed "should be equal" "${expected}" "${log}"
else
  passed "should be equal"
fi

# # ensure_repo() setup
# copy_func create_repo old_create_repo
# test_region=us-east-1
# FAILURE_MESSAGE=""
# CALLED=0
#
# function aws() {
#   if [ "${1}" != "ecr" ]; then
#     FAILURE_MESSAGE="First argument must be ecr"
#   else
#     if [ "${2}" != "describe-repositories" ]; then
#       FAILURE_MESSAGE="Second argument must be describe-repositories"
#     else
#       if [ "${4}" != "${test_region}" ]; then
#         FAILURE_MESSAGE="Fourth argument must be region"
#       else
#         if [ "${6}" == "exists" ]; then
#           return 0
#         elif [ "${6}" == "not_exists" ]; then
#           return 1
#         fi
#       fi
#     fi
#   fi
# }
#
# function create_repo() {
#   CALLED=1
# }
#
# # ensure_repo() exists test
# tag_test "ensure_repo() exists"
# repo=exists
#
# ensure_repo ${test_region}
#
# test
# if [ "${CALLED}" != 0 ]; then
#   failed "should be equal" "0" "${CALLED}"
# else
#   passed "should be equal"
# fi
#
# test
# if [ "${FAILURE_MESSAGE}" != "" ]; then
#   failed "should not have any failures" "" "${FAILURE_MESSAGE}"
# else
#   passed "should not have any failures"
# fi
#
# # ensure_repo() doesn't exist test
# tag_test "ensure_repo() doesn't exist"
# repo="not_exists"
#
# ensure_repo ${test_region}
#
# test
# if [ "${CALLED}" != "1" ]; then
#   failed "should be equal" "1" "${CALLED}"
# else
#   passed "should be equal"
# fi
#
# test
# if [ "${FAILURE_MESSAGE}" != "" ]; then
#   failed "should not have any failures" "" "${FAILURE_MESSAGE}"
# else
#   passed "should not have any failures"
# fi
#
# # ensure_repo() cleanup
# copy_func old_create_repo create_repo

# create_repo() test
tag_test "create_repo()"
repo=repo
test_region=us-east-1
FAILURE_MESSAGE=""
CALLED=0

function aws() {
  if [ "${1}" != "ecr" ]; then
    FAILURE_MESSAGE="First argument must be ecr"
  else
    if [ "$2" != "create-repository" ]; then
      FAILURE_MESSAGE="Second argument must be create-repository"
    else
      if [ "$4" != "${test_region}" ]; then
        FAILURE_MESSAGE="Fourth argument must be region"
      else
        if [ "$6" != "repo" ]; then
          FAILURE_MESSAGE="Sixth argument must be repo"
        else
          CALLED=1
        fi
      fi
    fi
  fi
}

create_repo ${test_region}

test
if [ "${FAILURE_MESSAGE}" != "" ]; then
  failed "should not have any failures" "" "${FAILURE_MESSAGE}"
else
  passed "should not have any failures"
fi

test
if [ "${CALLED}" != 1 ]; then
  failed "should be equal" "1" "${CALLED}"
else
  passed "should be equal"
fi

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
  else
    if [ "${7}" != "{\"state\":\"${test_status}\",\"description\":\"${test_description}\",\"context\":\"ecs-conex\"}" ]; then
      FAILURE_MESSAGE="Must post correct body"
    else
      if [ "${8}" != "${status_url}" ]; then
        FAILURE_MESSAGE="Must post to the status url"
      else
        CALLED=1
      fi
    fi
  fi
}

github_status ${test_status} ${test_description}

test
if [ "${FAILURE_MESSAGE}" != "" ]; then
  failed "should not have any failures" "" "${FAILURE_MESSAGE}"
else
  passed "should not have any failures"
fi

test
if [ "${CALLED}" != 1 ]; then
  failed "should be equal" "1" "${CALLED}"
else
  passed "should be equal"
fi

# parse_message() test
tag_test "parse_message()"
Message=$(cat ./test/fixtures/message.test.json)
GithubAccessToken=test
parse_message

test
if [[ ${status_url} != "https://api.github.com/repos/test/test/statuses/test?access_token=test" ]]; then
  failed "should be equal" "https://api.github.com/repos/test/test/statuses/test?access_token=test" "${status_url}"
else
  passed "should be equal"
fi

# credentials() (setup)
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

export NPMToken=""
creds=$(cat ./test/fixtures/creds.test.json)
echo "ARG NPMToken" > /tmp/Dockerfile.test
echo "ARG AWS_ACCESS_KEY_ID" >> /tmp/Dockerfile.test
echo "ARG AWS_SECRET_ACCESS_KEY" >> /tmp/Dockerfile.test
echo "ARG AWS_SESSION_TOKEN" >> /tmp/Dockerfile.test

# credentials() no npm token in env test
tag_test "credentials() missing npm token in env"

credentials /tmp/Dockerfile.test

test
if [[ ${args} == *"NPMToken=${NPMToken}"* ]]; then
  failed "args should not contain NPM token" "false" "true"
else
  passed "args should not contain NPM token"
fi

# credentials() no npm token in dockerfile test
tag_test "credentials() missing npm token in dockerfile"
export NPMToken=test_NPMToken
dockerfile=$(cat /tmp/Dockerfile.test)
echo "" > /tmp/Dockerfile.test

credentials /tmp/fakeDockerfile.test

test
if [[ ${args} == *"NPMToken=${NPMToken}"* ]]; then
  failed "args should not contain NPM token" "false" "true"
else
  passed "args should not contain NPM token"
fi
echo "${dockerfile}" > /tmp/Dockerfile.test

# credentials() no role test
tag_test "credentials() missing role"
export nullRole=1

credentials /tmp/Dockerfile.test

test
if [[ ${args} != "--build-arg NPMToken=test_NPMToken" ]]; then
  failed "args should only contain NPM token" "true" "false"
else
  passed "args should only contain NPM token"
fi

# credentials() role test
tag_test "credentials() role"
export nullRole=""

credentials /tmp/Dockerfile.test

test
if [[ ${args} != *"NPMToken=${NPMToken}"* ]]; then
  failed "args should contain NPM token" "true" "false"
else
  passed "args should contain NPM token"
fi

test
if [[ ${args} != *"AWS_ACCESS_KEY_ID=$(node -e "console.log(${creds}.AccessKeyId)")"* ]]; then
  failed "args should contain AWS Access Key ID" "true" "false"
else
  passed "args should contain AWS Access Key ID"
fi

test
if [[ ${args} != *"AWS_SECRET_ACCESS_KEY=$(node -e "console.log(${creds}.SecretAccessKey)")"* ]]; then
  failed "args should contain AWS Secret Access Key" "true" "false"
else
  passed "args should contain AWS Secret Access Key"
fi

test
if [[ ${args} != *"AWS_SESSION_TOKEN=$(node -e "console.log(${creds}.SessionToken)")"* ]]; then
  failed "args should contain AWS Session Token" "true" "false"
else
  passed "args should contain AWS Session Token"
fi

# credentials() missing build arguments in dockerfile test
tag_test "credentials() missing build arguments in dockerfile"
dockerfile=$(cat /tmp/Dockerfile.test)
echo "" > /tmp/Dockerfile.test

credentials /tmp/Dockerfile.test

test
if [[ -n $args ]]; then
  failed "args should be empty" "true" "false"
else
  passed "args should be empty"
fi
echo "${dockerfile}" > /tmp/Dockerfile.test

# credentials() missing build arguments in creds test
tag_test "credentials() missing build arguments in creds"
creds="{}"

credentials /tmp/Dockerfile.test

test
if [[ ${args} != "--build-arg NPMToken=test_NPMToken" ]]; then
  failed "args should only contain npm token" "true" "false"
else
  passed "args should only contain npm token"
fi

# summary
summarize
