/* eslint-disable no-console*/

var cleanup = require(__dirname + '/../scripts/cleanup.js');
var inquirer = require('inquirer');
var Promise = require('pinkie-promise');
var sinon = require('sinon');
var test = require('tape');
var _ = require('underscore');

test('validateInputs: no user', function(assert) {
  var arguments = ['repo', '--maximum=1', '--blacklist=tag1,tag2'];

  cleanup.validateInputs(arguments, function(err, res) {
    assert.equal(err, 'GitHub user name and repository name are required');
    assert.equal(res, undefined);
    assert.end();
  });
});

test('validateInputs: no repo', function(assert) {
  var arguments = ['user', '--maximum=1', '--blacklist=tag1,tag2'];

  cleanup.validateInputs(arguments, function(err, res) {
    assert.equal(err, 'GitHub user name and repository name are required');
    assert.equal(res, undefined);
    assert.end();
  });
});

test('validateInputs: no maximum', function(assert) {
  var arguments = ['user', 'repo', '--blacklist=tag1,tag2'];

  cleanup.validateInputs(arguments, function(err, res) {
    assert.equal(err, null);
    assert.equal(res.maximum, 750);
    assert.end();
  });
});

test('validateInputs: no blacklist', function(assert) {
  var arguments = ['user', 'repo', '--maximum=1'];

  cleanup.validateInputs(arguments, function(err, res) {
    assert.equal(err, null);
    assert.deepEqual(res.blacklist, []);
    assert.end();
  });
});

test('validateInputs', function(assert) {
  var arguments = ['user', 'repo', '--maximum=1', '--blacklist=tag1,tag2'];

  cleanup.validateInputs(arguments, function(err, res) {
    assert.equal(err, null);
    assert.equal(res.user, 'user');
    assert.equal(res.repo, 'repo');
    assert.equal(res.maximum, 1);
    assert.deepEqual(res.blacklist, ['tag1', 'tag2']);
    assert.end();
  });
});

test('confirmInputs: true', function(assert) {
  var params = { user: 'user', repo: 'repo', maximum: 1, blacklist: ['tag1', 'tag2'] };
  sinon.stub(inquirer, 'prompt', function(questions) {
    assert.deepEqual(questions, [{
      type: 'confirm',
      name: 'confirmation',
      message: 'Ready to delete images? Any imageTags not blacklisted above are subject to deletion.',
      default: false
    }]);

    return Promise.resolve({ confirmation: true });
  });

  cleanup.confirmInputs(params, function(answer) {
    assert.equal(answer, true);
    inquirer.prompt.restore();
    assert.end();
  });
});

test('confirmInputs: false', function(assert) {
  var params = { user: 'user', repo: 'repo', maximum: 1, blacklist: ['tag1', 'tag2'] };

  assert.plan(2);
  sinon.stub(inquirer, 'prompt', function(questions) {
    assert.deepEqual(questions, [{
      type: 'confirm',
      name: 'confirmation',
      message: 'Ready to delete images? Any imageTags not blacklisted above are subject to deletion.',
      default: false
    }]);

    return Promise.resolve({ confirmation: false });
  });

  cleanup.confirmInputs(params, function(answer) {
    assert.equal(answer, false);
    inquirer.prompt.restore();
  });
});

test('listImages', function(assert) {
  var params = { repo: 'repo' };

  assert.plan(1);
  var ecr = {
    listImages: function(object) {
      assert.deepEqual(object, { repositoryName: 'repo' });
      var counter = 0;
      var eachItem = function(handler) {
        if (++counter >= 5) {
          handler(null, null);
        } else {
          handler(null, {});
        }
      };
      return { eachItem: eachItem };
    }
  };

  cleanup.listImages(ecr, params, function() {});
});

test('validateECRSize', function(assert) {
  var result = [
    { imageTag: 'tag1' },
    { imageTag: 'tag2' },
    { imageTag: 'tag3' }
  ];

  assert.equal(cleanup.validateECRSize(result, { maximum: 2 }), undefined);
  assert.equal(cleanup.validateECRSize(result, { maximum: 3 }), undefined);
  assert.throws(function() { cleanup.validateECRSize(result, { maximum: 4 }); }, /The repository undefined\/undefined has 3 images, which is less than the desired 4 image maximum. No clean-up required./);
  assert.end();
});

test('isGitSha: true', function(assert) {
  var array = [{ imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f48' }];
  cleanup.isGitSha(array);

  assert.equal(array[0].ableToDelete, true);
  assert.end();
});

test('isGitSha: false', function(assert) {
  var array = [
    {  },
    { imageTag: '' },
    { imageTag: 'v0.1.0' },
    { imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f4' },
    { imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f488' },
    { imageTag: 'C5332A6C78Cf23D86F28B8987A3CA78AF46B7F48' }
  ];
  cleanup.isGitSha(array);

  _.each(array, function(e) {
    assert.equal(e.ableToDelete, false);
  });
  assert.end();
});

test('isBlacklisted: true', function(assert) {
  var params = { blacklist: ['tag'] };
  var array = [{ imageTag: 'tag', ableToDelete: true }];
  cleanup.isBlacklisted(array, params);

  assert.equal(array[0].ableToDelete, false);
  assert.end();
});

test('isBlacklisted: false', function(assert) {
  var params = { blacklist: ['tag'] };
  var array = [{ imageTag: '', ableToDelete: true }];
  cleanup.isBlacklisted(array, params);

  assert.equal(array[0].ableToDelete, true);
  assert.end();
});

test('getTimestamps', function(assert) {
  var array = [{ imageTag: 'tag', ableToDelete: true }];
  var params = { user: 'user', repo: 'repo', githubAccessToken: 'token' };

  assert.plan(3);
  cleanup.getTimeStamps(array, params, function(err, res) {
    assert.ok(res[0].statusCode);
    assert.ok(res[0].request.uri.pathname);
    assert.ok(res[0].body);
  });
});

test('assignTimeStamps: 200 status code', function(assert) {
  var array = [{ imageTag: 'tag', ableToDelete: true }];
  var response = [{ statusCode: 200, body: '{"sha":"tag","commit":{"author":{"date":"2016-07-20T18:27:53Z"}}}', request: { uri: { pathname: '/repos/user/repo/commits/tag' } } }];
  cleanup.assignTimeStamps(array, response);

  assert.equal(array[0].imageTag, 'tag');
  assert.equal(array[0].ableToDelete, true);
  assert.equal(array[0].date, 1469039273);
  assert.end();
});

test('assignTimeStamps: 401 status code', function(assert) {
  var array = [{ imageTag: 'tag', ableToDelete: true }];
  var response = [{ statusCode: 401, body: '{"sha":"tag","commit":{"author":{"date":"2016-07-20T18:27:53Z"}}}', request: { uri: { pathname: '/repos/user/repo/commits/tag' } } }];
  cleanup.assignTimeStamps(array, response);

  assert.equal(array[0].imageTag, 'tag');
  assert.equal(array[0].ableToDelete, false);
  assert.ok(!array[0].date);
  assert.end();
});

test('dateCheck: true', function(assert) {
  var array = [{ imageTag: 'tag', imageDigest: 'digest', date: 1469641800, ableToDelete: true }];
  cleanup.dateCheck(array);

  assert.equal(array[0].ableToDelete, true);
  assert.end();
});

test('dateCheck: false', function(assert) {
  var array = [{ imageTag: 'tag', imageDigest: 'digest', ableToDelete: true }];
  cleanup.dateCheck(array);

  assert.equal(array[0].ableToDelete, false);
  assert.end();
});

test('toDelete', function(assert) {
  var results = [
    { imageTag: 'tag1', imageDigest: 'digest1', ableToDelete: true,  date: 5 },
    { imageTag: 'tag2', imageDigest: 'digest2', ableToDelete: true,  date: 4 },
    { imageTag: 'tag3', imageDigest: 'digest3', ableToDelete: true,  date: 3 },
    { imageTag: 'tag4', imageDigest: 'digest4', ableToDelete: true,  date: 2 },
    { imageTag: 'tag5', imageDigest: 'digest5', ableToDelete: false, date: 1 }
  ];

  var max1 = cleanup.toDelete(results, { maximum: 1 });
  var max2 = cleanup.toDelete(results, { maximum: 2 });
  var max3 = cleanup.toDelete(results, { maximum: 3 });
  var max4 = cleanup.toDelete(results, { maximum: 4 });
  var max5 = cleanup.toDelete(results, { maximum: 5 });

  assert.equal(max1.length, 4);
  assert.equal(_.first(max1).date, 2);
  assert.equal(_.last(max1).date, 5);

  assert.equal(max2.length, 3);
  assert.equal(_.first(max2).date, 2);
  assert.equal(_.last(max2).date, 4);

  assert.equal(max3.length, 2);
  assert.equal(_.first(max3).date, 2);
  assert.equal(_.last(max3).date, 3);

  assert.equal(max4.length, 1);
  assert.equal(max4[0].date, 2);

  assert.equal(max5.length, 0);
  assert.end();
});

test('deleteImages', function(assert) {
  var array = [];
  for (var i = 0; i < 250; i++) {
    array.push({ imageTag: 'tag' + i, imageDigest: 'digest' });
  }
  var params = { repo: 'repo', registryId: 'registryId' };

  var counter = 0;
  var ecr = {
    batchDeleteImage: function(params, callback) {
      if (counter++ < 2) {
        assert.deepEqual(params.imageIds.length, 100);
      } else {
        assert.deepEqual(params.imageIds.length, 50);
      }
      assert.equal(params.repositoryName, 'repo');
      assert.equal(params.registryId, 'registryId');
      callback(null, params.imageIds);
    }
  };

  cleanup.deleteImages(ecr, params, array, function(err, list) {
    assert.ifError(err);
    assert.equal(list.length, 250);
    assert.end();
  });
});

test('mergeByProperty: mergable', function(assert) {
  var params = { deleteCount: 0 };
  var arr1 = [{ imageTag: 'tag', imageDigest: 'digest', ableToDelete: true }];
  var arr2 = [{ imageTag: 'tag', date: 1469641800 }];
  cleanup.mergeByProperty(arr1, arr2, 'imageTag', params);

  assert.equal(arr1.length, 1);
  assert.equal(arr1[0].imageTag, 'tag');
  assert.equal(arr1[0].imageDigest, 'digest');
  assert.equal(arr1[0].ableToDelete, true);
  assert.equal(arr1[0].date, 1469641800);
  assert.end();
});

test('mergeByProperty: not mergable', function(assert) {
  var params = { deleteCount: 0 };
  var arr1 = [{ imageTag: 'tag1', imageDigest: 'digest', ableToDelete: true }];
  var arr2 = [{ imageTag: 'tag2', date: 1469641800 }];
  cleanup.mergeByProperty(arr1, arr2, 'imageTag', params);

  assert.equal(arr1.length, 1);
  assert.equal(arr1[0].imageTag, 'tag1');
  assert.equal(arr1[0].imageDigest, 'digest');
  assert.equal(arr1[0].ableToDelete, true);
  assert.ok(!arr1[0].date);
  assert.end();
});

test('wontDelete', function(assert) {
  var object = { imageDigest: 'digest', imageTag: 'tag' };
  var message = 'test';

  assert.plan(2);
  sinon.stub(console, 'log', function(msg) {
    console.log.restore();
    assert.equal(msg, '[wont-delete] [digest] [tag] test');
  });

  cleanup.wontDelete(object, message, true);
  assert.equal(object.ableToDelete, false);
});

test('willDelete', function(assert) {
  var array = [{ imageDigest: 'digest', imageTag: 'tag' }];
  var index = 0;

  assert.plan(1);
  sinon.stub(console, 'log', function(msg) {
    console.log.restore();
    assert.equal(msg, '[will-delete] [digest] [tag] Deleting image 1 of 1');
  });

  cleanup.willDelete(array, index);
});
