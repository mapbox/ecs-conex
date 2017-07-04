#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const AWS = require('aws-sdk');
const region = process.argv[2];
const repo = process.argv[3];
const githubAccessToken = process.argv[4];
const request = require('request');
const queue = require('d3-queue').queue;

if (!module.parent) {
  getImages(region, repo, (err, res) => {
    if (err) handleCb(err);
    imagesToDelete(res, (err, imageIds) => {
      if (!imageIds.length) handleCb(null, 'No images to delete');
      deleteImages(region, repo, imageIds, (err, res) => {
        if (err) handleCb(err);
        if (res) handleCb(null, res);
      });
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
function imagesToDelete(images, callback) {

  const max = 900;
  const validated = images.filter((e) => { return e.imageTags && /^[a-z0-9]{40}$/.test(e.imageTags[0]); });
  const sorted = validated.sort((a, b) => { return new Date(a.imagePushedAt) - new Date(b.imagePushedAt); });
  githubCommitImages(sorted.splice(0, images.length - max + 1), (err, spliced) => {
    const digests = spliced.map((e) => { return { imageDigest: e.imageDigest, imageTag: e.imageTag }; });
    return callback(null, digests);
  });
}

module.exports.githubCommitImages = githubCommitImages;
function githubCommitImages(images, callback) {
  let q = new queue(1);
  let owner = 'mapbox';
  let baseUrl = `https://api.github.com/repos/${owner}/${repo}/commits`;
  images.forEach(image => {
    let options = {
      url: `${baseUrl}/${image.imageTags[0]}`,
      headers: {
        'User-Agent': 'mapbox',
        Authorization: `token ${githubAccessToken}`
      }
    };
    q.defer(getCommit, image, options);
  });
  q.awaitAll((err, validCommits) => {
    return callback(null, validCommits);
  });
}

function getCommit(image, options, callback) {
  request.get(options, (err, response) => {
    if (err || response.statusCode != 200)
      return callback();
    return callback(null, image);
  });
}

module.exports.deleteImages = deleteImages;
function deleteImages(region, repo, imageIds, callback) {
  let ecr = new AWS.ECR({ region: region });
  ecr.batchDeleteImage({
    imageIds: imageIds,
    repositoryName: repo
  }, callback);
}
