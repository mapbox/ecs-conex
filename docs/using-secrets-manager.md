# Using AWS Secrets Manager

## Supported secrets

Both `GithubAccessToken` and `NPMAccessToken` can be stored and retrieved from AWS Secrets Manager instead of stored in encrypted CloudFormation parameters.

To override the default parameters and use AWS Secrets Manager, pass the name of the AWS Secrets Manager secret in the respective `SecretName` parameter.

For example if the `GithubAccessToken` value in Secrets Manager has the ARN `arn:aws:secretsmanager:region:account:secret:my-ecs-conex/github/accesstoken`, the parameter value for `GithubAccessTokenSecretName` should be `my-ecs-conex/github/accesstoken`.

If AWS Secrets Manager should not be used, set the `...SecretName` parameters to 'none'.

## Stored secrets format

`GithubAccessToken`: plaintext value containing the token string

`NPMAccessToken`: plaintext value containing a JSON string of the format `{ token: <npm access token> }`
