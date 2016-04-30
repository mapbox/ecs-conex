FROM ubuntu

# Installations
RUN apt-get update && apt-get install -y curl git
RUN curl -fsSL https://get.docker.com/ | sudo sh
RUN curl https://s3.amazonaws.com/mapbox/apps/install-node/v2.0.0/run | NV=4.4.2 NP=linux-x64 OD=/usr/local sh

# Setup application directory
RUN mkdir -p /usr/local/src/ecr-image-ci
WORKDIR /usr/local/src/ecr-image-ci

# npm installation
COPY ./package.json ./
RUN npm install --production

# Copy files into the container
COPY ./index.js ./
COPY ./lib ./lib
COPY ./bin ./bin

# Run the watcher
CMD ["/bin/sh", "-c", "npm start >> /mnt/log/application.log"]
