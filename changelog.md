### v0.4.0

- ecs-conex's container can now run on a host using Docker 1.12.6 or 17.03.1-ce
- Fail helpfully when the GithubAccessToken used with conex watch does not have adequate permissions.

### v0.3.1

- ecs-watchbot@1.0.4 allows LogAggregationFunction to be truly an optional stack parameter
- fixes package.json version identifier

### v0.3.0

- Ensures that both git tag and git sha tagged docker images get pushed to registry
- GithubAccessToken stack parameter gets passed via `--build-arg` for accessing private repositories
- Fixes an issue where secure environment variables were not being decrypted

### v0.2.0

- Builds are performed with `--no-cache`, and images that were produced are cleaned up after being uploaded to ECR
- CloudFormation template overhaul w/ Watchbot v0.0.7
- Adds NPMAccessToken stack parameter and passes to builds via `--build-arg` if requested
- Passes AWS credentials from the host EC2 to the build via `--build-arg` if requested
- Logs are aggregated in CloudWatch Logs, optionally sent to a Lambda function via `SubscriptionFilter` if a function's ARN is provided
- Failure notifications now contain information about the resource that ran the task, as well as excerpts from the logs prior to the failure.
- Removes a job from SQS if it has been tried 3 times
- Will no longer overwrite an existing image in ECR
- Adds unit tests

### v0.1.0

- All logs sent to syslog
- Runs docker v1.11.1
- Provides Github status notifications
- Quiet build logs
- Handles push events from deleted branches

### v0.0.1

- First sketch of ECS container express
