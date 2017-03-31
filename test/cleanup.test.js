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
    t.deepEqual(res, imageDetails, 'yields concatenated imageDetails from both ecr.describeImages calls');
    AWS.ECR.restore();
    t.end();
  });
});

test('imagesToDelete', (t) => {
  // Create an array with 900 elements: 899 from the latest date, and 1 from the
  // oldest date. The last element with the oldest date should move to the front
  // of the array if sorted properly.
  const images = Array(899).fill(imagesNoToken.imageDetails[0]);
  images.push(imagesNoToken.imageDetails[1]);

  const result = file.imagesToDelete(images);
  t.deepEqual(result, imageIds);
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
