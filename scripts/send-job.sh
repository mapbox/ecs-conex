#!/usr/bin/env bash

set -eu

Owner=$1
Repo=$2
AfterSha=$3
BeforeSha=${4:-0000000000000000000000000000000000000000}
Topic=$5

#################################
# Make room in the ECR registry #
#################################

# Get a JSON of images from repository's ECR registry.
response=$(aws ecr describe-images --repository-name ${Repo})

# Isolate the imageDetails property.
details=$(node -e "console.log(${response}.imageDetails)")

# Filter for imageTags that resemble GitShas.
validated=$(node -e "console.log(${details}.filter(function(e) { return /^[a-z0-9]{40}$/.test(e.imageTags[0]) }))")

# Sort images by creation datetime from earliest to latest.
sorted=$(node -e "console.log(${validated}.sort(function(a, b) { return (a.imagePushedAt - b.imagePushedAt) }))")

# Determine the number of images in the registry.
length=$(node -e "console.log(${sorted}.length)")

# Join the imageTags in a bash-digestible format.
joined=$(node -e "console.log(${sorted}.map(function(e) { return e.imageTags[0] }).join('\n'))")

# Iterate through the sorted list of images. If the imageTag, or GitSha, does not
# exist on GitHub, skip it. Do this until you have enough images to delete to bring
# the registry size down to one less than the desired maximum.
max=11
toDelete=()

numberToDelete=$(expr ${length} - ${max} + 1)
[ "${numberToDelete}" -lt "0" ] && numberToDelete=0
for tag in $joined; do
  if [ "${#toDelete[@]}" -eq "${numberToDelete}" ]; then break; fi;
  github=`curl -i https://api.github.com/repos/${Owner}/${Repo}/commits/${tag}?access_token=$GithubAccessToken | grep "Status: 200 OK"`
  if [ ! -z "$github" ]; then
    toDelete+=(imageDigest=$tag)
  fi
done

# Join the images together, and make an AWS batch-delete-image request.
if [ "${#toDelete[@]}" -ne 0 ]; then
  images=$(echo "${toDelete[*]}")
  aws ecr batch-delete-image --repository-name ${Repo} --image-ids ${images}
fi

#########################
# Send job to SNS topic #
#########################

aws sns publish \
  --topic-arn ${Topic} \
  --subject "webhook" \
  --message "{\"ref\":\"refs/heads/test-branch\",\"after\":\"${AfterSha}\",\"before\":\"${BeforeSha}\",\"repository\":{\"name\":\"${Repo}\",\"owner\":{\"name\":\"${Owner}\"}},\"pusher\":{\"name\":\"test-user\"}}"
