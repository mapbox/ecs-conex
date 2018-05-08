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
  eval "$(aws ecr get-login --region ${region} --no-include-email)" || \
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

function image_exists() {
  local region=$1
  local imgtag=${2:-${after}}
  aws ecr batch-get-image \
    --region ${region} \
    --repository-name ${repo} \
    --image-ids imageTag=${imgtag} \
    --output text | grep -q IMAGES
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


  GithubAccessToken=$(printenv | grep GithubAccessToken | sed 's/.*=//')
  if grep "ARG GithubAccessToken" ${filepath} > /dev/null 2>&1; then
    args+=" --build-arg GithubAccessToken=${GithubAccessToken}"
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
    local tag="$(git describe --tags --exact-match)"
    if image_exists ${region} ${tag}; then
      echo "found existing image for ${tag} in ${region}, skipping push" >&2
    else
      echo "pushing ${tag} to ${region}" >&2
      docker tag ${repo}:${after} "$(after_image ${region} ${tag})"
      echo "$(after_image ${region} ${tag})"
    fi
  fi
}

function ecr_logins() {
  local regions=$1
  for region in "$@"; do
    login ${region}
  done
}

function docker_push() {
  local queue=""

  for region in "${regions[@]}"; do
    ensure_repo ${region}

    # tag + add current image to queue by exact tag match (omitted if no exact match)
    queue="${queue} $(exact_match)"

    if image_exists ${region}; then
      echo "found existing image for ${after} in ${region}, skipping push"
      continue
    fi

    echo "pushing ${after} to ${region}"

    # tag + add current image to queue by gitsha
    docker tag ${repo}:${after} "$(after_image ${region})"
    queue="${queue} $(after_image ${region})"
  done

  parallel docker push {} ::: $queue
}

function bucket_push() {
  [ "$ImageBucketPrefix" == "" ] && echo "nothing to do" && return

  for region in "${bucket_regions[@]}"; do
    echo "copying to ${region}"
    aws s3 cp ${tmpdir}/${repo}-${after}.tar.gz s3://${ImageBucketPrefix}-${region}/images/${repo}/${after}.tar.gz --only-show-errors
  done
}

function docker_save() {
  [ "$ImageBucketPrefix" == "" ] && echo "nothing to do"  && return

  image_file=${tmpdir}/${repo}-${after}.tar.gz
  echo "saving image to ${image_file}"
  docker save ${repo}:${after} | gzip > ${image_file}
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

  local imageId=$(docker images -q ${repo}:${after})
  if [ -n "${imageId}" ]; then
    docker rmi -f ${imageId}
  fi
}
