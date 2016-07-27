#!/usr/bin/env bash

set -eu
set -o pipefail

function after_image() {
  local region=$1
  local sha=${2:-${after}}
  echo ${AccountId}.dkr.ecr.${region}.amazonaws.com/${repo}:${sha}
}

function login() {
  local region=$1
  eval "$(aws ecr get-login --region ${region})"
}

function ensure_repo() {
  local region=$1
  aws ecr describe-repositories \
    --region ${region} \
    --repository-names ${repo} > /dev/null 2>&1 || create_repo ${region}
}

function create_repo() {
  local region=$1
  aws ecr create-repository \
    --region ${region} \
    --repository-name ${repo} > /dev/null
}

function github_status() {
  local status=$1
  local description=$2
  curl -s \
    --request POST \
    --header "Content-Type: application/json" \
    --data "{\"state\":\"${status}\",\"description\":\"${description}\",\"context\":\"ecs-conex\"}" \
    ${status_url} > /dev/null
}

function check_dockerfile() {
  filepath=$1
  if [ ! -f ${filepath} ]; then
    echo "no Dockerfile found"
    exit 0
  fi
}

function check_receives() {
  if [ $ApproximateReceiveCount -gt 3 ]; then
    echo "Job received $ApproximateReceiveCount times, aborting build"
    return 3
  fi
}

function parse_message() {
  ref=$(node -e "console.log(${Message}.ref);")
  after=$(node -e "console.log(${Message}.after);")
  repo=$(node -e "console.log(${Message}.repository.name);")
  owner=$(node -e "console.log(${Message}.repository.owner.name);")
  user=$(node -e "console.log(${Message}.pusher.name);")
  deleted=$(node -e "console.log(${Message}.deleted);")
  status_url="https://api.github.com/repos/${owner}/${repo}/statuses/${after}?access_token=${GithubAccessToken}"
}

function credentials() {
  filepath=${1}
  args=""

  NPMAccessToken=$(printenv | grep NPMAccessToken | sed 's/.*=//')
  if [[ -n $NPMAccessToken ]] && grep "ARG NPMAccessToken" ${filepath} > /dev/null 2>&1; then
    args+="--build-arg NPMAccessToken=${NPMAccessToken}"
  fi

  if [ ${MessageId} == "test" ]; then
    return
  fi

  role=$(curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/)
  if [[ -z $role ]]; then
    return
  fi

  creds=$(curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/${role})
  accessKeyId=$(node -e "console.log(${creds}.AccessKeyId)")
  secretAccessKey=$(node -e "console.log(${creds}.SecretAccessKey)")
  sessionToken=$(node -e "console.log(${creds}.SessionToken)")

  if [[ -n $accessKeyId ]] && [[ $accessKeyId != "undefined" ]] && grep "ARG AWS_ACCESS_KEY_ID" ${filepath} > /dev/null 2>&1; then
    args+=" --build-arg AWS_ACCESS_KEY_ID=${accessKeyId}"
  fi

  if [[ -n $secretAccessKey ]] && [[ $secretAccessKey != "undefined" ]] && grep "ARG AWS_SECRET_ACCESS_KEY" ${filepath} > /dev/null 2>&1; then
    args+=" --build-arg AWS_SECRET_ACCESS_KEY=${secretAccessKey}"
  fi

  if [[ -n $sessionToken ]] && [[ $sessionToken != "undefined" ]] && grep "ARG AWS_SESSION_TOKEN" ${filepath} > /dev/null 2>&1; then
    args+=" --build-arg AWS_SESSION_TOKEN=${sessionToken}"
  fi
}

function exact_match() {
  if git describe --tags --exact-match 2> /dev/null; then
    tag="$(git describe --tags --exact-match)"
    echo "pushing ${tag} to ${region}"
    docker tag -f ${repo}:${after} "$(after_image ${region} ${tag})"
    docker push "$(after_image ${region} ${tag})"
  fi
}

function docker_push() {
  for region in "${regions[@]}"; do
    ensure_repo ${region}
    login ${region}

    if docker pull "$(after_image ${region})" 2> /dev/null; then
      echo "found existing image for ${after} in ${region}, skipping push"
      continue
    fi

    echo "pushing ${after} to ${region}"
    docker tag -f ${repo}:${after} "$(after_image ${region})"
    docker push "$(after_image ${region})"
    exact_match
  done
}

function cleanup() {
  exit_code=$?

  parse_message

  if [ "${exit_code}" == "0" ]; then
    github_status "success" "ecs-conex successfully completed"
  else
    github_status "failure" "ecs-conex failed to build an image"
  fi

  rm -rf ${tmpdir}

  if docker inspect ${repo}:${after} > /dev/null; then
    docker rmi ${repo}:${after}
  fi
}
