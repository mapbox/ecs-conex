var AWS = require('aws-sdk');
var fs = require('fs');
var moment = require('moment');
var queue = require('d3-queue').queue;
var request = require('request');
var _ = require('underscore');

module.exports = {
  'validateECRSize': validateECRSize,
  'isGitSha': isGitSha,
  'isWhitelisted': isWhitelisted,
  'getTimeStamps': getTimeStamps,
  'assignTimeStamps': assignTimeStamps,
  'mergeByProperty': mergeByProperty,
  'toDelete': toDelete,
  'deleteImages': deleteImages
}

if (!module.parent) {
  var params = {
    user: process.argv[2],
    repo: process.argv[3],
    whitelist: process.argv[4],
    githubAccessToken: process.env.GithubAccessToken,
    maximumImages: 50
  };
  params.whitelist = (params.whitelist) ? params.whitelist.split(',') : null;
  run(params);
}

function run(params) {
  var ecr = new AWS.ECR();
  listImages(ecr, params, function (err, res) {
    if (err) throw new Error(err);
    var result = res.imageIds;
    validateECRSize(result, params);
    result = isGitSha(result);
    result = isWhitelisted(result, params);
    getTimeStamps(result, params, function (err, res) {
      if (err) throw new Error(err);
      assignTimeStamps(result, res);
      var imagesToDelete = toDelete(result, params);
      deleteImages(imagesToDelete);
    })
  })
}

function listImages(ecr, params, callback) {
  ecr.listImages({ repositoryName: params.repo }, function (err, data) {
    if (err) return callback(err);
    return callback(null, data);
  })
}

function validateECRSize(array, params) {
  var count = array.length;
  if (count < params.maximumImages) {
    throw new Error('[ecs-conex cleanup] '+ params.repo + ' has ' + count + ' images, which is less than ' + params.maximumImages + '. No clean-up required.');
  };
}

function isGitSha(array) {
  for (var i = 0; i < array.length; i++) {
    if (array[i].imageTag !== undefined && array[i].imageTag.match(/^[a-z0-9]{40}$/)) {
      array[i]['ableToDelete'] = true;
    } else {
      console.log('[will not delete] Image tag ' + array[i].imageTag + ' did not resemble a GitSha.');
      array[i]['ableToDelete'] = false;
    }
  }
  return array;
}

function isWhitelisted(array, params) {
  for (var i = 0; i < array.length; i++) {
    if (params.whitelist !== null && params.whitelist.indexOf(array[i].imageTag) !== -1) {
      console.log('[will not delete] Image tag ' + array[i].imageTag + ' is whitelisted.');
      array[i]['ableToDelete'] = false;
    }
  }
  return array;
}

function getTimeStamps(array, params, callback) {
  var q = queue(10);
  for (var i = 0; i < array.length; i++) {
    var match = _.isMatch(array[i], { ableToDelete: true });
    if (match) {
      var options = {
        url: 'https://api.github.com/repos/' + params.user + '/' + params.repo + '/commits/' + array[i].imageTag + '?access_token=' + params.githubAccessToken,
        headers: { 'User-agent': 'request' }
      };
      q.defer(request, options);
    }
  }

  q.awaitAll(function(error, response) {
    if (error) return callback(error);
    return callback(null, response);
  });
}

function assignTimeStamps(array, response) {
  var dates = [];
  for (var i = 0; i < response.length; i++) {
    if (response[i].statusCode !== 200) {
      var commit = response[i].request.uri.pathname.match(/\/([a-z0-9]*)$/)[1];
      console.log('[will not delete] Image tag ' + commit + ' could not be retrieved from GitHub.');
      dates.push({ imageTag: commit, ableToDelete: false });
    } else {
      var result = JSON.parse(response[i].body);
      dates.push({ imageTag: result.sha, date: moment(result.commit.author.date).unix() });
    }
  };

  mergeByProperty(array, dates, 'imageTag');
  return array;
}

function mergeByProperty(arr1, arr2, prop) {
  _.each(arr2, function(arr2object) {
    var arr1object = _.find(arr1, function(arr1object) {
      return arr1object[prop] === arr2object[prop];
    });
    arr1object ? _.extend(arr1object, arr2object) : console.log('[warning] Image tag ' + arr2object.imageTag + ' was queried for a commit date, but does not map to an ECR image.');
  })
}

function toDelete(array, params) {
  var ableToDelete = [];
  for (var i = 0; i < array.length; i++) {
    var deletable = _.isMatch(array[i], { ableToDelete: true });
    if (deletable) ableToDelete.push(array[i]);
  }

  var deleteCount = array.length - params.maximumImages;
  var sorted = _.sortBy(ableToDelete, function(o) { return o.date * -1; });
  var start = sorted.length - deleteCount;
  var toDelete = sorted.splice(start, deleteCount);
  return toDelete;
}

function deleteImages(array) {
  console.log('[info] Deleting ' + array.length + ' images...');
}
