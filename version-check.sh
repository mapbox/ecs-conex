function version-check() {
  major_local_docker_version=$(echo "$local_docker_version" | cut -d "." -f 1)
  major_server_docker_version=$(echo "$server_docker_version" | cut -d "." -f 1)

  if [ $major_server_docker_version -ne $major_local_docker_version ]; then
    aws sns publish \
    --topic-arn ${NotificationTopic} \
    --subject "Version mismatch between docker on ecs-conex and the host" \
    --message "The docker versions don't match on ecs-conex and the host EC2. Host Docker version: ${server_docker_version} and Local Docker version: ${local_docker_version}"
  fi
}
