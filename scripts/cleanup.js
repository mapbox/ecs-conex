#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const AWS = require('aws-sdk');
const region = process.argv[2];
const repo = process.argv[3];
const tmpdir = process.argv[4];

if (!module.parent) {

  getImages(region, repo, (err, res) => {

    if (err) handleCb(err);

    if (res.length < 850)
      handleCb(null, 'No images to delete');

    const imageIds = imagesToDelete(res);
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
function imagesToDelete(images) {

  images = images.sort((a, b) => { return (new Date(a.imagePushedAt) - new Date(b.imagePushedAt));
  });

  let cruftDigests = [];
  let deployDigests = [];

  for(let img of images) {
    let type = commitType(img.imageTags[0]);
    if (type === 'commit') {
      cruftDigests.push({ imageDigest: img.imageDigest });
    } else if (type != 'custom'){
      deployDigests.push({ imageDigest: img.imageDigest });
    }
  }

  let digests = [];
  digests = digests.concat(cruftDigests.slice(0, (digests.length - 849)));

  if (deployDigests.length > 50)
    digests = digests.concat(deployDigests.slice(0, (deployDigests.length - 50)));

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

module.exports.commitType = commitType;
function commitType(sha) {
  const spawn = require('child_process').spawnSync;

  //First check if it's a merge commit
  let mergeCommit = spawn('grep', ['-Ec', '^parent [a-z0-9]{40}', spawn('git', [`--git-dir=${tmpdir}/.git`, 'cat-file', '-p', sha]).stdout]);
  if (mergeCommit.stdout >= 2 && !mergeCommit.stderr)
    return 'merge-commit';

  //No? Check if it's a tag
  let tag = spawn('grep', [sha, spawn('git', [`--git-dir=${tmpdir}/.git`, 'tag']).stdout]);
  if ((tag.stdout === sha) && !tag.stderr)
    return 'tag';

  //No? Check if it's a regular commit
  let commit = spawn('git', [`--git-dir=${tmpdir}/.git`, 'rev-parse', '--verify', sha]);
  if ((commit.stdout === sha) && !commit.stderr) 
    return 'commit';
  else
    return 'custom';

}
