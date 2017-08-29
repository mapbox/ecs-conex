# Removing old ECR registry images

```sh
node scripts/cleanup.js <my-username> <my-github-repo> [options]
```

The cleanup script accepts the following options:

* `--maximum` The number of images to keep in the ECR registry. For example, if you want to keep 700 images in the ECR registry, you would wave the `--maximum=700` flag. The default value is 750.
* `--blacklist` A comma-separated list of imageTags not subject to deletion. For example, if you want to ensure that imageTag `<tag-1>` and `<tag-2>` are not deleted, you would wave the `--blacklist=<tag-1>,<tag-2>` flag.

You will need to have two environment parameters set in your terminal:

* `GithubAccessToken`, and
* `RegistryId`, which you can retrieve this value from your Repository URL, which should have the format `<RegistryId>.dkr.ecr.<region>.amazonaws.com`. Substitute, `region` with the AWS region that contains your ECR.

If the ECR registry size is not greater than the desired maximum, the cleanup script will not run. There are certain types of imageTags that will never be subject to deletion:

* ImageTags that do not resemble a Gitsha, or a 40 hex character string,
* ImageTags that are specified in the `--blacklist` flag parameter,
* ImageTags that cannot be retrieved from GitHub, and
* ImageTags that don't have associated commit dates on GitHub.
