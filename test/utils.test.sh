#!/usr/bin/env bash

set -eu
source utils.sh

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
  echo FAILED \${args} contains \${NPMToken}
fi
echo "${dockerfile}" > /tmp/Dockerfile.test

# test credentials (no role)
export nullRole=1
credentials /tmp/Dockerfile.test
if [[ ${args} == "--build-arg NPMToken=test_NPMToken" ]]; then
  echo PASSED \${args} should only contain \${NPMToken}
else
  echo FAILED \${args} does not only contain \${NPMToken}
fi

# test credentials (role)
export nullRole=""
credentials /tmp/Dockerfile.test

if [[ ${args} != *"NPMToken=${NPMToken}"* ]]; then
  echo FAILED \${args} does not contain \${NPMToken}
else
  echo PASSED \${args} should only contain \${NPMToken}
fi

if [[ ${args} != *"AWS_ACCESS_KEY_ID=$(node -e "console.log(${creds}.AccessKeyId)")"* ]]; then
  echo FAILED \${args} does not contain \${AWS_ACCESS_KEY_ID}
else
  echo PASSED \${args} should contain \${AWS_ACCESS_KEY_ID}
fi

if [[ ${args} != *"AWS_SECRET_ACCESS_KEY=$(node -e "console.log(${creds}.SecretAccessKey)")"* ]]; then
  echo FAILED \${args} does not contain \${AWS_SECRET_ACCESS_KEY}
else
  echo PASSED \${args} should contain \${AWS_SECRET_ACCESS_KEY}
fi

if [[ ${args} != *"AWS_SESSION_TOKEN=$(node -e "console.log(${creds}.SessionToken)")"* ]]; then
  echo FAILED \${args} does not contain \${AWS_SESSION_TOKEN}
else
  echo PASSED \${args} should contain \${AWS_SECRET_ACCESS_KEY}
fi

# test credentials (missing npm arguments in dockerfile)
dockerfile=$(cat /tmp/Dockerfile.test)
echo "" > /tmp/Dockerfile.test
credentials /tmp/Dockerfile.test
if [[ -n $args ]]; then
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
  echo FAILED \${args} does not only contain \${NPMToken}
fi
