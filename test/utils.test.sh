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
function aws() {
  if [ "$1" != "ecr" ]; then
    FAILED=1
    echo "echo \"First argument must be ecr\""
  else
    if [ "$2" != "get-login" ]; then
      FAILED=1
      echo "echo \"Second argument must be get-login\""
    else
      echo "echo \"all good\""
    fi
  fi
}
log=$(login us-east-1)
if [ "${log}" != "all good" ]; then
  FAILED=1
  echo "FAILED login()"
else
  echo "PASSED login()"
fi
alias aws='oldaws'

if [ ${FAILED} == 1 ]
then
  echo "TESTS FAILED"
else
  echo "TESTS PASSED"
fi
