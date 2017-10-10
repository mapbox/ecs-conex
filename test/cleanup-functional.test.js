'use strict';

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const child_process = require('child_process');
const d3 = require('d3-queue');
const AWS = require('@mapbox/mock-aws-sdk-js');
const Queue = require('p-queue');
const test = require('tape');
const cleanup = require('../scripts/cleanup');

/**
 * The tests array defines a number of tests that run through the ECR cleanup
 * routine. Each element lays out the starting and ending states of ECR in terms
 * of the number of generic, priority, and custom images.
 *
 * In each test, a tmp folder is created to house a dummy git repo. A commit is
 * made in this repo for each generic commit, and either a tag or a merge commit
 * is made for each priority commit.
 *
 * Then, ECR is mocked such that it contain an images tagged as follows:
 *
 * - a generic commit is tagged once, with the sha for that commit
 * - a merge commit is tagged once, with the sha for that commit
 * - a tag is tagged twice, once with the sha for the commit, once with the tag
 *   name. This is identical to how ecs-conex deals with tag commits.
 * - custom images are images with a name that does not exist in the git
 *   history, so these image have a randomly assigned tag
 *
 * The cleanup script is then run, comparing images in the fake ECR with commits
 * in the temp git repository. After it completes, the tests assert:
 *
 * - that the expected number of generic, priority, and custom images are left
 * - if images were deleted, that they are the oldest images that were in the
 *   faked ECR
 *
 * Running these tests is not fast. Be patient.
 * The code here is dense. Be brave.
 */
const tests = [
  { // generic < max, priority < pMax, total < max
    start: { generic: 10, priority: 10, custom: 10 },
    after: { generic: 10, priority: 10, custom: 10 }
  },
  { // generic < max, priority < pMax total = max
    start: { generic: 10, priority: 10, custom: 880 },
    after: { generic: 10, priority: 10, custom: 880 }
  },
  { // generic < max, priority < pMax, total > max
    start: { generic: 10, priority: 10, custom: 890 },
    after: { generic: 0, priority: 10, custom: 890 }
  },
  { // generic < max, priority = pMax, total < max
    start: { generic: 10, priority: 50, custom: 10 },
    after: { generic: 10, priority: 50, custom: 10 }
  },
  { // generic < max, priority = pMax, total = max
    start: { generic: 840, priority: 50, custom: 10 },
    after: { generic: 840, priority: 50, custom: 10 }
  },
  { // generic < max, priority = pMax, total > max
    start: { generic: 850, priority: 50, custom: 20 },
    after: { generic: 830, priority: 50, custom: 20 }
  },
  { // generic < max, priority > pMax, total < max
    start: { generic: 10, priority: 60, custom: 10 },
    after: { generic: 10, priority: 60, custom: 10 }
  },
  { // generic < max, priority > pMax, total = max
    start: { generic: 830, priority: 60, custom: 10 },
    after: { generic: 830, priority: 60, custom: 10 }
  },
  { // generic < max, priority > pMax, total > max
    start: { generic: 830, priority: 60, custom: 20 },
    after: { generic: 820, priority: 60, custom: 20 }
  },
  { // generic = max, priority < pMax, total = max
    start: { generic: 900, priority: 0, custom: 0 },
    after: { generic: 900, priority: 0, custom: 0 }
  },
  { // generic = max, priority < pMax, total > max
    start: { generic: 900, priority: 10, custom: 10 },
    after: { generic: 880, priority: 10, custom: 10 }
  },
  { // generic = max, priority > pMax, total > max
    start: { generic: 900, priority: 60, custom: 10 },
    after: { generic: 830, priority: 60, custom: 10 }
  },
  { // generic > max, priority < pMax, total > max
    start: { generic: 910, priority: 10, custom: 10 },
    after: { generic: 880, priority: 10, custom: 10 }
  },
  { // generic > max, priority > pMax, total > max
    start: { generic: 910, priority: 60, custom: 10 },
    after: { generic: 830, priority: 60, custom: 10 }
  },
  { // full repository (1000 images), can get below max
    start: { generic: 860, priority: 60, custom: 80 },
    after: { generic: 760, priority: 60, custom: 80 }
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
      resolve({ tags: [stdout.trim()], date: new Date().toISOString() });
    });
  });
});

const makePriorityCommit = (dir) => new Promise((resolve, reject) => {
  // randomly assign as a merge commit or a tag
  const type = Math.random() >= 0.5 ? 'merge' : 'tag';

  if (type === 'tag') {
    const tag = `tag.${crypto.randomBytes(4).toString('hex')}`;
    child_process.exec('git commit -m "priority" --allow-empty', { cwd: dir }, (err) => {
      if (err) return reject(err);
      child_process.exec('git rev-parse HEAD', { cwd: dir }, (err, stdout) => {
        if (err) return reject(err);
        const sha = stdout.trim();
        child_process.exec(`git tag ${tag}`, { cwd: dir }, (err) => {
          if (err) return reject(err);
          resolve({ tags: [sha, tag], date: new Date().toISOString() });
        });
      });
    });
  }

  if (type === 'merge') {
    const branch = crypto.randomBytes(4).toString('hex');
    const queue = d3.queue(1);

    queue.defer(child_process.exec, `git checkout -b ${branch}`, { cwd: dir });
    queue.defer(child_process.exec, 'git commit -m "priority" --allow-empty', { cwd: dir });
    queue.defer(child_process.exec, 'git checkout master', { cwd: dir });
    queue.defer(child_process.exec, `git merge ${branch} --no-ff`, { cwd: dir });
    queue.defer(child_process.exec, 'git rev-parse HEAD', { cwd: dir });

    queue.awaitAll((err, results) => {
      if (err) return reject(err);
      const sha = results.pop().trim();
      resolve({ tags: [sha], date: new Date().toISOString() });
    });
  }
});

const images = (generic, priority, custom) => {
  const imageDetails = [];

  generic.forEach((i) => imageDetails.push({
    imageDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`,
    imageTags: i.tags,
    imagePushedAt: i.date
  }));

  priority.forEach((i) => imageDetails.push({
    imageDigest: `sha256:priority:${crypto.randomBytes(28).toString('hex').slice(1)}`,
    imageTags: i.tags,
    imagePushedAt: i.date
  }));

  custom.forEach((name) => imageDetails.push({
    imageDigest: `sha256:${crypto.randomBytes(32).toString('hex')}`,
    imageTags: [`custom.${name}`],
    imagePushedAt: new Date(Date.now() - (Math.random() * 1000 * 1000)).toISOString()
  }));

  return imageDetails;
};

const mockEcr = (images) => {
  const backend = images.reduce((backend, image) => {
    backend[image.imageDigest] = image;
    return backend;
  }, {});

  const deleted = [];

  images = JSON.parse(JSON.stringify(images));

  const describeImages = AWS.stub('ECR', 'describeImages', function(params, callback) {
    const data = { imageDetails: images.splice(0, 100) };
    if (images.length) data.nextToken = 'blah';
    callback(null, data);
  });

  const batchDeleteImage = AWS.stub('ECR', 'batchDeleteImage', function(params, callback) {
    params.imageIds.forEach((image) => {
      deleted.push(backend[image.imageDigest]);
      delete backend[image.imageDigest];
    });

    callback();
  });

  return{
    describeImages,
    batchDeleteImage,
    remaining: () => Object.keys(backend).reduce(
      (remaining, key) => {
        const image = backend[key];
        const tags = image.imageTags;
        const digest = image.imageDigest;

        if (tags.length === 2) {
          remaining.priority.push(image);
        } else if (/priority/.test(digest)) {
          remaining.priority.push(image);
        } else if (/^custom\./.test(tags[0])) {
          remaining.custom.push(image);
        } else {
          remaining.generic.push(image);
        }
        return remaining;
      },
      { generic: [], priority: [], custom: [] }
    ),
    deleted: () => deleted.reduce(
      (deleted, image) => {
        const tags = image.imageTags;
        const digest = image.imageDigest;

        if (tags.length === 2) {
          deleted.priority.push(image);
        } else if (/priority/.test(digest)) {
          deleted.priority.push(image);
        } else if (/^custom\./.test(tags[0])) {
          deleted.custom.push(image);
        } else {
          deleted.generic.push(image);
        }
        return deleted;
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


    return Promise.all(commitsToMake)
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
      .then((images) => mockEcr(images))
      .then((ecr) => ({ ecr, dir }));
  });

tests.forEach((state) => {
  const name = `[ecr cleanup] generic: ${state.start.generic} | priority: ${state.start.priority} | custom: ${state.start.custom}`;

  test(name, (assert) => {
    const expected = state.after;

    setup(state.start)
      .then((data) => new Promise((resolve, reject) => {
        cleanup.cleanup('us-east-1', path.basename(data.dir), data.dir, (err) => {
          if (err) return reject(err);

          const leftover = data.ecr.remaining();
          const deleted = data.ecr.deleted();

          assert.equal(
            leftover.generic.length,
            expected.generic,
            `expected ${expected.generic} generic images to remain`
          );

          assert.equal(
            leftover.priority.length,
            expected.priority,
            `expected ${expected.priority} priority images to remain`
          );

          assert.equal(
            leftover.custom.length,
            expected.custom,
            `expected ${expected.custom} custom images to remain`
          );

          const oldestGeneric = leftover.generic
            .sort((a, b) => new Date(a.imagePushedAt) - new Date(b.imagePushedAt))
            .shift();

          const oldestPriority = leftover.priority
            .sort((a, b) => new Date(a.imagePushedAt) - new Date(b.imagePushedAt))
            .shift();

          if (deleted.generic.length && oldestGeneric) {
            assert.ok(
              deleted.generic.every(
                (i) => +new Date(i.imagePushedAt) <= +new Date(oldestGeneric.imagePushedAt)
              ),
              'deleted the oldest generic images'
            );
          }

          if (deleted.priority.length && oldestPriority) {
            assert.ok(
              deleted.priority.every(
                (i) => +new Date(i.imagePushedAt) <= +new Date(oldestPriority.imagePushedAt)
              ),
              'deleted the oldest priority images'
            );
          }

          data.ecr.restore();
          resolve();
        });
      }))
      .catch((err) => assert.ifError(err, 'failed'))
      .then(() => {
        if (AWS.ECR.isSinonProxy) AWS.ECR.restore();
        assert.end();
      });
  });
});
