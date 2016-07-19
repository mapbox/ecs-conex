#!/usr/bin/env bash

set -eu
source $(dirname $0)/../utils.sh
FAILED=0

# test credentials

# mock curl function
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

# before_image()
export AccountId=1
export repo=repo
export before=1
export after=2
log=$(before_image us-east-1)
if [ "${log}" != "1.dkr.ecr.us-east-1.amazonaws.com/repo:1" ]; then
  FAILED=1
  echo "FAILED before_image"
else
  echo "PASSED before_image"
fi

# after_image() 1 param
export AccountId=1
export repo=repo
export before=1
export after=2
log=$(after_image us-east-1)
if [ "${log}" != "1.dkr.ecr.us-east-1.amazonaws.com/repo:2" ]; then
  FAILED=1
  echo "FAILED after_image() 1 param"
else
  echo "PASSED before_image() 1 param"
fi

# after_image() 2 param
export AccountId=1
export repo=repo
export before=1
export after=2
log=$(after_image us-east-1 v1.0.0)
if [ "${log}" != "1.dkr.ecr.us-east-1.amazonaws.com/repo:v1.0.0" ]; then
  FAILED=1
  echo "FAILED after_image() 2 param"
else
  echo "PASSED before_image() 2 param"
fi

# login()
alias oldaws='aws'
export region=us-east-1
function aws() {
  if [ "$1" != "ecr" ]; then
    FAILED=1
    echo "echo \"First argument must be ecr\""
  else
    if [ "$2" != "get-login" ]; then
      FAILED=1
      echo "echo \"Second argument must be get-login\""
    else
      if [ "$4" != "${region}" ]; then
        FAILED=1
        echo "echo \"Must pass in region to aws ecr\""
      else
        echo "echo \"all good\""
      fi
    fi
  fi
}
log=$(login ${region})
if [ "${log}" != "all good" ]; then
  FAILED=1
  echo "FAILED login()"
else
  echo "PASSED login()"
fi
alias aws='oldaws'

# ensure_repo()
alias oldaws='aws'
eval "$(echo "old_create_repo()"; declare -f create_repo | tail -n +2)"
export region=us-east-1
export FAILURE=""
function aws() {
  if [ "$1" != "ecr" ]; then
    FAILED=1
    FAILURE="First argument must be ecr"
  else
    if [ "$2" != "describe-repositories" ]; then
      FAILED=1
      FAILURE="Second argument must be describe-repositories"
    else
      if [ "$4" != "${region}" ]; then
        FAILED=1
        FAILURE="Must pass in region to aws ecr"
      else
        if [ "$6" == "exists" ]; then
          return 0
        elif [ "$6" == "not_exists" ]; then
          return 1
        fi
      fi
    fi
  fi
}
function create_repo() {
  echo "called create_repo"
}

# ensure_repo() exists
export repo=exists
log=$(ensure_repo ${region})
if [ "${log}" == "called create_repo" ] || [ "${FAILURE}" != "" ]; then
  FAILED=1
  echo "FAILED ensure_repo() exists"
else
  echo "PASSED ensure_repo() exists"
fi

# ensure_repo() doesn't exist
export repo="not_exists"
log=$(ensure_repo ${region})
if [ "${log}" != "called create_repo" ] || [ "${FAILURE}" != "" ]; then
  FAILED=1
  echo "FAILED ensure_repo() does not exist"
else
  echo "PASSED ensure_repo() does not exist"
fi
alias aws='oldaws'
eval "$(echo "create_repo()"; declare -f old_create_repo | tail -n +2)"

# create_repo()
export repo=repo
export region=us-east-1
export FAILURE=""
export CALLED=0
alias oldaws='aws'
function aws() {
  if [ "$1" != "ecr" ]; then
    FAILED=1
    FAILURE="First argument must be ecr"
  else
    if [ "$2" != "create-repository" ]; then
      FAILED=1
      FAILURE="Second argument must be describe-repositories"
    else
      if [ "$4" != "${region}" ]; then
        FAILED=1
        FAILURE="Must pass in region to aws ecr"
      else
        if [ "$6" != "repo" ]; then
          FAILED=1
          FAILURE="Must pass in repo to aws ecr"
        else
          CALLED=1
        fi
      fi
    fi
  fi
}
log=$(create_repo ${region})
if [ "${log}" != "" ] || [ "${FAILURE}" != "" ] || [ "${CALLED}" != 0 ]; then
  FAILED=1
  echo "FAILED create_repo()"
else
  echo "PASSED create_repo()"
fi
alias aws='oldaws'

# github_status()
export status="good"
export description="all clear"
export status_url="https://api.github.com/repos/someone/stuff"
eval "$(echo "old_curl()"; declare -f curl | tail -n +2)"
function curl() {
  if [ "$3" != "POST" ]; then
    FAILED=1
    FAILURE="Must be POST request"
  else
    if [ "$7" != "{\"state\":\"${status}\",\"description\":\"${description}\",\"context\":\"ecs-conex\"}" ]; then
      FAILED=1
      FAILURE="Must post correct body"
    else
      if [ "$8" != "${status_url}" ]; then
        FAILED=1
        FAILURE="Must post to the status url"
      else
        CALLED=1
      fi
    fi
  fi
}
log=$(github_status ${status} ${description})
eval "$(echo "curl()"; declare -f old_curl | tail -n +2)"
if [ "${log}" != "sending ${status} status to github" ] || [ "${FAILURE}" != "" ] || [ "${CALLED}" != 0 ]; then
  FAILED=1
  echo "FAILED github_status()"
else
  echo "PASSED github_status()"
fi


if [ ${FAILED} == 1 ]
then
  echo "TESTS FAILED"
else
  echo "TESTS PASSED"
fi
