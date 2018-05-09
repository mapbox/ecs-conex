FROM ubuntu

# Installations
RUN apt-get update -qq && apt-get install -y curl git python-pip parallel jq
RUN pip install awscli
RUN curl -s https://s3.amazonaws.com/mapbox/apps/install-node/v2.0.0/run | NV=4.4.2 NP=linux-x64 OD=/usr/local sh

# Setup watchbot for logging and env var decryption
RUN npm install -g watchbot@^1.0.3 decrypt-kms-env@^2.0.1

# Setup application directory
RUN mkdir -p /usr/local/src/ecs-conex
WORKDIR /usr/local/src/ecs-conex

ENV local_docker_version "17.12.0"
ENV server_docker_version $(curl -s --unix-socket /var/run/docker.sock http://localhost/info | jq -r .ServerVersion)

RUN curl -sL https://download.docker.com/linux/static/stable/x86_64/docker-${local_docker_version}-ce.tgz > docker-${local_docker_version}-ce.tgz

# Copy files into the container
COPY ./*.sh ./

# Use docker on the host instead of running docker-in-docker
# https://jpetazzo.github.io/2015/09/03/do-not-use-docker-in-docker-for-ci/
VOLUME /var/run/docker.sock

# tmp data written to the host
VOLUME /mnt/data

# Run the worker
CMD eval $(decrypt-kms-env) \
  && tar -xzf docker-${local_docker_version}-ce.tgz \
  && cp docker/docker /usr/local/bin/docker \
  && chmod 755 /usr/local/bin/docker \
  && timeout 3600 ./ecs-conex.sh