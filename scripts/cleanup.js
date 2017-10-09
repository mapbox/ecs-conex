#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

/**
 * "Generic" images are those that were built by conex for individual git
 * commits. "Priority" images are those built by conex for merge commits or
 * tags. We want there to never be more than 900 images in the repository. If
 * the number of images in the repository is greater than 900, we begin by
 * deleting the oldest "generic" images. If we still need to delete more images
 * to get to 900, we begin deleting old "priority" images, but always leave at
 * least 50 of them in the repository.
 */
const MAX_IMAGES = 900;
const MIN_PRIORITY_IMAGES = 50;

const AWS = require('aws-sdk');
const queue = require('d3-queue').queue;
const child_process = require('child_process');

function handleCb(err, res) {
  err ? console.log(err) : console.log(res);
  err ? process.exit(1) : process.exit(0);
}

if (!module.parent) {
  const region = process.argv[2];
  const repo = process.argv[3];
  const gitdir = process.argv[4];

  getImages(region, repo, (err, res) => {
    if (err) return handleCb(err);

    if (res.length < MAX_IMAGES)
      return handleCb(null, `No images to delete, ECR has fewer than ${MAX_IMAGES}`);

    imagesToDelete(res, gitdir, (err, imageIds) => {
      if (err) return handleCb(err);
      else if (!imageIds.length)
        return handleCb(null, 'No images were marked for deletion');

      console.log(`Deleting ${imageIds.length} images`);
      console.log(JSON.stringify(imageIds));

      deleteImages(region, repo, imageIds, (err, res) => {
        if (err) handleCb(err);
        if (res) handleCb(null, res);
      });
    });
  });
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

      if (!data.nextToken) return callback(null, details);

      describeImages(repo, data.nextToken, callback);
    });
  }

}

module.exports.imagesToDelete = imagesToDelete;
function imagesToDelete(images, gitdir, callback) {
  const q = queue(1);
  const generic = [];
  const priority = [];

  // Sort oldest to newest, categorize each image
  images
    .sort((a, b) => new Date(a.imagePushedAt) - new Date(b.imagePushedAt))
    .forEach((img) => q.defer(commitType, img.imageTags[0], img.imageDigest, gitdir));

  q.awaitAll((err, data) => {
    if (err) return callback(err);

    // Select generic images and priority images
    data.forEach((result) => {
      if (result.type === 'generic')
        generic.push({ imageDigest: result.digest });
      if (result.type === 'priority')
        priority.push({ imageDigest: result.digest });
    });

    // We want to leave the repository with MAX_IMAGES number of images in it.
    let imagesToDelete;
    let excessImages = images.length - MAX_IMAGES;
    if (excessImages <= 0) return callback(null, []);

    // First take old images from generic commits
    imagesToDelete = []
      .concat(generic.slice(0, excessImages));

    // Determine whether we still need to delete more images
    excessImages = excessImages - imagesToDelete.length;
    if (excessImages <= 0) return callback(null, imagesToDelete);

    // Make sure that we always leave at least 50 priority images
    excessImages = Math.max(
      Math.min(priority.length - MIN_PRIORITY_IMAGES, excessImages),
      0
    );

    // Select the oldest priority images for removal
    imagesToDelete = imagesToDelete
      .concat(priority.slice(0, excessImages));

    return callback(null, imagesToDelete);
  });
}

module.exports.deleteImages = deleteImages;
function deleteImages(region, repositoryName, images, callback) {
  const ecr = new AWS.ECR({ region: region });

  // Must delete images in batches of 100 max
  const remaining = JSON.parse(JSON.stringify(images));
  const imageIds = remaining.splice(0, 100);

  if (!imageIds.length) return callback();

  ecr.batchDeleteImage({ imageIds, repositoryName }, (err) => {
    if (err) return callback(err);
    deleteImages(region, repositoryName, remaining, callback);
  });
}

module.exports.commitType = commitType;
function commitType(sha, digest, gitdir, callback) {
  const result = { digest, type: '' };

  function run(command, callback) {
    child_process.exec(command, (err, stdout) => {
      if (err) return callback();
      callback(null, stdout.trim());
    });
  }

  const merge = `git --git-dir=${gitdir}/.git cat-file -p ${sha} | grep -Ec '^parent [a-z0-9]{40}'`;
  const tag = `git --git-dir=${gitdir}/.git tag | grep ${sha}`;
  const commit = `git --git-dir=${gitdir}/.git rev-parse --verify ${sha}`;

  run(merge, (err, mergeCommitData) => {
    if (err) return callback(err);
    if (mergeCommitData >= 2) {
      result.type = 'priority';
      return callback(null, result);
    }

    run(tag, (err, tagData) => {
      if (err) return callback(err);
      if (tagData === sha) {
        result.type = 'priority';
        return callback(null, result);
      }

      run(commit, (err, commitData) => {
        if (err) return callback(err);
        result.type = commitData === sha
          ? 'generic' : 'custom';

        return callback(null, result);
      });
    });
  });
}
