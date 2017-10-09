'use strict';

/* eslint-disable no-console */

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const child_process = require('child_process');
const AWS = require('@mapbox/mock-aws-sdk-js');
const sinon = require('sinon');
const test = require('tape');
const Queue = require('p-queue');
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

const tests = [
  { // < < <
    start: { generic: 10, priority: 10, custom: 10 },
    after: { generic: 10, priority: 10, custom: 10 }
  },
  { // < < =
    start: { generic: 10, priority: 10, custom: 830 },
    after: { generic: 10, priority: 10, custom: 830 }
  },
  { // < < >
    start: { generic: 10, priority: 10, custom: 850 },
    after: { generic: 0, priority: 10, custom: 850 }
  },
  { // < = <
    start: { generic: 10, priority: 50, custom: 10 },
    after: { generic: 10, priority: 50, custom: 10 }
  },
  { // < = =
    start: { generic: 790, priority: 50, custom: 10 },
    after: { generic: 790, priority: 50, custom: 10 }
  },
  { // < = >
    start: { generic: 790, priority: 50, custom: 20 },
    after: { generic: 780, priority: 50, custom: 20 }
  },
  { // < > <
    start: { generic: 10, priority: 60, custom: 10 },
    after: { generic: 10, priority: 60, custom: 10 }
  },
  { // < > =
    start: { generic: 780, priority: 60, custom: 10 },
    after: { generic: 780, priority: 60, custom: 10 }
  },
  { // < > >
    start: { generic: 780, priority: 60, custom: 20 },
    after: { generic: 770, priority: 60, custom: 20 }
  },
  { // = < =
    start: { generic: 850, priority: 0, custom: 0 },
    after: { generic: 850, priority: 0, custom: 0 }
  },
  { // = < >
    start: { generic: 850, priority: 10, custom: 10 },
    after: { generic: 830, priority: 10, custom: 10 }
  },
  { // = > >
    start: { generic: 850, priority: 60, custom: 10 },
    after: { generic: 780, priority: 60, custom: 10 }
  },
  { // > < >
    start: { generic: 860, priority: 10, custom: 10 },
    after: { generic: 830, priority: 10, custom: 10 }
  },
  { // > > >
    start: { generic: 860, priority: 60, custom: 10 },
    after: { generic: 780, priority: 60, custom: 10 }
  },
  { // full repository (1000 images), can get below max
    start: { generic: 860, priority: 60, custom: 80 },
    after: { generic: 710, priority: 60, custom: 80 }
  },
  { // full repository (1000 images), cannot get below max
    start: { generic: 80, priority: 60, custom: 860 },
    after: { generic: 0, priority: 50, custom: 860 }
  }
];

const makeGitDir = () => new Promise((resolve, reject) => {
  const dir = path.join(os.tmpdir(), crypto.randomBytes(4).toString('hex'));
  child_process.exec(`mkdir -p ${dir}`, (err) => {
    if (err) return reject(err);
    child_process.exec('git init', { cwd: dir }, (err) => {
      if (err) return reject(err);
      resolve(dir);
    });
  });
});

const makeGenericCommit = (dir) => new Promise((resolve, reject) => {
  child_process.exec('git commit -m "generic" --allow-empty', { cwd: dir }, (err) => {
    if (err) return reject(err);
    child_process.exec('git rev-parse HEAD', { cwd: dir }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
});

const makePriorityCommit = (dir) => new Promise((resolve, reject) => {
  const tag = `tag.${crypto.randomBytes(4).toString('hex')}`;
  child_process.exec('git commit -m "priority" --allow-empty', { cwd: dir }, (err) => {
    if (err) return reject(err);
    child_process.exec('git rev-parse HEAD', { cwd: dir }, (err, stdout) => {
      if (err) return reject(err);
      const sha = stdout.trim();
      child_process.exec(`git tag ${tag}`, { cwd: dir }, (err) => {
        if (err) return reject(err);
        resolve([sha, tag]);
      });
    });
  });
});

const images = (generic, priority, custom) => {
  const imageDetails = [];

  generic.forEach((sha) => imageDetails.push({
    imageDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`,
    imageTags: [sha],
    imagePushedAt: new Date().toISOString()
  }));

  priority.forEach((tags) => imageDetails.push({
    imageDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`,
    imageTags: tags,
    imagePushedAt: new Date().toISOString()
  }));

  custom.forEach((name) => imageDetails.push({
    imageDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`,
    imageTags: [`custom.${name}`],
    imagePushedAt: new Date().toISOString()
  }));

  return imageDetails;
};

const mockEcr = (images) => {
  const backend = images.reduce((backend, image) => {
    backend[image.imageDigest] = image;
    return backend;
  }, {});

  const describeImages = AWS.stub('ECR', 'describeImages', function() {
    images = JSON.parse(JSON.stringify(images));

    this.request.eachPage = (callback) => {
      const page = () => {
        if (images.length) {
          const data = { imageDetails: images.splice(0, 100) };
          callback(null, data, page);
        } else {
          callback();
        }
      };

      page();
    };
  });

  const batchDeleteImage = AWS.stub('ECR', 'batchDeleteImage', function(params) {
    params.imageIds.forEach((image) => {
      delete backend[image.imageDigest];
    });

    this.request.promise.returns(Promise.resolve());
  });

  return{
    describeImages,
    batchDeleteImage,
    remaining: () => Object.keys(backend).reduce(
      (remaining, key) => {
        const tags = backend[key].imageTags;

        if (tags.length === 2) {
          remaining.priority.push(tags);
        } else if (/^custom\./.test(tags[0])) {
          remaining.custom.push(tags);
        } else {
          remaining.generic.push(tags);
        }
        return remaining;
      },
      { generic: [], priority: [], custom: [] }
    ),
    restore: () => AWS.ECR.restore()
  };
};

const setup = (state) => makeGitDir()
  .then((dir) => {
    const queue = new Queue({ concurrency: 1 });
    const commitsToMake = [];

    for (let i = 0; i < state.generic; i++) {
      commitsToMake.push(
        queue.add(() => makeGenericCommit(dir))
      );
    }

    for (let j = 0; j < state.priority; j++) {
      commitsToMake.push(
        queue.add(() => makePriorityCommit(dir))
      );
    }

    return Promise.all(commitsToMake);
  })
  .then((results) => {
    // The collected SHAs, tags, and a set of custom strings to become named
    // images in the fake ECR repository
    const generic = results.slice(0, state.generic);
    const priority = results.slice(state.generic);
    const custom = new Array(state.custom).fill(0).map(
      () => crypto.randomBytes(4).toString('hex')
    );

    return images(generic, priority, custom);
  })
  .then((images) => mockEcr(images));

tests.forEach((state) => {
  const name = `[ecr cleanup] generic: ${state.start.generic} | priority: ${state.start.priority} | custom: ${state.start.custom}`;
  const msg = `---------- generic: ${state.after.generic} | priority: ${state.after.priority} | custom: ${state.after.custom}`;

  test(name, (assert) => {
    const expected = state.after;

    setup(state.start)
      .then((ecr) => {
        const leftover = ecr.remaining();
        assert.deepEqual(
          {
            generic: leftover.generic.length,
            priority: leftover.priority.length,
            custom: leftover.custom.length
          },
          expected,
          msg
        );
        ecr.restore();
      })
      .catch((err) => assert.ifError(err, 'failed'))
      .then(() => {
        if (AWS.ECR.isSinonProxy) AWS.ECR.restore();
        assert.end();
      });
  });
});
