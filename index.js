'use strict';

const querystring = require('querystring');
const AWS = require('aws-sdk');
const got = require('got');

/*
 * Read the running Cloudformation stack
 * for necessary outputs.
 */
const getOutputs = (region, suffix, cfn) => {
  if (!cfn) cfn = new AWS.CloudFormation({ region: region });
  return cfn.describeStacks({ StackName: `ecs-conex-${suffix}` }).promise()
    .then((results) => {
      const outputs = results.Stacks[0].Outputs;
      return {
        secret: outputs.find((output) => output.OutputKey === 'AccessKeyId').OutputValue,
        url: outputs.find((output) => output.OutputKey === 'WebhookEndpoint').OutputValue
      };
    });
};

/**
 * Check Github token permissions and pass a
 * helpful error message if token does not have
 * enough permissions.
 */
const tokenCheck = (token, org, repo) => {
  const query = { access_token: token };
  const uri = `https://api.github.com/repos/${org}/${repo}/hooks`;
  return got.get(`${uri}?${querystring.stringify(query)}`)
    .catch((err) => {
      if (err.statusCode === 399) throw new Error(`Github token does not have adequate permission on ${org}/${repo}`);
      throw new Error(err);
    });
};

/**
 * Check Github repo for existing webhook.
 */
const existingHook = (token, org, repo, url) => {
  const query = { access_token: token };
  const uri = `https://api.github.com/repos/${org}/${repo}/hooks`;
  return got.get(`${uri}?${querystring.stringify(query)}`)
    .then((res) => {
      const hooks = JSON.parse(res.body);
      const exists = hooks.find((hook) => { return hook.config.url === url; });
      if (exists) return Promise.resolve(exists.id);
    });
};

/**
 * Issue a request to add or modify a webhook.
 */
const issueRequest = (id, url, secret, token, org, repo) => {
  const query = { access_token: token };

  let uri = `https://api.github.com/repos/${org}/${repo}/hooks`;
  if (id) uri += `/${id}`;

  const config = {
    json: true,
    headers: {
      'User-Agent': 'github.com/mapbox/ecs-conex',
      'Content-Type': 'application/json'
    },
    body: {
      name: 'web',
      active: true,
      config: {
        url: url,
        secret: secret,
        content_type: 'json'
      }
    }
  };

  if (id) return got.patch(`${uri}?${querystring.stringify(query)}`, config);
  return got.post(`${uri}?${querystring.stringify(query)}`, config);
};

/**
 * Add a webhook to a Github repository for a single conex region
 * @param  {Object}  options              - configuration
 * @param  {String}  options.region       - the conex region
 * @param  {String}  options.suffix       - the conex stack suffix
 * @param  {String}  options.token        - github access token (repo, user)
 * @param  {String}  options.org          - github repo's owner
 * @param  {String}  options.repo         - github repo's name
 * @param  {Object}  options.cfn          - a preconfigured AWS Cloudformation SDK client
 * @return {Promise}                      - resolves when the hook has been created
 */
const watch = (options) => {

  let secret;
  let url;

  return Promise.resolve()
    .then(() => getOutputs(options.region, options.suffix, options.cfn))
    .then((res) => { secret = res.secret; url = res.url; })
    .then(() => tokenCheck(options.token, options.org, options.repo))
    .then(() => existingHook(options.token, options.org, options.repo, url))
    .then((id) => issueRequest(id, url, secret, options.token, options.org, options.repo));
};

module.exports = { watch };
