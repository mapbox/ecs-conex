var cleanup = require(__dirname + '/../scripts/cleanup.js');
var test = require('tape');

test('tests validateECRSize', function(assert) {
  var validateECRSize = cleanup.validateECRSize;
  var result = [
    { imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f48' },
    { imageTag: '55ee14c984e9de11b5a1e9186b2dc6846bc10148' },
    { imageTag: 'c9c0a271f985e51d4f6d7f9a545925822d4f6730' }
  ];

  assert.equal(validateECRSize(result, { maximumImages: 2 }), undefined);
  assert.equal(validateECRSize(result, { maximumImages: 3 }), undefined)
  assert.throws(function() { validateECRSize(result, { maximumImages: 4 }); }, /\[ecs-conex cleanup\] undefined has 3 images, which is less than 4. No clean-up required./);
  assert.end();
});

test('tests isGitSha', function(assert) {
  var isGitSha = cleanup.isGitSha;
  var good = [{ imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f48' }];
  var bad = [
    {  },
    { imageTag: '' },
    { imageTag: 'v0.1.0' },
    { imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f4' },
    { imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f488' },
    { imageTag: 'C5332A6C78Cf23D86F28B8987A3CA78AF46B7F48' }
  ];
  bad = isGitSha(bad);

  assert.plan(7);
  assert.equal(isGitSha(good)[0].ableToDelete, true, 'should have a \"true\" ableToDelete value');
  for (var i = 0; i < bad.length; i++) {
    assert.equal(bad[i].ableToDelete, false, 'should have a \"false\" ableToDelete value');
  };
  assert.end();
});

test('tests isWhitelisted', function(assert) {
  var isWhitelisted = cleanup.isWhitelisted;
  var params = { whitelist: ['c5332a6c78cf23d86f28b8987a3ca78af46b7f48'] };

  assert.deepEqual(isWhitelisted([{ imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f48', ableToDelete: true }], params), [{ imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f48', ableToDelete: false }]);
  assert.deepEqual(isWhitelisted([{ imageTag: '', ableToDelete: true }], params), [{ imageTag: '', ableToDelete: true }]);
  assert.end();
});

test('tests getTimestamps', function(assert) {
  var getTimeStamps = cleanup.getTimeStamps;
  var array = [{ imageTag: 'test', ableToDelete: true }];
  var params = { user: 'test', repo: 'test', githubAccessToken: 'test' };

  getTimeStamps(array, params, function(err, res) {
    assert.ok(res[0].statusCode);
    assert.ok(res[0].request.uri.pathname);
    assert.ok(res[0].body);
    assert.end();
  });
});

test('tests assignTimeStamps', function(assert) {
  var assignTimeStamps = cleanup.assignTimeStamps;

  var array = [{ imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f48', ableToDelete: true }];
  var response200 = [{"statusCode": 200, "body": "{\"sha\":\"c5332a6c78cf23d86f28b8987a3ca78af46b7f48\",\"commit\":{\"author\":{\"date\":\"2016-07-20T18:27:53Z\"}}}", "request":{"uri":{"pathname": "/repos/user/repo/commits/c5332a6c78cf23d86f28b8987a3ca78af46b7f48" }}}];
  assignTimeStamps(array, response200);
  assert.deepEqual(array, [{ imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f48', ableToDelete: true, date: 1469039273 }]);

  var array = [{ imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f48', ableToDelete: true }];
  var response401 = [{"statusCode": 401, "body": "{\"sha\":\"c5332a6c78cf23d86f28b8987a3ca78af46b7f48\",\"commit\":{\"author\":{\"date\":\"2016-07-20T18:27:53Z\"}}}", "request":{"uri":{"pathname": "/repos/user/repo/commits/c5332a6c78cf23d86f28b8987a3ca78af46b7f48" }}}];
  assignTimeStamps(array, response401);
  assert.deepEqual(array, [{ imageTag: 'c5332a6c78cf23d86f28b8987a3ca78af46b7f48', ableToDelete: false }]);
  assert.end();
});

test('tests mergeByProperty', function(assert) {
  var mergeByProperty = cleanup.mergeByProperty;
  var params = { deleteCount: 0 };

  var arr1 = [{ imageTag: 'a', imageDigest: 'b', ableToDelete: true }];
  var arr2 = [{ imageTag: 'a', date: '1469641800' }];
  mergeByProperty(arr1, arr2, 'imageTag', params);
  assert.deepEqual(arr1, [{ imageTag: 'a', imageDigest: 'b', date: '1469641800', ableToDelete: true }]);

  var arr1 = [{ imageTag: 'a', imageDigest: 'b', ableToDelete: true }];
  var arr3 = [{ imageTag: 'b', date: '1469641800' }];
  mergeByProperty(arr1, arr3, 'imageTag', params);
  assert.deepEqual(arr1, [{ imageTag: 'a', imageDigest: 'b', ableToDelete: true }]);
  assert.end();
});

test('tests toDelete', function(assert) {
  var toDelete = cleanup.toDelete;
  var results = [
    { imageTag: 'a', imageDigest: 'b', ableToDelete: true,  date: 5 },
    { imageTag: 'c', imageDigest: 'd', ableToDelete: true,  date: 4 },
    { imageTag: 'e', imageDigest: 'f', ableToDelete: true,  date: 3 },
    { imageTag: 'g', imageDigest: 'h', ableToDelete: true, date: 2 },
    { imageTag: 'i', imageDigest: 'j', ableToDelete: false,  date: 1 },
  ];

  assert.deepEqual(toDelete(results, { maximumImages: 1 }), [{ imageTag: 'g', imageDigest: 'h', ableToDelete: true,  date: 2 }, { imageTag: 'e', imageDigest: 'f', ableToDelete: true,  date: 3 }, { imageTag: 'c', imageDigest: 'd', ableToDelete: true,  date: 4 }, { imageTag: 'a', imageDigest: 'b', ableToDelete: true, date: 5 }]);
  assert.deepEqual(toDelete(results, { maximumImages: 2 }), [{ imageTag: 'g', imageDigest: 'h', ableToDelete: true,  date: 2 }, { imageTag: 'e', imageDigest: 'f', ableToDelete: true,  date: 3 }, { imageTag: 'c', imageDigest: 'd', ableToDelete: true, date: 4 }]);
  assert.deepEqual(toDelete(results, { maximumImages: 4 }), [{ imageTag: 'g', imageDigest: 'h', ableToDelete: true, date: 2 }]);
  assert.deepEqual(toDelete(results, { maximumImages: 5 }), []);
  assert.end();
});

test('tests deleteImages', function(assert) {
  var deleteImages = cleanup.deleteImages;
  var array = [{ imageTag: 'a', imageDigest: 'b' }];
  var params = { repo: 'test', registryId: 'test' };
  var ecr = {
    batchDeleteImage: function (params) {
      assert.deepEqual(params, { imageIds: array, repositoryName: 'test', registryId: 'test' });
    }
  };

  deleteImages(ecr, params, array);
  assert.end();
});
