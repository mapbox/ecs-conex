var AWS = require('aws-sdk');
var moment = require('moment');
var queue = require('d3-queue').queue;
var request = require('request');
var _ = require('underscore');

var ecr = new AWS.ECR();
var params = {
  user: process.argv[2],
  repo: process.argv[3],
  GithubAccessToken: process.env.GithubAccessToken,
  maximumImages: 50
}

ecr.listImages({ repositoryName: params.repo }, function (err, data) {
  if (err) console.log(err, err.stack);
  var result = data.imageIds;
  var imageCount = validateECRSize(result, params);
  result = isGitSha(result);
  var deleteCount = numberToDelete(result, imageCount, params);
  toDelete(result, deleteCount, params, function (err, res) {
    if (err) throw new Error(err);
    var imagesToDelete = res;
    // Next steps:
    //   - Write function to delete images
    //   - Refactor this execution into its own function
    //   - Tests
  });
})

function validateECRSize(result, params) {
  var imageCount = result.length;
  if (imageCount < params.maximumImages) {
    console.log('[ecs-conex cleanup]', params.repo, 'has', imageCount, 'images, which is less than', params.maximumImages + '. No clean-up required.')
    process.exit(1)
  } else {
    return imageCount;
  }
}

function isGitSha(array) {
  for (var i = 0; i < array.length; i++) {
    if (array[i].imageTag !== undefined && array[i].imageTag.match(/^[a-z0-9]{40}$/)) {
      array[i]['delete'] = '';
    } else {
      console.log('[will not delete] Image tag "' + array[i].imageTag + '" did not resemble a GitSha.');
      array[i]['delete'] = false;
    }
  }
  return array;
}

function numberToDelete(array, imageCount, params) {
  var deleteCount = imageCount - params.maximumImages;
  for (var i = 0; i < array.length; i++) {
    var match = _.isMatch(array[i], { delete: false });
    if (match) deleteCount++
  };
  return deleteCount;
}

function toDelete(array, deleteCount, params, callback) {
  var q = queue(10);
  for (var i = 0; i < array.length; i++) {
    var match = _.isMatch(array[i], { delete: '' });
    if (match) {
      var options = {
        url: 'https://api.github.com/repos/' + params.user + '/' + params.repo + '/commits/' + array[i].imageTag + '?access_token=' + params.GithubAccessToken,
        headers: { 'User-agent': 'request' }
      };
      q.defer(request, options);
    }
  }

  q.awaitAll(function (error, response) {
    if (error) return callback(error);
    var results = [];
    for (var i = 0; i < response.length; i++) {
      if (response[i].statusCode !== 200) {
        var commit = response[i].request.uri.pathname.match(/\/([a-z0-9]*)$/)[1];
        deleteCount++;
        console.log('[will not delete] Image tag ' + commit + ' could not be retrieved from GitHub.');
      } else {
        var result = JSON.parse(response[i].body);
        var object = {
          imageTag: result.sha,
          date: moment(result.commit.author.date).unix()
        };
        results.push(object);
      }
    };
    var sorted = _.sortBy(results, function(o) { return o.date * -1; });
    var end = sorted.length - 1;
    var start = end - deleteCount + 1;
    var toDelete = sorted.splice(start, end);
    return callback(null, toDelete);
  })
}
