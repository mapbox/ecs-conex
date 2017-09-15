'use strict';

/* eslint-disable no-console */
process.argv[4] = '.';
const AWS = require('@mapbox/mock-aws-sdk-js');
const sinon = require('sinon');
const test = require('tape');
const file = require(`${__dirname}/../scripts/cleanup`);
const region = 'us-east-1';
const repo = 'some-repo';
const token = 'sometoken';
const error = 'some error';
const success = 'some success';
const imagesNoToken = require(`${__dirname}/fixtures/imagesNoToken.test.json`);
const imagesToken = require(`${__dirname}/fixtures/imagesToken.test.json`);
const imageDetails = imagesNoToken.imageDetails.concat(imagesToken.imageDetails);
const imageIds = [{ imageDigest: imagesNoToken.imageDetails[1].imageDigest }];

test('mockSpawn', (t) => {
  let gitMergeCommitStdout;
  let spawns = (command, args) => {
    // console.log(command, args);
    switch(command) {
    case 'git':
      if(args[3] === 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' || args[3] === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') {
        t.equals(args[0], `--git-dir=${process.argv[4]}/.git`);
        t.equals(args[1], 'cat-file');
        t.equals(args[2], '-p');
        gitMergeCommitStdout = 'tree 0d940225e15e857ed0976a877f7cdc0456d88e90 \n\
        parent 568ba934652ab30828ac0925c53b3bcd1634c31d \n\
        parent 377a27d42a61c62758087869d87d3f12ef10530f \n\
        author Brendan McFarland <brendan@mapbox.com> 1502743733 -0400 \n\
        committer GitHub <noreply@github.com> 1502743733 -0400 \n\
        \n\
        Merge pull request #15 from mapbox/categorizer';
        return { stdout: gitMergeCommitStdout };
      } else if(args[3] === '0000000000000000000000000000000000000000' || args[3] === 'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh') {
        t.equals(args[0], `--git-dir=${process.argv[4]}/.git`);
        t.ok((args[1] === 'cat-file' || args[1] === 'rev-parse'));
        t.ok((args[2] === '-p' || args[1] === '--verify'));
        return { stdout: args[3], stderr: null };
      }
      break;
    case 'grep':
      if (args[2] === gitMergeCommitStdout || args[2] === '0000000000000000000000000000000000000000' || args[2] === 'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh') {
        t.equals(args[0], '-Ec');
        t.equals(args[1], '^parent [a-z0-9]{40}');
        return { stdout: '2', stderr: null };
      }

    }
  };
  require('child_process').spawnSync = spawns;
  t.end();
});

test('handleCb, error', (t) => {
  let stub = sinon.stub(process, 'exit');
  let log = sinon.stub(console, 'log');
  file.handleCb(error);
  console.log.restore();
  t.equal(stub.getCall(0).args[0], 1, 'error should exit 1');
  t.equal(log.getCall(0).args[0], error, 'should log error');
  process.exit.restore();
  t.end();
});

test('handleCb, error', (t) => {
  let stub = sinon.stub(process, 'exit');
  let log = sinon.stub(console, 'log');
  file.handleCb(null, success);
  console.log.restore();
  t.equal(stub.getCall(0).args[0], 0, 'success should exit 0');
  t.equal(log.getCall(0).args[0], success, 'should log success');
  process.exit.restore();
  t.end();
});

test('getImages, error', (t) => {
  let stub = AWS.stub('ECR', 'describeImages').yields(error);
  file.getImages(region, repo, (err) => {
    t.deepEqual(stub.getCall(0).args[0], { repositoryName: repo }, 'ecr.describeImages is passed repositoryName param');
    t.equal(err, error, 'yields expected error message');
    AWS.ECR.restore();
    t.end();
  });
});

test('getImages, success (no nextToken)', (t) => {
  let stub = AWS.stub('ECR', 'describeImages').yields(null, imagesNoToken);
  file.getImages(region, repo, (err, res) => {
    t.deepEqual(stub.getCall(0).args[0], { repositoryName: repo }, 'ecr.describeImages is passed repositoryName param');
    t.deepEqual(res, imagesNoToken.imageDetails, 'yields expected imageDetails array');
    AWS.ECR.restore();
    t.end();
  });
});

test('getImages, success (nextToken)', (t) => {
  let stub = AWS.stub('ECR', 'describeImages');
  stub.onCall(0).yields(null, imagesToken);
  stub.onCall(1).yields(null, imagesNoToken);
  file.getImages(region, repo, (err, res) => {
    t.equal(stub.callCount, 2, 'ecr.describeImages should be called twice');
    t.deepEqual(stub.getCall(0).args[0], { repositoryName: repo }, 'ecr.describeImages is passed repositoryName param');
    t.deepEqual(stub.getCall(1).args[0], { repositoryName: repo, nextToken: token }, 'ecr.describeImages is passed repositoryName and nextToken params');
    const sortedRes = res.sort(function(a, b) {
      return a.imageSizeInBytes - b.imageSizeInBytes;
    });
    const sortedImageDetails = imageDetails.sort(function(a, b) {
      return a.imageSizeInBytes - b.imageSizeInBytes;
    });
    t.deepEqual(sortedRes, sortedImageDetails, 'yields concatenated imageDetails from both ecr.describeImages calls');
    AWS.ECR.restore();
    t.end();
  });
});

test('imagesToDelete commits + merge commits', (t) => {
  // Create an array with 899 elements: 849 of which are regular commits and 50
  // of which are merge commits. None should be returned as 
  // images that need to be deleted.
  let images = Array(849).fill(imagesNoToken.imageDetails[0]).concat(Array(50).fill(imagesNoToken.imageDetails[2]));
  let result = file.imagesToDelete(images);
  t.deepEqual(result, []);
  t.end();
});

test('imagesToDelete commits + merge commits + tags', (t) => {
  // Create an array with 899 elements: 849 of which are regular commits and 50
  // of which are a mix of tags + merge commits. None should be returned as 
  // images that need to be deleted.
  let images = Array(849).fill(imagesNoToken.imageDetails[0]).concat(Array(25).fill(imagesNoToken.imageDetails[2])).concat(Array(25).fill(imagesNoToken.imageDetails[3]));
  let result = file.imagesToDelete(images);
  t.deepEqual(result, []);
  t.end();
});

test('imagesToDelete commits + tags', (t) => {
  // Create an array with 899 elements: 849 of which are regular commits (new)
  // and 50 of which are a mix of tags + commits (old). None should be
  // returned as images that need to be deleted, because the high
  // priority pattern "tag" must be considered for the latter
  let images = Array(849).fill(imagesNoToken.imageDetails[0]).concat(Array(50).fill(imagesNoToken.imageDetails[2]));
  let result = file.imagesToDelete(images);
  t.deepEqual(result, []);
  t.end();
});

test('imagesToDelete > 849 commits', (t) => {
  const images = Array(849).fill(imagesNoToken.imageDetails[0]);
  images.push(imagesNoToken.imageDetails[1]);

  const result = file.imagesToDelete(images);
  t.deepEqual(result, [{
    imageDigest: 'sha256:hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh'
  }]);
  t.end();
});

test('imagesToDelete > 50 merge-commits', (t) => {
  const images = Array(50).fill(imagesNoToken.imageDetails[2]);
  images.push(imagesNoToken.imageDetails[4]);

  const result = file.imagesToDelete(images);
  t.deepEqual(result, [{ imageDigest: 'sha256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }]);
  t.end();
});

test('deleteimages, error', (t) => {
  let stub = AWS.stub('ECR', 'batchDeleteImage').yields(error);
  file.deleteImages(region, repo, imageIds, (err) => {
    t.deepEqual(stub.getCall(0).args[0], { imageIds: imageIds, repositoryName: repo }, 'ecr.batchDeleteImage is passed imageIds and repositoryName params');
    t.equal(err, error, 'yields expected error message');
    AWS.ECR.restore();
    t.end();
  });
});

test('deleteimages, success', (t) => {
  let stub = AWS.stub('ECR', 'batchDeleteImage').yields(null, success);
  file.deleteImages(region, repo, imageIds, (err, res) => {
    t.deepEqual(stub.getCall(0).args[0], { imageIds: imageIds, repositoryName: repo }, 'ecr.batchDeleteImage is passed imageIds and repositoryName params');
    t.ifError(err, 'should not error');
    t.equal(res, success, 'yields expected success message');
    AWS.ECR.restore();
    t.end();
  });
});
