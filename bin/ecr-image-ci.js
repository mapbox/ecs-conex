#!/usr/bin/env node

var ci = require('..');
var config = {
  id: process.env.MessageId,
  message: process.env.Message,
  account: process.env.AccountId
};

ci(config, function(err) {
  if (err) process.exit(1);
});
