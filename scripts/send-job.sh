#!/usr/bin/env bash

set -eu

Owner=$1
Repo=$2
AfterSha=$3
BeforeSha=${4:-0000000000000000000000000000000000000000}
Topic=$5
Max=900

# Fetches images for given repository, and sorts by image creation datetime.
# Determine which of the oldest ECR images need to be deleted until remaning ECR
# size is one less than ${Max}. Make an aws ecr batch-delete-image request for
# these oldest messages.
response=$(aws ecr describe-images --repository-name ${Repo})
details=$(node -e "console.log(${response}.imageDetails)")
validateGitSha=$(node -e "console.log(${details}.filter(function(e) { return /^[a-z0-9]{40}$/.test(e.imageTags[0]) }))")
sorted=$(node -e "console.log(${validateGitSha}.sort(function(a, b) { return (a.imagePushedAt - b.imagePushedAt) }))")
length=$(node -e "console.log(${sorted}.length)")
splice=$(node -e "console.log(${sorted}.splice(0, ${length} - ${Max} + 1))")
images=$(node -e "console.log(${splice}.map(function(i) { return 'imageDigest=' + i.imageDigest; }).join(' '))")
[ ! -z "$images" ] && aws ecr batch-delete-image --repository-name ${Repo} --image-ids ${images}

aws sns publish \
  --topic-arn ${Topic} \
  --subject "webhook" \
  --message "{\"ref\":\"refs/heads/test-branch\",\"after\":\"${AfterSha}\",\"before\":\"${BeforeSha}\",\"repository\":{\"name\":\"${Repo}\",\"owner\":{\"name\":\"${Owner}\"}},\"pusher\":{\"name\":\"test-user\"}}"
