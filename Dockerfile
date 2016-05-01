FROM ubuntu

# Installations
RUN apt-get update && apt-get install -y curl git python-pip
RUN curl -fsSL https://get.docker.com/ | sh
RUN pip install awscli
RUN curl https://s3.amazonaws.com/mapbox/apps/install-node/v2.0.0/run | NV=4.4.2 NP=linux-x64 OD=/usr/local sh
RUN npm install -g fastlog

# Setup application directory
RUN mkdir -p /usr/local/src/ecr-image-ci
WORKDIR /usr/local/src/ecr-image-ci

# Copy files into the container
COPY ./ecr-image-ci.sh ./ecr-image-ci.sh

# Run the watcher
CMD ["/bin/sh", "-c", "./ecr-image-ci.sh 2>&1 | FASTLOG_PREFIX='[${timestamp}] [ecr-image-ci] '[${MessageId}] fastlog info >> /mnt/log/application.log"]
