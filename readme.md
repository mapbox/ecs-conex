# ecs-conex

ECS Container Express: a continuous integration service for building Docker images and uploading them to ECR repositories in response to push events to Github repositories.

## ECR Repository structure

Will create one ECR repository for each Github repository, and each time a push is made to the Github repository, a Docker image will be created for the most recent commit in the push. The image will be tagged with the SHA of that most recent commit. Also, if the most recent commit represents a git tag, the tag's name will also become an image in the ECR repository.

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

## Logging

Logs from ecs-conex containers will be written to `/var/log/messages` on the host EC2s (assuming you're running ecs-conex on a EC2s started from [ECS-optimized AMIs](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html)). You are strongly encouraged to use some form of external aggregation service to gather log outputs from EC2s across your ECS cluster.

The logs will be formatted using [fastlog](https://github.com/willwhite/fastlog), allowing you to separate them from other logs that may be written to the same file. An example log output:

```
[Tue, 05 Jul 2016 06:10:51 GMT] [ecs-conex] [39340547-4ec7-413f-bcd4-cdfbdf21a61c] processing commit abcd by chuck to refs/heads/my-branch of my-org/my-repo
```

This log breaks down as follows:

```
[timestamp] [ecs-conex] [messageId] message
```

... where `messageId` is a common identifier for all the ecs-conex logs related to processing a single push.

## Debugging failures

When a build fails, a notification is sent to an SNS topic and forwarded to the `WatchbotNotificationEmail` that was provided when the ecs-conex stack was created. A notification will look similar to this:

```
At Tue, 26 Jul 2016 23:29:50 GMT, processing message a7492004-8ca8-4322-9299-2e82bb649163 failed on ecs-conex-production

Task outcome: delete & notify
Task stopped reason: Essential container in task exited

Message information:
MessageId: a7492004-8ca8-4322-9299-2e82bb649163
Subject: webhook
Message: {"ref":"refs/heads/test-branch","after":"81e48385715d60cae6f6d9ae818d8148590a9902","before":"c2abf76a55709b2f5eb27eeb1c0d33d4408ea963","repository":{"name":"ecs-conex","owner":{"name":"mapbox"}},"pusher":{"name":"rclark"}}
SentTimestamp: 1469575768248
ApproximateFirstReceiveTimestamp: 1469575768250
ApproximateReceiveCount: 1

Runtime resources:
Cluster ARN: arn:aws:ecs:us-east-1:123456789012:cluster/ecs-cluster-production
Instance ARN: arn:aws:ecs:us-east-1:123456789012:container-instance/2e14b317-0909-4ecc-ab88-d94fe64d2167
Task ARN: arn:aws:ecs:us-east-1:123456789012:task/798b49eb-49d7-4abb-a305-82a6e723caf6
```

First off all, check the `Message` JSON to help identify the commit that caused a failure, the repository that was being built, and the person who was responsible for the commit.

Next, use the `MessageId` (`a7492004-8ca8-4322-9299-2e82bb649163` in this example) to search container logs. Logs from ecs-conex containers will be written to `/var/log/messages` on the host EC2s (assuming you're running ecs-conex on a EC2s started from [ECS-optimized AMIs](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html)). If you run on an ECS cluster with more than one EC2, you may have to use the `Instance ARN` in an `ecs:DescribeContainerInstances` request to determine the EC2 that the container ran on.

If there are more questions, the `Runtime resources` indicate the ECS cluster, the EC2 instance, and the ECS task that attempted the build. You can use these for closer inspection via further ECS API requests.
