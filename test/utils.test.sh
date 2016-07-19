#!/usr/bin/env bash

set -eu
source $(dirname $0)/../utils.sh
source $(dirname $0)/lib/utils.sh
FAILED=0

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
        echo "Must pass in region to aws ecr"
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

if [ "${log}" != "${expected}" ]; then
  failed "should be equal" "${expected}" "${log}"
else
  passed "should be equal"
fi

# ensure_repo() setup
copy_func create_repo old_create_repo
test_region=us-east-1
FAILURE=0

function aws() {
  if [ "${1}" != "ecr" ]; then
    echo "First argument must be ecr"
    FAILURE=1
  else
    if [ "${2}" != "describe-repositories" ]; then
      echo "Second argument must be describe-repositories"
      FAILURE=1
    else
      if [ "${4}" != "${test_region}" ]; then
        echo "Must pass in region to aws ecr"
        FAILURE=1
      else
        if [ "${6}" == "not_exists" ]; then
          return 1
        elif [ "${6}" == "exists" ]; then
          return 2
        fi
      fi
    fi
  fi
}

function create_repo() {
  echo "called create_repo"
}

# ensure_repo() exists test
tag_test "ensure_repo() exists"
repo=exists

log=$(ensure_repo ${test_region})
if [ "${log}" == "called create_repo" ]; then
  failed "should not be equal" "undefined" ${log}
elif [ "${FAILURE}" != 0 ]; then
  failed "should not have any failures" "" ${FAILURE}
else
  passed "repo should exist"
fi

# ensure_repo() doesn't exist
tag_test "ensure_repo() doesn't exist"
export repo="not_exists"

log=$(ensure_repo ${region})
expected="called create_repo"
if [ "${log}" != "${expected}" ]; then
  failed "should be equal" ${expected} ${log}
elif [ "${FAILURE}" != "" ]; then
  failed "should not have any failures" "" ${FAILURE}
else
  passed "repo should not exist"
fi

copy_func old_create_repo create_repo

# create_repo()
tag_test "create_repo()"
export repo=repo
export region=us-east-1
export FAILURE=""
export CALLED=0
function aws() {
  if [ "$1" != "ecr" ]; then
    failed "should be equal" "ecr" $1
  else
    if [ "$2" != "create-repository" ]; then
      failed "should be equal" "create-repository" $2
    else
      if [ "$4" != "${region}" ]; then
        failed "should be equal" ${region} ${4}
      else
        if [ "$6" != "repo" ]; then
          failed "should be equal" "repo" ${6}
        else
          CALLED=1
        fi
      fi
    fi
  fi
}

log=$(create_repo ${region})
if [ "${log}" != "" ]; then
  failed "should not have a log" "" ${log}
elif [ "${FAILURE}" != "" ]; then
  failed "should not have any failures" "" ${FAILURE}
elif [ "${CALLED}" != 0 ]; then
  failed "should be equal" "0" ${CALLED}
else
  passed "repo should be created"
fi



# # github_status()
# tag_test "github_status()"
# status="good"
# description="clear"
# status_url="https://api.github.com/repos/someone/stuff"
# FAILURE=""
# CALLED=""
#
# function curl() {
#   echo "hi"
  # if [ "$3" != "POST" ]; then
  #   message="should be POST request"
  #   failed ${message} "POST" ${3}
  #   FAILURE=${message}
  # else
  #   if [ "$7" != "{\"state\":\"${status}\",\"description\":\"${description}\",\"context\":\"ecs-conex\"}" ]; then
  #     FAILED=1
  #     FAILURE="Must post correct body"
  #   else
  #     if [ "$8" != "${status_url}" ]; then
  #       FAILED=1
  #       FAILURE="Must post to the status url"
  #     else
  #       CALLED=1
  #     fi
  #   fi
  # fi
# }

# log=$(github_status ${status} ${description})
# github_status ${status} ${description}
# if [ "${log}" != "sending ${status} status to github" ] || [ "${FAILURE}" != "" ] || [ "${CALLED}" != 0 ]; then
#   FAILED=1
#   echo "FAILED github_status()"
# else
#   echo "PASSED github_status()"
# fi



# test parse_message
Message=$(cat ./test/fixtures/message.test.json)
GithubAccessToken=test
parse_message
if [[ ${status_url} != "https://api.github.com/repos/test/test/statuses/test?access_token=test" ]]; then
  echo FAILED \${Message} parsed incorrectly
else
  echo PASSED \${Message} parsed correctly
fi

# test credentials (setup)

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

# set up
export NPMToken=""
creds=$(cat ./test/fixtures/creds.test.json)
echo "ARG NPMToken" > /tmp/Dockerfile.test
echo "ARG AWS_ACCESS_KEY_ID" >> /tmp/Dockerfile.test
echo "ARG AWS_SECRET_ACCESS_KEY" >> /tmp/Dockerfile.test
echo "ARG AWS_SESSION_TOKEN" >> /tmp/Dockerfile.test

# test credentials (missing npm token in env)
credentials /tmp/Dockerfile.test
if [[ ${args} != *"NPMToken=${NPMToken}"* ]]; then
  echo PASSED \${args} should not contain \${NPMToken}
else
  FAILED=1
  echo FAILED \${args} contains \${NPMToken}
fi

# test credentials (missing npm token in dockerfile)
export NPMToken=test_NPMToken
dockerfile=$(cat /tmp/Dockerfile.test)
echo "" > /tmp/Dockerfile.test
credentials /tmp/fakeDockerfile.test
if [[ ${args} != *"NPMToken=${NPMToken}"* ]]; then
  echo PASSED \${args} should not contain \${NPMToken}
else
  FAILED=1
  echo FAILED \${args} contains \${NPMToken}
fi
echo "${dockerfile}" > /tmp/Dockerfile.test

# test credentials (no role)
export nullRole=1
credentials /tmp/Dockerfile.test
if [[ ${args} == "--build-arg NPMToken=test_NPMToken" ]]; then
  echo PASSED \${args} should only contain \${NPMToken}
else
  FAILED=1
  echo FAILED \${args} does not only contain \${NPMToken}
fi

# test credentials (role)
export nullRole=""
credentials /tmp/Dockerfile.test

if [[ ${args} != *"NPMToken=${NPMToken}"* ]]; then
  FAILED=1
  echo FAILED \${args} does not contain \${NPMToken}
else
  echo PASSED \${args} should only contain \${NPMToken}
fi

if [[ ${args} != *"AWS_ACCESS_KEY_ID=$(node -e "console.log(${creds}.AccessKeyId)")"* ]]; then
  FAILED=1
  echo FAILED \${args} does not contain \${AWS_ACCESS_KEY_ID}
else
  echo PASSED \${args} should contain \${AWS_ACCESS_KEY_ID}
fi

if [[ ${args} != *"AWS_SECRET_ACCESS_KEY=$(node -e "console.log(${creds}.SecretAccessKey)")"* ]]; then
  FAILED=1
  echo FAILED \${args} does not contain \${AWS_SECRET_ACCESS_KEY}
else
  echo PASSED \${args} should contain \${AWS_SECRET_ACCESS_KEY}
fi

if [[ ${args} != *"AWS_SESSION_TOKEN=$(node -e "console.log(${creds}.SessionToken)")"* ]]; then
  FAILED=1
  echo FAILED \${args} does not contain \${AWS_SESSION_TOKEN}
else
  echo PASSED \${args} should contain \${AWS_SECRET_ACCESS_KEY}
fi

# test credentials (missing npm arguments in dockerfile)
dockerfile=$(cat /tmp/Dockerfile.test)
echo "" > /tmp/Dockerfile.test
credentials /tmp/Dockerfile.test
if [[ -n $args ]]; then
  FAILED=1
  echo FAILED \${args} contains unexpected build arguments
else
  echo PASSED \${args} should not contain build arguments
fi
echo "${dockerfile}" > /tmp/Dockerfile.test

# test credentials (missing npm arguments in creds)
creds="{}"
credentials /tmp/Dockerfile.test
if [[ ${args} == "--build-arg NPMToken=test_NPMToken" ]]; then
  echo PASSED \${args} should only contain \${NPMToken}
else
  FAILED=1
  echo FAILED \${args} does not only contain \${NPMToken}
fi

if [ ${FAILED} == 1 ]
then
  echo "TESTS FAILED"
else
  echo "TESTS PASSED"
fi
