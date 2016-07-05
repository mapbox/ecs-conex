#!/usr/bin/env bash

set -eu

GithubAccessToken=${GithubAccessToken}

stack=${1:-"us-east-1:ecs-conex-production"}
region=$(echo $stack | cut -d : -f 1)
name=$(echo $stack | cut -d : -f 2)

outputs=$(aws cloudformation describe-stacks --region ${region} --stack-name ${name} --query 'Stacks[0].Outputs')
secret=$(node -e "console.log(${outputs}.find(function(o) { return o.OutputKey === 'WatchbotAccessKeyId'}).OutputValue);")
url=$(node -e "console.log(${outputs}.find(function(o) { return o.OutputKey === 'WatchbotWebhookEndpoint'}).OutputValue);")

remote=$(git config --get remote.origin.url)
repo=$(node -e "console.log(require('path').basename('${remote}', '.git'));")
owner=$(node -e "console.log(require('path').dirname('${remote}').split(':').slice(-1)[0].split('/').slice(-1)[0]);")

hooks=$(curl -sL https://api.github.com/repos/${owner}/${repo}/hooks?access_token=${GithubAccessToken})
existing=$(node -e "var exists = ${hooks}.find(function(hook) { return hook.config.url === '${url}'; }); console.log(exists ? exists.id : '');")

if [ -z "$existing" ]; then
  curl -sL \
    --request POST \
    --header "Content-Type: application/json" \
    --data "{\"name\":\"web\",\"active\":true,\"config\":{\"url\":\"${url}\",\"secret\":\"${secret}\",\"content_type\":\"json\"}}" \
    https://api.github.com/repos/${owner}/${repo}/hooks?access_token=${GithubAccessToken}
else
  curl -sL \
    --request PATCH \
    --header "Content-Type: application/json" \
    --data "{\"name\":\"web\",\"active\":true,\"config\":{\"url\":\"${url}\",\"secret\":\"${secret}\",\"content_type\":\"json\"}}" \
    https://api.github.com/repos/${owner}/${repo}/hooks/${existing}?access_token=${GithubAccessToken}
fi
