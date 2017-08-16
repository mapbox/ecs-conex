#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const AWS = require('aws-sdk');
const region = process.argv[2];
const repo = process.argv[3];

if (!module.parent) {
  getImages(region, repo, (err, res) => {
    if (err) handleCb(err);
    // Delete anything older than the 50 commits on the default branch
    // and anything older than 849 commits on any other branch
    const classifier = [{
      count: 50,
      priority: 1,
      pattern: /^merge\-commit$|^tag$|^custom$/
    }, {
      count: 849,
      priority: 2,
      pattern: /^commit$/
    }];
    const imageIds = imagesToDelete(res, classifier);
    if (!imageIds.length) handleCb(null, 'No images to delete');
    deleteImages(region, repo, imageIds, (err, res) => {
      if (err) handleCb(err);
      if (res) handleCb(null, res);
    });
  });
}

module.exports.handleCb = handleCb;
function handleCb(err, res) {
  err ? console.log(err) : console.log(res);
  err ? process.exit(1) : process.exit(0);
}

module.exports.getImages = getImages;
function getImages(region, repo, callback) {
  let details = [];
  let ecr = new AWS.ECR({ region: region });
  describeImages(repo, null, callback);

  function describeImages(repo, token) {
    let params = { repositoryName: repo };
    if (token) params.nextToken = token;

    ecr.describeImages(params, (err, data) => {
      if (err) return callback(err);
      details = details.concat(data.imageDetails);
      data.nextToken ? describeImages(repo, data.nextToken, callback) : callback(null, details);
    });
  }
}

module.exports.imagesToDelete = imagesToDelete;
function imagesToDelete(images, classifier) {
  classifier = classifier.sort((a, b) => {
    return a.priority - b.priority;
  });
  //[newest, newer, new,...., old, older, oldest]
  images = images.sort((a, b) => { return new Date(b.imagePushedAt) - new Date(a.imagePushedAt);
  });
  //ignore the first X images that match the pattern, since they are new and need to be stored in the ECR, return the older ones.
  let validated = images.filter((e) => {
    for (let c = 0; c < classifier.length; c++) {
      // console.log(e, e.imageTags, e.imageTags.join(' '));
      if (classifier[c].pattern.test(e.imageTags.join(' '))) {
        // console.log(e.imageTags.join(' '), classifier[c].pattern, classifier[c].pattern.test(e.imageTags.join(' ')), classifier[c].count);
        if (classifier[c].count < 1) {
          return true;
        } else {
          classifier[c].count--;
          return;
        }
      }
    }
    return false;
  });
  const digests = validated.map((e) => { return { imageDigest: e.imageDigest }; });
  return digests;
}

module.exports.deleteImages = deleteImages;
function deleteImages(region, repo, imageIds, callback) {
  let ecr = new AWS.ECR({ region: region });
  ecr.batchDeleteImage({
    imageIds: imageIds,
    repositoryName: repo
  }, callback);
}
