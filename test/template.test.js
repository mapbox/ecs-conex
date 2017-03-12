var test = require('tape');
var cf = require('@mapbox/cloudfriend');
var path = require('path');

test('template is valid', function(assert) {
  cf.validate(path.resolve(__dirname, '..', 'cloudformation', 'ecs-conex.template.js'))
    .then(function() {
      assert.pass('success');
      assert.end();
    })
    .catch(function(err) {
      assert.ifError(err, 'failure');
      assert.end();
    });
});
