# ecs-conex

## What is ecs-conex?

ECS Container Express is a continuous integration service for building [Docker](https://www.docker.com/) images and uploading them to [ECR](https://aws.amazon.com/ecr/) repositories in response to push events to Github repositories.

### Dockerfile

The [Dockerfile](https://docs.docker.com/engine/reference/builder/) contains the commands required to build an image, or snapshot of your repository, when you push to GitHub. This file is located in the root directory of your application code.

### ECR Repository structure

ecs-conex will create one ECR repository for each Github repository, and each time a push is made to the Github repository, a Docker image will be created for the most recent commit in the push. The image will be tagged with the SHA of that most recent commit. Also, if the most recent commit represents a git tag, the tag's name will also become an image in the ECR repository.

## Documentation

- [Getting started](./docs/getting-started.md)
- [Logging](./docs/logging.md)
- [Debugging failures](./docs/debugging-failures.md)
- [Removing old ECR registry images](./docs/removing-images.md)
