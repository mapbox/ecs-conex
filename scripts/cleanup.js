#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */
const MAX_IMAGES = 10;
const MAX_PRIORITY_IMAGES = 5;
const AWS = require('aws-sdk');
const region = process.argv[2];
const repo = process.argv[3];
const tmpdir = `${process.argv[4]}/${repo}`;

if (!module.parent) {

  getImages(region, repo, (err, res) => {
    console.log(`region: ${region}, repo: ${repo}, tmpdir: ${tmpdir}`);
    if (err) handleCb(err);

    if (res.length < MAX_IMAGES)
      return handleCb(null, 'No images to delete, ECR has fewer than ${MAX_IMAGES}');

    const imageIds = imagesToDelete(res);

    if (!imageIds.length)
      return handleCb(null, 'No images were marked for deletion');
    console.log(`Deleting ${imageIds.join(',')}`);
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
    console.log(`commitType ${img.imageTags[0]}: ${type}`);
    if (type === 'commit') {
      cruftDigests.push({ imageDigest: img.imageDigest });
    } else if (type != 'custom'){
      deployDigests.push({ imageDigest: img.imageDigest });
    }
  }

  console.log('cruftDigests: ', cruftDigests.join(','));
  console.log('deployDigests: ', deployDigests.join(','));

  let digests = [];
  digests = digests.concat(cruftDigests.slice(0, (digests.length - (MAX_IMAGES - 1))));

  if (deployDigests.length > MAX_PRIORITY_IMAGES)
    digests = digests.concat(deployDigests.slice(0, (deployDigests.length - MAX_PRIORITY_IMAGES)));

  console.log('digests ', digests.join(','));
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

  // First check if it's a merge commit
  // git --git-dir=${tmpdir}/.git cat-file -p ${sha} | grep -Ec '^parent [a-z0-9]{40}' => every merge commit has two parents
  let mergeCommit = spawn('grep', ['-Ec', '^parent [a-z0-9]{40}'], {
    input: spawn('git', [`--git-dir=${tmpdir}/.git`, 'cat-file', '-p', sha]).stdout.toString('utf-8').trim()
  });
  if (mergeCommit.stdout.toString('utf-8').trim() >= 2 && !mergeCommit.stderr.length) {
    return 'merge-commit';
  }

  //No? Check if it's a tag
  //git --git-dir=${tmpdir}/.git tag | grep ${sha}
  let tag = spawn('grep', [sha], {
    input: spawn('git', [`--git-dir=${tmpdir}/.git`, 'tag']).stdout.toString('utf-8').trim()
  });
  if ((tag.stdout.toString('utf-8').trim() === sha) && !tag.stderr.length) {
    return 'tag';
  }

  //No? Check if it's a regular commit
  //git --git-dir=${tmpdir}/.git rev-parse --verify ${sha}
  let commit = spawn('git', [`--git-dir=${tmpdir}/.git`, 'rev-parse', '--verify', sha]);
  if ((commit.stdout.toString('utf-8').trim() === sha) && !commit.stderr.length) {
    return 'commit';
  }

  return 'custom';

}
