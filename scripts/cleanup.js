#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */
const MAX_IMAGES = 10;
const MAX_PRIORITY_IMAGES = 5;
const AWS = require('aws-sdk');
const region = process.argv[2];
const repo = process.argv[3];
const tmpdir = process.argv[4];
const queue = require('d3-queue').queue;

if (!module.parent) {

  getImages(region, repo, (err, res) => {
    console.log(`region: ${region}, repo: ${repo}, tmpdir: ${tmpdir}`);
    if (err) handleCb(err);

    if (res.length < MAX_IMAGES)
      return handleCb(null, 'No images to delete, ECR has fewer than ${MAX_IMAGES}');

    imagesToDelete(res, (err, imageIds) => {
      if (err) handleCb(err);
      else if (!imageIds.length) return handleCb(null, 'No images were marked for deletion');
      console.log(`Deleting ${imageIds.join(',')}`);
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
  const q = queue(1);
  images = images.sort((a, b) => { return (new Date(a.imagePushedAt) - new Date(b.imagePushedAt));
  });

  let cruftDigests = [];
  let deployDigests = [];

  for(let img of images) {
    q.defer(commitType, img.imageTags[0], img.imageDigest);
  }

  q.awaitAll((err, data) => {
    if (err) return callback(err);

    for (let d of data) {
      for (let digest in d) {
        if (d[digest] === 'commit') cruftDigests.push({ imageDigest: digest });
        else if (d[digest] !== 'custom') deployDigests.push({ imageDigest: digest });
      }
    }

  });

  console.log('cruftDigests: ', cruftDigests.join(','));
  console.log('deployDigests: ', deployDigests.join(','));

  let digests = [];
  digests = digests.concat(cruftDigests.slice(0, (digests.length - (MAX_IMAGES - 1))));

  if (deployDigests.length > MAX_PRIORITY_IMAGES)
    digests = digests.concat(deployDigests.slice(0, (deployDigests.length - MAX_PRIORITY_IMAGES)));

  console.log('digests ', digests.join(','));
  return callback(null, digests);
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
function commitType(sha, digest, callback) {
  console.log('sha ', sha);
  const spawn = require('child_process').spawn;

  let type = {}; type[digest] = '';
  function shspawn(command, callback) {
    let cmd = spawn('sh', ['-c', command]);
    let stdout, stderr;
    cmd.stderr.on('data', err => {
      stderr = err.toString('utf-8').trim();
    });
    cmd.stdout.on('data', out => {
      stdout = out.toString('utf-8').trim();
    });
    cmd.on('close', () => {
      // An error is just the git command erroring, which means that the
      // output of the current command is void for determining type, as
      // opposed to a true error in the script. So, just return null,
      // instead of erroring.
      if (stderr && stderr.length) return callback(null, null);
      else return callback(null, stdout);
    });
  } 

  shspawn(`git --git-dir=${tmpdir}/.git cat-file -p ${sha} | grep -Ec '^parent [a-z0-9]{40}'`, (err, mergeCommitData) => {
    console.log('mergeCommitData ', mergeCommitData);
    if (err) return callback(err);
    else {
      if (mergeCommitData >= 2) {
        type[digest] = 'merge-commit';
        console.log(sha, type[digest]);
        return callback(null, type);
      }
      else {
        shspawn(`git --git-dir=${tmpdir}/.git tag | grep ${sha}`, (err, tagData) => {
          console.log('tagData ', tagData);
          if (err) return callback(err);
          else {
            if (tagData === sha) {
              type[digest] = 'tag';
              return callback(null, type);
            } else {
              shspawn(`git --git-dir=${tmpdir}/.git rev-parse --verify ${sha}`, (err, commitData) => {
                console.log('commitData ', commitData);
                if (err) return callback(err);
                else {
                  if (commitData === sha) {
                    type[digest] = 'commit';
                    console.log(sha, type[digest]);
                    return callback(null, type);
                  } else {
                    type[digest] = 'custom';
                    console.log(sha, type[digest]);
                    return callback(null, type);
                  }
                }
              });
            }
          }
        });
      }
    }
  });

}