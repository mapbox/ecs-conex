var fastlog = require('fastlog');
var parse = require('./lib/parse');
var docker = require('./lib/docker');
var github = require('./lib/github');

module.exports = function(config, callback) {
  var log = fastlog('ecr-image-ci', 'info', '[${timestamp}] [${level}] [${category}] [' + config.id + ']');

  function failed(err) {
    log.error(err);
    callback(err);
  }

  var details;
  try {
    details = parse(config);
  } catch (err) {
    return failed(new Error('Failed to parse message: ' + config.message));
  }

  log.info(`${details.user} | ${details.before} to ${details.after} | ${details.repo} / ${details.ref}`);

  var dockerClient = docker(details, log);
  var githubClient = github(details, log);

  log.info('---> clone repository');
  githubClient.clone(function(err) {
    if (err) return failed(err);
    log.info('---> fetch registry credentials');
    dockerClient.login(loggedIn);
  });

  function loggedIn(err) {
    if (err) return failed(err);
    log.info('---> fetch previous image');
    dockerClient.fetch(details, fetched);
  }

  function fetched(err) {
    if (err) return failed(err);
    log.info('---> build new docker image');
    dockerClient.build(details, built);
  }

  function built(err) {
    if (err) return failed(err);
    log.info('---> push new images');
    dockerClient.push(details, pushed);
  }

  function pushed(err) {
    if (err) return failed(err);
    log.info('---> cleanup repo');
    githubClient.cleanup(callback);
  }
};
