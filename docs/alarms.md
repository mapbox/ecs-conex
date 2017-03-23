### MaxPendingTime

#### What

Time between tasks getting created and actually starting (i.e. staying in PENDING state) has gone above 120 seconds.

#### Problem

Long pending times could contribute to backup of minutes to hours. When the cluster is under heavy load and there is throttling occuring between the ecs-agent and the Agent Control Service (ACS), there is often be a buildup of tasks hanging in the `PENDING` state for a long time. One way to check if the cluster is in this state is to check the cluster's `PendingTasksPerInstance` metric, looking for high averages or a high maximum. The other thing to check is the `WatchbotWorkerPending` metric for all other watchbot stacks. If either of these is high, you are in the throttling scenario.

#### Solution

Determining which stack is overscaled requires looking at the `WatchbotConcurrency` on the cluster, and seeing if it's high for any watchbot stacks in that region. Once the high-scale watchbot stack is found, contact the stack's owner and see if they can gracefully scale down so that conex isn't negatively impacted.
