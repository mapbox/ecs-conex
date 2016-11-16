## Working with GitHub repositories requiring private npm modules

In order to require private npm modules, you will need to export an npm access token environment variable in the ecs-conex build, and write that access token to an `.npmrc` file in your GitHub repository's Dockerfile.

1. Your ecs-conex CloudFormation stack was provided with an npm access token in the parameter `NPMAccessToken`. This exposes your token to the GitHub repository you are watching.
2. In your GitHub repository's Dockerfile, specify that you'd like to pass the npm access token at build-time, write this token to `.npmrc` prior to dependency installation:

```sh
# define build arguments
ARG NPMAccessToken

# create .npmrc file
RUN echo "//registry.npmjs.org/:_authToken=$NPMAccessToken" > ./.npmrc
ONBUILD COPY .npmrc ./

# install app dependencies
RUN npm install

# Clean up
RUN rm -f ./.npmrc
```

During local Docker builds, be sure to pass in the NPMAccessToken as part of the build arg:
`docker build --build-arg NPMAccessToken=ABCDEFGHIJKLMNOP -t your-repo ./`

Checkout the [NPM docs](https://docs.npmjs.com/private-modules/docker-and-private-modules) for more on Docker and private modules.
