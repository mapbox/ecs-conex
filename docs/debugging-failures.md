# Debugging failures

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

Next, use the `MessageId` — `a7492004-8ca8-4322-9299-2e82bb649163` in this example — to search container logs. Logs from ecs-conex containers will be written to `/var/log/messages` on the host EC2s, assuming you're running ecs-conex on EC2s started from [ECS-optimized AMIs](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html). If you run on an ECS cluster with more than one EC2, you may have to use the `Instance ARN` in an `ecs:DescribeContainerInstances` request to determine the EC2 that the container ran on.

If there are more questions, the `Runtime resources` indicate the ECS cluster, the EC2 instance, and the ECS task that attempted the build. You can use these for closer inspection via further ECS API requests.
