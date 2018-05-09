function version-check() {
  major_local_docker_version=$(echo "$local_docker_version" | cut -d "." -f 1)
  major_server_docker_version=$(curl -s --unix-socket /var/run/docker.sock http://localhost/info | jq -r .ServerVersion | cut -d "." -f 1)
  echo "Host Docker version: ${major_server_docker_version}, Local Docker version: ${major_local_docker_version}"
  if [ $major_server_docker_version -ne $major_local_docker_version ]; then
    echo "Docker versions don't match on the client and the host."
    aws sns publish \
    --topic-arn ${NotificationTopic} \
    --subject "Version mismatch between docker on ecs-conex and the host" \
    --message "The docker versions don't match on ecs-conex and the host EC2. Host Docker version: ${server_docker_version} and Local Docker version: ${local_docker_version}"
  fi
}
