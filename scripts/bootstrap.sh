#!/usr/bin/env bash

set -eux

docker_version=${1:-17.03.1-ce}

# Log docker client into ECR
eval "$(aws ecr get-login --region us-east-1 --no-include-email)" || \
  eval "$(aws ecr get-login --region us-east-1)"

# Make sure the ECR repository exists
aws ecr describe-repositories --region us-east-1 --repository-names ecs-conex > /dev/null 2>&1 || \
  aws ecr create-repository --region us-east-1 --repository-name ecs-conex > /dev/null

# Fetch the ECR repository URI
desc=$(aws ecr describe-repositories --region us-east-1 --repository-names ecs-conex)
uri=$(node -e "console.log(${desc}.repositories[0].repositoryUri);")

# Build the docker image
docker build -t ecs-conex --build-arg DOCKER_VERSION=${docker_version} ./

# Tag the image into the ECR repository
docker tag ecs-conex "${uri}:$(git rev-parse head)"

# Push the image into the ECR repository
docker push "${uri}:$(git rev-parse head)"
