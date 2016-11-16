# Logging

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
