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

  # Get a JSON of images from repository's ECR registry. Isolate the imageDetails
  # property. Filter for imageTags that resemble GitShas. Sort images by creation
  # datetime from earliest to latest. Splice enough images so remaining image count
  # is one less than desired maximum. Delete the spliced images from the registry.
  echo "making space in the ecr registry, if necessary"
  max=900
  response=$(aws ecr describe-images --repository-name ${repo})
  details=$(node -e "console.log(${response}.imageDetails)")
  validated=$(node -e "console.log(${details}.filter(function(e) { return /^[a-z0-9]{40}$/.test(e.imageTags[0]) }))")
  sorted=$(node -e "console.log(${validated}.sort(function(a, b) { return (a.imagePushedAt - b.imagePushedAt) }))")
  length=$(node -e "console.log(${sorted}.length)")
  splice=$(node -e "console.log(${sorted}.splice(0, ${length} - ${max} + 1))")
  images=$(node -e "console.log(${splice}.map(function(e) { return 'imageDigest=' + e.imageDigest; }).join(' '))")
  [ ! -z "$images" ] && aws ecr batch-delete-image --repository-name ${Repo} --image-ids ${images}

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

  docker build --no-cache --quiet ${args} --tag ${repo}:${after} ${tmpdir}
  docker_push

  echo "completed successfully"
}

trap "cleanup" EXIT
main 2>&1 | watchbot-log
