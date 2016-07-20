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

  echo "parsing received message"
  parse_message

  echo "processing commit ${after} by ${user} to ${ref} of ${owner}/${repo}"

  status="pending"
  echo "sending ${status} status to github"
  github_status "${status}" "ecs-conex is building an image"
  [ "${deleted}" == "true" ] && exit 0

  git clone https://${GithubAccessToken}@github.com/${owner}/${repo} ${tmpdir}
  cd ${tmpdir} && git checkout -q $after || exit 3

  echo "looking for dockerfile"
  check_dockerfile ./Dockerfile

  echo "attempt to fetch previous image ${before} from ${StackRegion}"
  ensure_repo ${StackRegion}
  login ${StackRegion}
  docker pull "$(before_image ${StackRegion})" 2> /dev/null || :

  echo "gather local credentials and setup --build-arg"
  credentials ./Dockerfile

  echo "building new image"
  docker build --quiet ${args} --tag ${repo} ${tmpdir}

  for region in "${regions[@]}"; do
    ensure_repo ${region}
    login ${region}

    echo "pushing ${after} to ${region}"
    docker tag -f ${repo}:latest "$(after_image ${region})"
    docker push "$(after_image ${region})"

    if git describe --tags --exact-match 2> /dev/null; then
      tag="$(git describe --tags --exact-match)"
      echo "pushing ${tag} to ${region}"
      docker tag -f ${repo}:latest "$(after_image ${region} ${tag})"
      docker push "$(after_image ${region} ${tag})"
    fi
  done

  echo "completed successfully"
}

trap "cleanup $?" EXIT
main 2>&1 | FASTLOG_PREFIX='[${timestamp}] [ecs-conex] '[${MessageId}] fastlog info
