# ecs-conex

ECS Container Express: a continuous integration service for building Docker images and uploading them to ECR repositories in response to push events to Github repositories.

## ECR Repository structure

Will create one ECR repository for each Github repository, and each time a push is made to the Github repository, a Docker image will be created for the most recent commit in the push. The image will be tagged with the SHA of that most recent commit. Also, if the most recent commit represents a git tag, the tag's name will also become an image in the ECR repository.

## Logging

Logs from ecs-conex containers will be written to `/var/log/messages` on the host EC2s (assuming you're running ecs-conex on a EC2s started from [ECS-optimized AMIs](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html)).

The logs will be formatted using [fastlog](https://github.com/willwhite/fastlog), allowing you to separate them from other logs that may be written to the same file. An example log output:

```
[Tue, 05 Jul 2016 06:10:51 GMT] [ecs-conex] [39340547-4ec7-413f-bcd4-cdfbdf21a61c] processing commit abcd by chuck to refs/heads/my-branch of my-org/my-repo
```

This log breaks down as follows:

```
[timestamp] [ecs-conex] [job id] message
```

... where `job id` is a common identifier for all the ecs-conex logs related to processing a single push.

## Setup ecs-conex in your AWS account

This only needs to be performed once per account. More instruction and scripts coming soon.

## Have ecs-conex watch a Github repository

Once ecs-conex is running in your AWS account, you can ask it to build a Docker image each time you push changes to a Github repository.

1. Setup the Github repository. You will need a `Dockerfile` at the root level of the repository.
2. Your ecs-conex CloudFormation stack was provided with a Github access token. Make sure that the Github user corresponding to that token is listed as a collaborator and has permission to read from your Github repository.
3. Clone the ecs-conex repository locally, giving you access to the `watch.sh` script in the `scripts` folder.
4. Make sure you have awscli installed
5. Clone your Github repository locally, and use the `watch.sh` script to register the Github repository with ecs-conex.

In this example, we assume:
- that a ecs-conex stack has already been created in `us-east-1` called `ecs-conex-production`,
- a new Github repository called `my-github-repo` is already created, and
- awscli is installed and properly configured

```sh
$ git clone https://github.com/mapbox/ecs-conex
$ mkdir my-github-repo
$ cd my-github-repo
$ git init
$ git remote add origin git@github.com:my-username/my-github-repo
$ echo "FROM ubuntu" > Dockerfile
$ git commit -am "my first commit"
$ git push --set-upstream origin master
$ ../ecs-conex/scripts/watch.sh us-east-1:ecs-conex-production
```

You can check to see if your repository is being watched by looking at Settings > Webhooks & Services for your repository:

```
https://github.com/my-username/my-github-repo/settings/hooks
```
