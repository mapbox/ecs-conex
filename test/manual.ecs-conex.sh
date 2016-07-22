#!/usr/bin/env bash

set -eu

# IMPORTANT: must be run from the root directory of ecs-conex
# env vars must be set:
# - GithubAccessToken
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
# - AWS_SESSION_TOKEN (optional)
# - TMPDIR

Owner=$1
Repo=$2
AccountId=$3
AfterSha=$4
BeforeSha=${5:-0000000000000000000000000000000000000000}
GithubAccessToken=${GithubAccessToken}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN:-}
NPMAccessToken=${NPMAccessToken}
ApproximateReceiveCount="0"

docker build -t ecs-conex ./
docker run \
  -v $TMPDIR:/mnt/data \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MessageId=test \
  -e AccountId=${AccountId} \
  -e StackRegion=us-east-1 \
  -e GithubAccessToken=${GithubAccessToken} \
  -e Message="{\"ref\":\"refs/heads/test-branch\",\"after\":\"${AfterSha}\",\"before\":\"${BeforeSha}\",\"repository\":{\"name\":\"${Repo}\",\"owner\":{\"name\":\"${Owner}\"}},\"pusher\":{\"name\":\"test-user\"}}" \
  -e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
  -e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
  -e AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN} \
  -e NPMAccessToken=${NPMAccessToken} \
  -e ApproximateReceiveCount=${ApproximateReceiveCount} \
  ecs-conex
