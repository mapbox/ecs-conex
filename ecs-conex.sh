#!/usr/bin/env bash

set -eu
set -o pipefail

regions=(us-east-1 us-west-2 eu-west-1)
tmpdir="$(mktemp -d /mnt/data/XXXXXX)"
source utils.sh

function main() {
  echo "checking docker configuration"
  docker version > /dev/null

  echo "checking environment configuration"
  MessageId=${MessageId}
  Message=${Message}
  AccountId=${AccountId}
  GithubAccessToken=${GithubAccessToken}
  StackRegion=${StackRegion}
  ApproximateReceiveCount=${ApproximateReceiveCount}

  echo "checking job receive count"
  check_receives

  echo "parsing received message"
  parse_message

  echo "making space in the ecr registry, if necessary"
  identify_images
  delete_images

  echo "processing commit ${after} by ${user} to ${ref} of ${owner}/${repo}"

  status="pending"
  echo "sending ${status} status to github"
  github_status "${status}" "ecs-conex is building an image"
  [ "${deleted}" == "true" ] && exit 0

  git clone -q https://${GithubAccessToken}@github.com/${owner}/${repo} ${tmpdir}
  cd ${tmpdir} && git checkout -q $after || exit 3

  echo "looking for dockerfile"
  check_dockerfile ./Dockerfile

  echo "gather local credentials and setup --build-arg"
  credentials ./Dockerfile

  echo "logging into ECR repositories in ${regions[*]}"
  ecr_logins "${regions[@]}"

  echo "building new image"

  docker build --no-cache ${args} --tag ${repo}:${after} ${tmpdir}
  docker_push

  echo "completed successfully"
}

trap "cleanup" EXIT
main 2>&1 | watchbot-log
