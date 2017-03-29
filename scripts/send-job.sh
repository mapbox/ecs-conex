#!/usr/bin/env bash

set -eu

Owner=$1
Repo=$2
AfterSha=$3
BeforeSha=${4:-0000000000000000000000000000000000000000}
Topic=$5
GithubAccessToken=${GithubAccessToken}

# Create space in the ECR registry, if necessary.
./scripts/clean-registry.sh ${Owner} ${Repo}

aws sns publish \
  --topic-arn ${Topic} \
  --subject "webhook" \
  --message "{\"ref\":\"refs/heads/test-branch\",\"after\":\"${AfterSha}\",\"before\":\"${BeforeSha}\",\"repository\":{\"name\":\"${Repo}\",\"owner\":{\"name\":\"${Owner}\"}},\"pusher\":{\"name\":\"test-user\"}}"
