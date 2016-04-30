module.exports = function(config) {
  var message = JSON.parse(config.message);

  var details = {
    ref: message.ref,
    after: message.after,
    before: message.before,
    repo: message.repository.name,
    owner: message.repository.owner.name,
    user: message.pusher.name
  };

  details.beforeImage = `${config.account}.dkr.ecr.REGION.amazonaws.com/${details.repo}:${details.before}`;
  details.afterImage = `${config.account}.dkr.ecr.REGION.amazonaws.com/${details.repo}:${details.after}`;

  return details;
};
