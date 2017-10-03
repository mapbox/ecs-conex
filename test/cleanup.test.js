'use strict';

/* eslint-disable no-console */

const child_process = require('child_process');
const AWS = require('@mapbox/mock-aws-sdk-js');
const sinon = require('sinon');
const test = require('tape');
const cleanup = require(`${__dirname}/../scripts/cleanup`);

const region = 'us-east-1';
const repo = 'some-repo';
const token = 'sometoken';
const tmpdir = '/path/to/cloned/repo';

const imagesNoToken = require(`${__dirname}/fixtures/imagesNoToken.test.json`);
const imagesToken = require(`${__dirname}/fixtures/imagesToken.test.json`);
const imageDetails = imagesNoToken.imageDetails.concat(imagesToken.imageDetails);


const exec = {
  restore: () => child_process.exec.restore(),

  mock: () => {
    return sinon.stub(child_process, 'exec', (cmd, callback) => {
      const commandParts = cmd.split(' ');
      const command = commandParts[2];

      const sha = {
        'cat-file': commandParts[4],
        tag: commandParts[5],
        'rev-parse': commandParts[4]
      }[command];

      let stdout = '';

      switch (command) {
      case 'cat-file':
        if (sha === 'cccccccccccccccccccccccccccccccccccccccc' ||
            sha === 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          stdout = '2'; // these are merge commits
        } else {
          stdout = '0';
        }

        break;

      case 'tag':
        if (sha === 'dddddddddddddddddddddddddddddddddddddddd')
          stdout = sha; // this one is a tag

        break;

      case 'rev-parse':
        if (sha !== 'this-is-an-image-i-named-myself')
          stdout = sha; // everything is a commit except this one image tag

        break;
      }

      callback(null, stdout);
    });
  }
};

test('getImages, error', (assert) => {
  const stub = AWS.stub('ECR', 'describeImages').yields(new Error('foo'));

  cleanup.getImages(region, repo, (err) => {
    assert.ok(
      stub.calledWith({ repositoryName: repo }),
      'ecr.describeImages is passed repositoryName param'
    );

    assert.equal(err.message, 'foo', 'yields expected error message');

    AWS.ECR.restore();
    assert.end();
  });
});

test('getImages, success (no nextToken)', (assert) => {
  const stub = AWS.stub('ECR', 'describeImages').yields(null, imagesNoToken);

  cleanup.getImages(region, repo, (err, res) => {
    assert.ok(
      stub.calledWith({ repositoryName: repo }),
      'ecr.describeImages is passed repositoryName param'
    );

    assert.deepEqual(
      res,
      imagesNoToken.imageDetails,
      'yields expected imageDetails array'
    );

    AWS.ECR.restore();
    assert.end();
  });
});

test('getImages, success (nextToken)', (assert) => {
  const stub = AWS.stub('ECR', 'describeImages');
  stub.onCall(0).yields(null, imagesToken);
  stub.onCall(1).yields(null, imagesNoToken);

  cleanup.getImages(region, repo, (err, res) => {
    assert.equal(stub.callCount, 2, 'ecr.describeImages should be called twice');
    assert.ok(
      stub.calledWith({ repositoryName: repo }),
      'ecr.describeImages is passed repositoryName param'
    );

    assert.ok(
      stub.calledWith({ repositoryName: repo, nextToken: token }),
      'ecr.describeImages is passed repositoryName and nextToken params'
    );

    const sortedRes = res.sort(function(a, b) {
      return a.imageSizeInBytes - b.imageSizeInBytes;
    });
    const sortedImageDetails = imageDetails.sort(function(a, b) {
      return a.imageSizeInBytes - b.imageSizeInBytes;
    });
    assert.deepEqual(
      sortedRes,
      sortedImageDetails,
      'yields concatenated imageDetails from both ecr.describeImages calls'
    );

    AWS.ECR.restore();
    assert.end();
  });
});

test('imagesToDelete less than max images', (assert) => {
  const run = exec.mock();

  // Create an array with 899 elements: 849 of which are generic commits and 50
  // of which are priority commits. None should be returned as images that need
  // to be deleted.

  const images = Array(849)
    .fill({
      imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      imageTags: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']
    })
    .concat(
      Array(50).fill({
        imageDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        imageTags: ['cccccccccccccccccccccccccccccccccccccccc']
      })
    );

  cleanup.imagesToDelete(images, tmpdir, (err, result) => {
    assert.ifError(err, 'success');
    assert.deepEqual(result, [], 'no images deleted');

    run.restore();
    assert.end();
  });
});

test('imagesToDelete more than max images', (assert) => {
  const run = exec.mock();

  // Create an array with 901 elements: 861 of which are generic
  // and 40 of which are priority. Should select 1 generic commit
  // for deletion.

  const images = Array(861)
    .fill({
      imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      imageTags: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']
    })
    .concat(
      Array(40).fill({
        imageDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        imageTags: ['cccccccccccccccccccccccccccccccccccccccc']
      })
    );

  cleanup.imagesToDelete(images, tmpdir, (err, result) => {
    assert.ifError(err, 'success');

    assert.deepEqual(result, [
      { imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
    ], 'removes 1 generic commit image');

    run.restore();
    assert.end();
  });
});

test('imagesToDelete heavy on priority and custom commits', (assert) => {
  const run = exec.mock();

  // Create an array with 910 elements: 5 of which are generic
  // and 52 of which are priority, 853 are custom. Should select 2 priority
  // commits and 5 generic commits for deletion. Cannot reach 900, since it
  // should refuse to delete custom commits.

  const images = Array(5)
    .fill({
      imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      imageTags: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']
    })
    .concat(
      Array(52).fill({
        imageDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        imageTags: ['cccccccccccccccccccccccccccccccccccccccc']
      })
    )
    .concat(
      Array(853).fill({
        imageDigest: 'sha256:custom',
        imageTags: ['this-is-an-image-i-named-myself']
      })
    );

  cleanup.imagesToDelete(images, tmpdir, (err, result) => {
    assert.ifError(err, 'success');

    assert.deepEqual(result, [
      { imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { imageDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' },
      { imageDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' }
    ], 'removes 5 generic, 2 priority images');

    run.restore();
    assert.end();
  });
});

test('deleteimages, error', (assert) => {
  const stub = AWS.stub('ECR', 'batchDeleteImage').yields(new Error('foo'));

  const imageIds = [
    { imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  ];

  cleanup.deleteImages(region, repo, imageIds, (err) => {
    assert.equal(err.message, 'foo', 'yields expected error message');

    assert.ok(
      stub.calledWith({ imageIds: imageIds, repositoryName: repo }),
      'ecr.batchDeleteImage is passed imageIds and repositoryName params'
    );

    AWS.ECR.restore();
    assert.end();
  });
});

test('deleteimages, success', (assert) => {
  const stub = AWS.stub('ECR', 'batchDeleteImage').yields();

  const imageIds = Array(150)
    .fill({ imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });

  cleanup.deleteImages(region, repo, imageIds, (err) => {
    assert.ifErr(err, 'success');

    assert.equal(stub.callCount, 2, 'split images into 2 batches');

    assert.ok(
      stub.args.every((args) => args[0].imageIds.length <= 100),
      'batches have at most 100 images'
    );

    assert.equal(
      stub.args.reduce((count, args) => count + args[0].imageIds.length, 0),
      150,
      'deleted all 150 images'
    );

    AWS.ECR.restore();
    assert.end();
  });
});
