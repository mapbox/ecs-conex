#!/usr/bin/env bash

set -eu

echo "insure docker daemon is running"
service docker start > /dev/null 2>&1
docker version > /dev/null 2>&1

ref=$(node -e "console.log(${Message}.ref);")
after=$(node -e "console.log(${Message}.after);")
before=$(node -e "console.log(${Message}.before);")
repo=$(node -e "console.log(${Message}.repository.name);")
owner=$(node -e "console.log(${Message}.repository.owner.name);")
user=$(node -e "console.log(${Message}.pusher.name);")

echo "processing commit ${after} by ${user} to ${ref} of ${owner}/${repo}"

tmpdir="/mnt/data/$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)"

function before_image() {
  local region=$1
  echo ${AccountId}.dkr.ecr.${region}.amazonaws.com/${repo}:${before}
}

function after_image() {
  local region=$1
  echo ${AccountId}.dkr.ecr.${region}.amazonaws.com/${repo}:${after}
}

function login() {
  local region=$1
  eval "$(aws ecr get-login --region ${region})"
}

function insure_repo() {
  local region=$1
  aws ecr describe-repositories \
    --region ${region} \
    --repository-names ${repo} > /dev/null 2>&1 || create_repo ${region}
}

function create_repo() {
  local region=$1
  aws ecr create-repository --region ${region} --repository-name ${repo}
}

function cleanup() {
  rm -rf ${tmpdir}
}

git clone https://${GithubAccessToken}@github.com/${owner}/${repo} ${tmpdir}
trap "cleanup" EXIT
cd ${tmpdir} && git checkout -q $after || exit 3
if git describe --tags --exact-match 2> /dev/null; then
  after="$(git describe --tags --exact-match)"
fi

echo "fetching previous image"
insure_repo us-east-1
login us-east-1
docker pull "$(before_image us-east-1)" > /dev/null 2>&1 || :

echo "building new image"
docker build --tag ${repo} ${tmpdir}

regions=(us-east-1 us-west-2 eu-west-1)
for region in "${regions[@]}"; do
  echo "pushing to ${region}"
  docker tag ${repo}:latest "$(after_image ${region})"
  insure_repo ${region}
  login ${region}
  docker push "$(after_image ${region})"
done

echo "completed successfully"
