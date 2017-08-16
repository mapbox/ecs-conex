'use strict';

/* eslint-disable no-console */

const AWS = require('@mapbox/mock-aws-sdk-js');
const file = require(`${__dirname}/../scripts/cleanup`);
const sinon = require('sinon');
const test = require('tape');

const region = 'us-east-1';
const repo = 'some-repo';
const token = 'sometoken';
const error = 'some error';
const success = 'some success';
const imagesNoToken = require(`${__dirname}/fixtures/imagesNoToken.test.json`);
const imagesToken = require(`${__dirname}/fixtures/imagesToken.test.json`);
const imageDetails = imagesNoToken.imageDetails.concat(imagesToken.imageDetails);
const imageIds = [{ imageDigest: imagesNoToken.imageDetails[1].imageDigest }];

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
  const classifier = [{
    count: 50,
    priority: 1,
    pattern: /^merge\-commit\-[a-z0-9]{40}$|merge\-commit|tag\-v[0-9\.]|tag|custom/
  }, {
    count: 849,
    priority: 2,
    pattern: /^commit-[a-z0-9]{40}$|commit/
  }];
  let images = Array(849).fill(imagesNoToken.imageDetails[0]).concat(Array(50).fill(imagesNoToken.imageDetails[2]));
  let result = file.imagesToDelete(images, classifier);
  t.deepEqual(result, []);
  t.end();
});

test('imagesToDelete commits + merge commits + tags', (t) => {
  // Create an array with 899 elements: 849 of which are regular commits and 50
  // of which are a mix of tags + merge commits. None should be returned as 
  // images that need to be deleted.
  const classifier = [{
    count: 50,
    priority: 1,
    pattern: /^merge\-commit\-[a-z0-9]{40}$|merge\-commit|tag\-v[0-9\.]|tag|custom/
  }, {
    count: 849,
    priority: 2,
    pattern: /^commit-[a-z0-9]{40}$|commit/
  }];
  let images = Array(849).fill(imagesNoToken.imageDetails[0]).concat(Array(25).fill(imagesNoToken.imageDetails[1])).concat(Array(25).fill(imagesNoToken.imageDetails[2]));
  let result = file.imagesToDelete(images, classifier);
  t.deepEqual(result, []);
  t.end();
});

test('imagesToDelete commits + tags', (t) => {
  // Create an array with 899 elements: 849 of which are regular commits (new)
  // and 50 of which are a mix of tags + commits (old). None should be
  // returned as images that need to be deleted, because the high
  // priority pattern "tag" must be considered for the latter
  const classifier = [{
    count: 50,
    priority: 1,
    pattern: /^merge\-commit\-[a-z0-9]{40}$|merge\-commit|tag\-v[0-9\.]|tag|custom/
  }, {
    count: 849,
    priority: 2,
    pattern: /^commit-[a-z0-9]{40}$|commit/
  }];
  let images = Array(849).fill(imagesNoToken.imageDetails[0]).concat(Array(50).fill(imagesNoToken.imageDetails[2]));
  let result = file.imagesToDelete(images, classifier);
  t.deepEqual(result, []);
  t.end();
});

test('imagesToDelete > 849 commits', (t) => {
  // Create < 849 images that are regular commits and none should be deleted.
  const classifier = [{
    count: 50,
    priority: 1,
    pattern: /^merge\-commit\-[a-z0-9]{40}$|merge\-commit|tag\-v[0-9\.]|tag|custom/
  }, {
    count: 849,
    priority: 2,
    pattern: /^commit-[a-z0-9]{40}$|commit/
  }];
  const images = Array(849).fill(imagesNoToken.imageDetails[5]);
  images.push(imagesNoToken.imageDetails[0]);

  const result = file.imagesToDelete(images, classifier);
  t.deepEqual(result, [{
    imageDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000'}]);
  t.end();
});

test('imagesToDelete > 50 merge-commits', (t) => {
  // Create > 50 merge commits and the oldest should be returned to be deleted.
  const classifier = [{
    count: 50,
    priority: 1,
    pattern: /^merge\-commit\-[a-z0-9]{40}$|merge\-commit|tag\-v[0-9\.]|tag|custom/
  }, {
    count: 849,
    priority: 2,
    pattern: /^commit-[a-z0-9]{40}$|commit/
  }];
  const images = Array(50).fill(imagesNoToken.imageDetails[2]);
  images.push(imagesNoToken.imageDetails[4]);

  const result = file.imagesToDelete(images, classifier);
  t.deepEqual(result, [{ imageDigest: 'sha256:mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm' }]);
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
