# Getting started

## Set up ecs-conex in your AWS account

This only needs to be performed once per account. More instruction and scripts coming soon.

## Have ecs-conex watch a GitHub repository

Once ecs-conex is running in your AWS account, you can ask it to build a Docker image each time you push changes to a GitHub repository.

1. Make sure you have awscli installed.
2. Setup the GitHub repository. You will need a `Dockerfile` at the root level of the repository to specify how the image should be built.
3. When it was created or updated, your ecs-conex CloudFormation stack was provided with a GitHub access token to allow it to read from repositories. Make sure that the GitHub user corresponding to that token has permission to read from the Github repository you are adding to ecs-conex, either by being listed as a collaborator or by being part of a team that has read permission.
4. Clone the ecs-conex repository locally.
5. In your Github account, generate an access token with `admin:repo_hook` and `repo` scopes. This token will be used to add the ecs-conex repo hook to the Github repository you're adding to ecs-conex. (After you've added your repository you can safely delete this token.)
6. If you are not already a collaborator on the Github repository you're adding to ecs-conex, add yourself as a collaborator.
7. Set your Github access token as an environment variable named `GithubAccessToken`.
8. Run the `watch.sh` script from `ecs-conex/scripts/` in the root directory of your repository to register the Github repository with ecs-conex.

In the example below, we assume:
- that a ecs-conex stack has already been created in `us-east-1` called `ecs-conex-production`,
- a new GitHub repository called `my-github-repo` is already created,
- you have generated a personal GitHub access token `abcdefghi` with `admin:repo_hook` and `repo` scopes, and
- awscli is installed and properly configured.

```sh
$ git clone https://github.com/mapbox/ecs-conex
$ mkdir my-github-repo
$ cd my-github-repo
$ git init
$ git remote add origin git@github.com:my-username/my-github-repo
$ echo "FROM ubuntu" > Dockerfile
$ git commit -am "my first commit"
$ git push --set-upstream origin master
$ GithubAccessToken=abcdefghi ../ecs-conex/scripts/watch.sh us-east-1:ecs-conex-production
```

You can check to see if your repository is being watched by looking at Settings > Webhooks & Services for your repository:

```
https://github.com/my-username/my-github-repo/settings/hooks
```
