#!/usr/bin/env node

var AWS = require('aws-sdk');
var inquirer = require('inquirer');
var minimist = require('minimist');
var moment = require('moment');
var queue = require('d3-queue').queue;
var request = require('request');
var _ = require('underscore');

module.exports = {
  validateInputs: validateInputs,
  confirmInputs: confirmInputs,
  listImages: listImages,
  validateECRSize: validateECRSize,
  isGitSha: isGitSha,
  isBlacklisted: isBlacklisted,
  getTimeStamps: getTimeStamps,
  assignTimeStamps: assignTimeStamps,
  dateCheck: dateCheck,
  toDelete: toDelete,
  deleteImages: deleteImages,
  mergeByProperty: mergeByProperty,
  wontDelete: wontDelete,
  willDelete: willDelete
};

if (!module.parent) {
  var arguments = process.argv.slice(2);
  validateInputs(arguments, function(err, params) {
    if (err) throw new Error(err);
    confirmInputs(params, function(confirmation) {
      if (confirmation === false) process.exit(1);
      var ecr = new AWS.ECR();
      listImages(ecr, params, function(err, res) {
        if (err) throw new Error(err);
        var result = res.imageIds;
        validateECRSize(result, params);
        isGitSha(result);
        isBlacklisted(result, params);
        getTimeStamps(result, params, function(err, res) {
          if (err) throw new Error(err);
          assignTimeStamps(result, res);
          dateCheck(result);
          var imagesToDelete = toDelete(result, params);
          deleteImages(ecr, params, imagesToDelete, function(err) {
            if (err) throw new Error(err);
            else console.log('[info] Successfully removed images from ECR');
          });
        });
      });
    });
  });
}

function validateInputs(arguments, callback) {
  var params = {};
  var argv = minimist(arguments);

  if (!argv._[0] || !argv._[1]) return callback('GitHub user name and repository name are required');
  if (argv.maximum && !_.isNumber(argv.maximum)) return callback('Desired maximum number of images to leave in ECR should be a number');
  if (argv.maximum && (argv.maximum < 0 || argv.maximum > 1000)) return callback('Desired maximum number of images to leave in ECR should be between 0 and 1000');
  if (argv.blacklist) try {
    var blacklistArr = argv.blacklist.split(',');
  } catch(err) {
    return callback('Blacklisted imageTags must be a comma-separated list');
  }

  params.user = argv._[0];
  params.repo = argv._[1];
  params.maximum = argv.maximum || 750;
  params.blacklist = (blacklistArr) ? blacklistArr : [];
  params.githubAccessToken = process.env.GithubAccessToken;
  params.registryId = process.env.RegistryId;

  return callback(null, params);
}

function confirmInputs(params, callback) {
  console.log('');
  console.log(_.omit(params, 'githubAccessToken', 'registryId'));
  console.log('');
  inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmation',
      message: 'Ready to delete images? Any imageTags not blacklisted above are subject to deletion.',
      default: false
    }
  ]).then(function(answer) {
    return callback(answer.confirmation);
  });
}

function listImages(ecr, params, callback) {
  var data = { imageIds:[] };
  ecr.listImages({ repositoryName: params.repo }).eachItem(function(err, item) {
    if (err) {
      callback && callback(err);
      callback = false;
    } else if (!item) {
      callback(null, data);
    } else {
      data.imageIds.push(item);
    }
  });
}

function validateECRSize(array, params) {
  var count = array.length;
  if (count < params.maximum) {
    throw new Error('The repository ' + params.user + '/' + params.repo + ' has ' + count + ' images, which is less than the desired ' + params.maximum + ' image maximum. No clean-up required.');
  }
}

function isGitSha(array) {
  for (var i = 0; i < array.length; i++) {
    if (array[i].imageTag !== undefined && array[i].imageTag.match(/^[a-z0-9]{40}$/)) {
      array[i]['ableToDelete'] = true;
    } else {
      wontDelete(array[i], 'Did not resemble a GitSha', true);
    }
  }
}

function isBlacklisted(array, params) {
  for (var i = 0; i < array.length; i++) {
    if (params.blacklist !== null && params.blacklist.indexOf(array[i].imageTag) !== -1) {
      wontDelete(array[i], 'ImageTag is blacklisted', true);
    }
  }
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
      wontDelete(array[i], 'ImageTag could not be retrieved from GitHub');
      dates.push({ imageTag: commit, ableToDelete: false });
    } else {
      var result = JSON.parse(response[i].body);
      dates.push({ imageTag: result.sha, date: moment(result.commit.author.date).unix() });
    }
  }

  mergeByProperty(array, dates, 'imageTag');
  return array;
}

function dateCheck(array) {
  for (var i = 0; i < array.length; i++) {
    if (array[i].ableToDelete === true && !array[i].date) {
      wontDelete(array[i], 'ImageTag date could not be mapped from GitHub', true);
    }
  }
}

function toDelete(array, params) {
  var ableToDelete = [];
  for (var i = 0; i < array.length; i++) {
    var deletable = _.isMatch(array[i], { ableToDelete: true });
    if (deletable) ableToDelete.push(array[i]);
  }

  var deleteCount = array.length - params.maximum;
  var sorted = _.sortBy(ableToDelete, function(o) { return o.date; });
  var toDelete = sorted.splice(0, deleteCount);
  return toDelete;
}

function deleteImages(ecr, params, array, callback) {
  for (var i = 0; i < array.length; i++) {
    willDelete(array, i);
    array[i] = _.pick(array[i], 'imageTag', 'imageDigest');
  }

  var options = {
    imageIds: array,
    repositoryName: params.repo,
    registryId: params.registryId
  };

  ecr.batchDeleteImage(options, function(err, data) {
    if (err) return callback(err);
    return callback(null, data);
  });
}

// Utility functions

function mergeByProperty(arr1, arr2, prop) {
  _.each(arr2, function(arr2object) {
    var arr1object = _.find(arr1, function(arr1object) {
      return arr1object[prop] === arr2object[prop];
    });
    arr1object ? _.extend(arr1object, arr2object) : console.log('[warning] Image tag ' + arr2object.imageTag + ' was queried for a commit date, but does not map to an ECR image.');
  });
}

function wontDelete(object, message, tag) {
  console.log('[wont-delete] [' + object.imageDigest + '] [' + object.imageTag + '] ' + message);
  if (tag) object['ableToDelete'] = false;
}

function willDelete(array, index) {
  console.log('[will-delete] [' + array[index].imageDigest + '] [' + array[index].imageTag + '] Deleting image ' + (index + 1) + ' of ' + array.length);
}
