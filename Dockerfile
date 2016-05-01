FROM ubuntu

# Installations
RUN apt-get update -qq && apt-get install -y curl git python-pip
RUN pip install awscli
RUN curl https://s3.amazonaws.com/mapbox/apps/install-node/v2.0.0/run | NV=4.4.2 NP=linux-x64 OD=/usr/local sh
RUN npm install -g fastlog

# Setup application directory
RUN mkdir -p /usr/local/src/ecr-image-ci
WORKDIR /usr/local/src/ecr-image-ci

# Install docker binary matching EC2 version
RUN curl -L https://get.docker.com/builds/Linux/x86_64/docker-1.9.1.tgz > docker-1.9.1.tgz
RUN tar -xzf docker-1.9.1.tgz && cp usr/local/bin/docker /usr/local/bin/docker && chmod 755 /usr/local/bin/docker

# Copy files into the container
COPY ./ecr-image-ci.sh ./ecr-image-ci.sh

# Use docker on the host instead of running docker-in-docker
# https://jpetazzo.github.io/2015/09/03/do-not-use-docker-in-docker-for-ci/
VOLUME /var/run/docker.sock

# Logs written to the host
VOLUME /mnt/log

# Run the watcher
CMD ["/bin/sh", "-c", "./ecr-image-ci.sh 2>&1 | FASTLOG_PREFIX='[${timestamp}] [ecr-image-ci] '[${MessageId}] fastlog info >> /mnt/log/application.log"]
