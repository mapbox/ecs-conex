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

# Get a JSON of images from repository's ECR registry. Isolate the imageDetails
# property. Filter for imageTags that resemble GitShas. Sort images by creation
# datetime from earliest to latest. Join the imageTags in a bash-digestible format.
response=$(aws ecr describe-images --repository-name ${Repo})
details=$(node -e "console.log(${response}.imageDetails)")
validated=$(node -e "console.log(${details}.filter(function(e) { return /^[a-z0-9]{40}$/.test(e.imageTags[0]) }))")
sorted=$(node -e "console.log(${validated}.sort(function(a, b) { return (a.imagePushedAt - b.imagePushedAt) }))")
joined=$(node -e "console.log(${sorted}.map(function(e) { return e.imageTags[0] }).join('\n'))")

# Iterate through the sorted list of images. If the imageTag, or GitSha, does not
# exist on GitHub, skip it. Do this until you have enough images to delete to bring
# the registry size down to one less than the desired maximum.
toDelete=()
couldNotDelete=()
max=900
length=$(node -e "console.log(${sorted}.length)")
numberToDelete=$(expr ${length} - ${max} + 1)

[ "${numberToDelete}" -lt "0" ] && numberToDelete=0
for tag in $joined; do
  if [ "${#toDelete[@]}" -eq "${numberToDelete}" ]; then break; fi
  httpCode=$(curl -s -o /dev/null -I -w "%{http_code}" https://api.github.com/repos/${Owner}/${Repo}/commits/${tag}?access_token=$GithubAccessToken)
  if [ "$httpCode" -eq 200 ]; then toDelete+=(imageTag=$tag); else couldNotDelete+=(" * [${tag}] http code ${httpCode}\n"); fi
done

# If images need to be deleted but there aren't enough qualifying images, print
# information about the GitShas and their HTTP codes. This could mean there is an
# issue connecting to GitHub.
if [ "${numberToDelete}" -ne 0 ] && [ "${#toDelete[@]}" -lt "${numberToDelete}" ]; then
  echo -e "There was a problem finding enough images still on GitHub to delete:"
  echo -e "  * Need to delete: ${numberToDelete} images"
  echo -e "  * Able to delete: ${#toDelete[@]} images\n"
  echo -e "The following GitShas returned non-200 status codes:"
  echo -e " ${couldNotDelete[@]}"
fi

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
