# Logging

When used in conjunction with [ecs-watchbot](https://github.com/mapbox/ecs-watchbot), logs from ecs-conex containers will be written to a [CloudWatch Log Group](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-logs-loggroup.html). Watchbot creates this resource with the name `<stackName>-<stackRegion>-<serviceVersion>`. Within your log group, individual message logs will contain the `MessageId` — `39340547-4ec7-413f-bcd4-cdfbdf21a61c` in the following example — in the log stream.

The logs will be formatted using [fastlog](https://github.com/willwhite/fastlog), allowing you to separate them from other logs that may be written to the same file. An example log output:

```
[Tue, 05 Jul 2016 06:10:51 GMT] [ecs-conex] [39340547-4ec7-413f-bcd4-cdfbdf21a61c] processing commit abcd by chuck to refs/heads/my-branch of my-org/my-repo
```

This log breaks down as follows, where `messageId` is a common identifier for all the ecs-conex logs related to processing a single push:

```
[timestamp] [ecs-conex] [messageId] message
```
