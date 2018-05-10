### MaxPendingTime

#### What

Time between tasks getting created and actually starting (i.e. staying in PENDING state) has gone above 120 seconds.

#### Problem

Long pending times could contribute to backup of minutes to hours for building docker images. When the cluster is under heavy load it's possible for the Agent Control Service (ACS) to throttle state change requests from the ecs-agent. This usually causes a buildup of tasks hanging in the `PENDING` state for a long time. One way to check if the cluster is in this state is to check the number of tasks in the `PENDING` state on the cluster. If there are more `PENDING` than 10 tasks per host instance on the cluster, it's very likely the ACS service is throttling your state change requests.

#### Solution

If the ACS service is getting throttled (see above), check through the running tasks and see if there is one service or particular family of tasks that is starting and stopping very rapidly on the cluster. If it's possible, scale down that process to return conex pending time to normal.

### Docker major version mismatch

#### What

The docker major version on the ecs-conex worker is higher/lower than the docker major version on the host EC2

#### Problem

ecs-conex workers do not run the same version of Docker as their host EC2s. While this is not problematic, we would recommend ensuring that the two versions of Docker at least have matching major versions.

#### Solution

Update the `conex_docker_version` variable in the Dockerfile, to the _most recent version_ of Docker that has the same major version as the host Docker version. For example, if the `host_docker_version` is `18.03.1`, the `conex_docker_version` can be `18.*` (and not necessarily `18.03.1`), but **cannot** be `17.*`. A full list of permissible Docker versions is available on https://download.docker.com/linux/static/stable/aarch64/
