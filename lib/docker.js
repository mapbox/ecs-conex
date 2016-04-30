var exec = require('child_process').exec;
var AWS = require('aws-sdk');
var d3 = require('d3-queue');
var split = require('binary-split');

var ecrRegions = [
  'us-east-1',
  'us-west-2',
  'eu-west-1'
];

module.exports = function(details, log) {
  var logins = {};
  var uris = {};

  function run(cmd, callback) {
    var child = exec(cmd, callback);
    child.stdout.pipe(split()).on('data', function(d) { log.info(d.toString()); });
    child.stderr.pipe(split()).on('data', function(d) { log.error(d.toString()); });
  }

  function getRepository(region, callback) {
    if (uris[region]) return callback(null, uris[region]);

    var ecr = new AWS.ECR({ region: region });
    ecr.describeRespositories({ repositoryNames: [details.repo] }, function(err, data) {
      if (err) return callback(err);
      if (data.repositories.length) return callback(null, data.repositories[0].repositoryUri);
      ecr.createRepository({ repositoryName: details.repo }, function(err, data) {
        if (err) return callback(err);
        callback(null, data.repositoryUri);
      });
    });
  }

  return {
    login: function(callback) {
      if (Object.keys(logins).length === ecrRegions.length) return callback();

      var queue = d3.queue();

      ecrRegions.forEach(function(region) {
        queue.defer(function(next) {
          var ecr = new AWS.ECR({ region: region });
          ecr.getAuthorizationToken(function(err, data) {
            if (err) return next(err);
            var auth = data.authorizationData[0];
            logins[region] = `docker login -u AWS -p ${auth.authorizationToken} -e none ${data.proxyEndpoint}`;
            next();
          });
        });
      });

      queue.awaitAll(callback);
    },

    repositories: function(callback) {
      if (Object.keys(uris).length === ecrRegions.length) return callback();

      var queue = d3.queue();

      ecrRegions.forEach(function(region) {
        queue.defer(getRepository, region);
      });

      queue.awaitAll(function(err, data) {
        if (err) return callback(err);
        uris = data;
      });
    },

    fetch: function(callback) {
      getRepository('us-east-1', function(err) {
        if (err) return callback(err);
        var image = details.beforeImage.replace('REGION', 'us-east-1');
        run(`${logins['us-east-1']} && docker pull ${image}`, function(err) {
          if (err && err === 'does not exist') return callback();
          callback(err);
        });
      });
    },

    build: function(callback) {
      run(`docker build -t ${details.repo} .`, callback);
    },

    push: function(callback) {
      var queue = d3.queue(1);

      ecrRegions.forEach(function(region) {
        queue.defer(function(next) {
          var image = details.afterImage.replace('REGION', region);
          run(`docker tag ${details.repo}:latest ${image}`, function(err) {
            if (err) return next(err);
            run(`${logins[region]} && docker push ${image}`, next);
          });
        });
      });

      queue.awaitAll(callback);
    }
  };
};
