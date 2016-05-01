FROM ubuntu

# Installations
RUN apt-get update -qq && apt-get install -y curl git python-pip
RUN curl -fsSL https://get.docker.com/ | sh
RUN pip install awscli
RUN curl https://s3.amazonaws.com/mapbox/apps/install-node/v2.0.0/run | NV=4.4.2 NP=linux-x64 OD=/usr/local sh
RUN npm install -g fastlog

# Setup application directory
RUN mkdir -p /usr/local/src/ecr-image-ci
WORKDIR /usr/local/src/ecr-image-ci

# Copy files into the container
COPY ./ecr-image-ci.sh ./ecr-image-ci.sh

# Use docker on the host instead of running docker-in-docker
# https://jpetazzo.github.io/2015/09/03/do-not-use-docker-in-docker-for-ci/
VOLUME /var/run/docker.sock

# Logs written to the host
VOLUME /mnt/log

# Run the watcher
CMD ["/bin/sh", "-c", "./ecr-image-ci.sh 2>&1 | FASTLOG_PREFIX='[${timestamp}] [ecr-image-ci] '[${MessageId}] fastlog info >> /mnt/log/application.log"]
