var AWS = require('aws-sdk');
var fs = require('fs');
var inquirer = require('inquirer');
var minimist = require('minimist');
var moment = require('moment');
var queue = require('d3-queue').queue;
var request = require('request');
var _ = require('underscore');

module.exports = {
  'validateInputs': validateInputs,
  'confirmInputs': confirmInputs,
  'listImages': listImages,
  'validateECRSize': validateECRSize,
  'isGitSha': isGitSha,
  'isBlacklisted': isBlacklisted,
  'getTimeStamps': getTimeStamps,
  'assignTimeStamps': assignTimeStamps,
  'mergeByProperty': mergeByProperty,
  'toDelete': toDelete,
  'deleteImages': deleteImages,
  'printImages': printImages
}

if (!module.parent) {
  validateInputs(function(err, params) {
    if (err) throw new Error(err);
    confirmInputs(params, function(confirmation) {
      if (confirmation === false) process.exit(1);
      params.githubAccessToken = process.env.GithubAccessToken;
      params.registryId = process.env.RegistryId;
      params.maximumImages = 90;
      run(params);
    })
  })
}

function validateInputs(callback) {
  var params = {};
  var argv = minimist(process.argv.slice(2));

  if (!argv._[0] || !argv._[1]) return callback('GitHub user name and repository name are required');
  if (argv.blacklist) try {
    var blacklistArr = argv.blacklist.split(',');
  } catch(err) {
    return callback('GitSha blacklist must be a comma-separated list');
  }

  params.user = argv._[0];
  params.repo = argv._[1];
  params.blacklist = (blacklistArr) ? blacklistArr : [];
  return callback(null, params);
}

function confirmInputs(params, callback) {
  console.log('');
  console.log(params);
  console.log('');
  inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmation',
      message: 'Ready to delete images? Any GitShas not blacklisted above are subject to deletion.',
      default: false
    }
  ]).then(function(answer) {
    return callback(answer.confirmation);
  })
}

function run(params) {
  var ecr = new AWS.ECR();
  listImages(ecr, params, function (err, res) {
    if (err) throw new Error(err);
    var result = res.imageIds;
    validateECRSize(result, params);
    result = isGitSha(result);
    result = isBlacklisted(result, params);
    getTimeStamps(result, params, function (err, res) {
      if (err) throw new Error(err);
      assignTimeStamps(result, res);
      var imagesToDelete = toDelete(result, params);
      // Leave this commented out unless you want to delete images:
      // deleteImages(ecr, params, imagesToDelete, function(err, res) {
      //   if (err) throw new Error(err);
      //   else console.log('[info] Successfully removed images from ECR');
      // })
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
  }
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

function isBlacklisted(array, params) {
  for (var i = 0; i < array.length; i++) {
    if (params.blacklist !== null && params.blacklist.indexOf(array[i].imageTag) !== -1) {
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
      }
      q.defer(request, options);
    }
  }

  q.awaitAll(function(error, response) {
    if (error) return callback(error);
    return callback(null, response);
  })
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
  }

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
  var sorted = _.sortBy(ableToDelete, function(o) { return o.date; });
  var toDelete = sorted.splice(0, deleteCount);
  return toDelete;
}

function deleteImages(ecr, params, array, callback) {
  console.log('[info] Deleting ' + array.length + ' images:');
  console.log(printImages(array));

  for (var i = 0; i < array.length; i++) {
    array[i] = _.pick(array[i], 'imageTag', 'imageDigest');
  }
  var params = {
    imageIds: array,
    repositoryName: params.repo,
    registryId: params.registryId
  }

  ecr.batchDeleteImage(params, function(err, data) {
    if (err) return callback(err);
    return callback(null, data)
  })
}

function printImages(array) {
  var string = '';
  for (var i = 0; i < array.length; i++) {
    string += ' * ' + array[i].imageTag + '\n';
  }
  return string;
}
