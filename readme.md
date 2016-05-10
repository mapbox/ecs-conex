# ecs-conex

ECS Container Express: a continuous integration service for building Docker images and uploading them to ECR repositories in response to push events to Github repositories.

## ECR Repository structure

Will create one ECR repository for each Github repository, and each time a push is made to the Github repository, a Docker image will be created for the most recent commit in the push. The image will be tagged with the SHA of that most recent commit. Also, if the most recent commit represents a git tag, the tag's name will also become an image in the ECR repository.
