var exec = require('child_process').exec;
var crypto = require('crypto');
var path = require('path');
var rimraf = require('rimraf');
var split = require('binary-split');

module.exports = function(details, log) {
  var tmpdir = path.join('mnt', 'data', crypto.randomBytes(8).toString('hex'));

  function run(cmd, callback) {
    var child = exec(cmd, callback);
    child.stdout.pipe(split()).on('data', function(d) { log.info(d.toString()); });
    child.stderr.pipe(split()).on('data', function(d) { log.error(d.toString()); });
  }

  return {
    clone: function(callback) {
      run(`git clone https://github.com/${details.owner}/${details.repo} ${tmpdir}`, callback);
    },

    cleanup: function(callback) {
      rimraf(tmpdir, callback);
    },

    wd: tmpdir
  };
};
