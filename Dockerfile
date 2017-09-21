FROM ubuntu

# Installations
RUN apt-get update -qq && apt-get install -y curl git python-pip parallel jq
RUN pip install awscli
RUN curl -s https://s3.amazonaws.com/mapbox/apps/install-node/v2.0.0/run | NV=4.4.2 NP=linux-x64 OD=/usr/local sh
RUN npm install aws-sdk
RUN npm install d3-queue

# Setup watchbot for logging and env var decryption
RUN npm install -g watchbot@^1.0.3 decrypt-kms-env@^2.0.1

# Setup application directory
RUN mkdir -p /usr/local/src/ecs-conex
WORKDIR /usr/local/src/ecs-conex

# Download several versions of docker
RUN curl -sL https://get.docker.com/builds/Linux/x86_64/docker-1.12.6.tgz > docker-1.12.6.tgz
RUN curl -sL https://download.docker.com/linux/static/stable/x86_64/docker-17.03.1-ce.tgz > docker-17.03.1-ce.tgz
RUN curl -sL https://download.docker.com/linux/static/stable/x86_64/docker-17.03.2-ce.tgz > docker-17.03.2-ce.tgz

# Copy files into the container
COPY ./*.sh ./
COPY ./scripts/cleanup.js ./

# Use docker on the host instead of running docker-in-docker
# https://jpetazzo.github.io/2015/09/03/do-not-use-docker-in-docker-for-ci/
VOLUME /var/run/docker.sock

# tmp data written to the host
VOLUME /mnt/data

# Run the worker
CMD eval $(decrypt-kms-env) \
  && docker_version=$(curl -s --unix-socket /var/run/docker.sock http://localhost/info | jq -r .ServerVersion) \
  && tar -xzf docker-${docker_version}.tgz \
  && cp docker/docker /usr/local/bin/docker \
  && chmod 755 /usr/local/bin/docker \
  && timeout 3600 ./ecs-conex.sh
