var watchbot = require('@mapbox/watchbot');
var cf = require('@mapbox/cloudfriend');

// Build watchbot resources
var watcher = watchbot.template({
  prefix: 'Watchbot',
  service: 'ecs-conex',
  serviceVersion: cf.ref('GitSha'),
  family: cf.ref('Family'),
  workers: cf.ref('NumberOfWorkers'),
  reservation: { memory: 4096, cpu: 1024 },
  env: {
    AWS_DEFAULT_REGION: cf.region,
    StackRegion: cf.region,
    AccountId: cf.accountId,
    GithubAccessToken: cf.ref('GithubAccessToken'),
    NPMAccessToken: cf.ref('NPMAccessToken'),
    ImageBucketPrefix: cf.ref('ImageBucketPrefix'),
    ImageBucketRegions: cf.ref('ImageBucketRegions'),
    NotificationTopic: cf.ref('AlarmSNSTopic')
  },
  mounts: '/mnt/data:/mnt/data,/var/run/docker.sock:/var/run/docker.sock',
  webhook: true,
  user: true,
  notificationTopic: cf.ref('AlarmSNSTopic'),
  cluster: cf.ref('Cluster'),
  alarmOnEachFailure: true,
  alarmThreshold: 20,
  alarmPeriods: 6,
  messageTimeout: 1200,
  permissions: [
    {
      Effect: 'Allow',
      Action: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:BatchGetImage',
        'ecr:CreateRepository',
        'ecr:DescribeRepositories',
        'ecr:GetAuthorizationToken',
        'ecr:GetDownloadUrlForLayer',
        'ecr:InitiateLayerUpload',
        'ecr:CompleteLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:PutImage'
      ],
      Resource: '*'
    },
    {
      Effect: 'Allow',
      Action: [
        's3:PutObject'
      ],
      Resource: [
        cf.sub('arn:aws:s3:::${ImageBucketPrefix}-*/images/*')
      ]
    }
  ]
});

// Main ecs-conex template
var conex = {
  Parameters: {
    GitSha: {
      Description: 'The SHA of the task repository to use',
      Type: 'String'
    },
    GithubAccessToken: {
      Description: '[secure] A Github access token with permission to clone private repositories',
      Type: 'String'
    },
    NPMAccessToken: {
      Type: 'String',
      Description: '[secure] npm access token used to install private packages',
      Default: ''
    },
    ImageBucketPrefix: {
      Type: 'String',
      Description: 'The prefix for buckets to write .tar.gz images into',
      Default: ''
    },
    ImageBucketRegions: {
      Type: 'String',
      Description: 'Space-delimited list of region suffixes for image buckets',
      Default: ''
    },
    NumberOfWorkers: {
      Type: 'Number',
      Description: 'The number of concurrent build jobs ecs-conex will perform',
      Default: 4
    },
    Cluster: {
      Description: 'The ARN of the ECS cluster to run on',
      Type: 'String'
    },
    AlarmEmail: {
      Description: 'An email address to subscribe to alarms',
      Type: 'String',
      Default: 'devnull@mapbox.com'
    },
    LogAggregationFunction: {
      Description: 'The ARN of a Lambda function that will receive log events from CloudWatch',
      Type: 'String',
      Default: 'none'
    },
    Family: {
      Description: 'An optional family name for ecs-conex tasks',
      Type: 'String',
      Default: 'ecs-conex'
    }
  },
  Resources: {
    AlarmSNSTopic: {
      Type: 'AWS::SNS::Topic',
      Description: 'Subscribe to this topic to receive emails when tasks fail or retry',
      Properties: {
        Subscription: [
          {
            Endpoint: cf.ref('AlarmEmail'),
            Protocol: 'email'
          }
        ]
      }
    },
    MaxPendingTime: {
      Type: 'AWS::CloudWatch::Alarm',
      Properties: {
        AlarmDescription: 'https://github.com/mapbox/ecs-conex/blob/master/docs/alarms.md#maxpendingtime',
        Period: 60,
        EvaluationPeriods: 5,
        Statistic: 'Maximum',
        Threshold: 120,
        ComparisonOperator: 'GreaterThanThreshold',
        Namespace: 'Mapbox/ecs-watchbot',
        MetricName: cf.join(['WatchbotWorkerPending', cf.stackName]),
        AlarmActions: [cf.ref('AlarmSNSTopic')]
      }
    }
  },
  Outputs: {
    WorkTopic: {
      Description: 'The ARN of ecs-conex\'s SNS topic. Send messages to this topic to have builds processed',
      Value: watcher.ref.topic
    },
    LogGroup: {
      Description: 'The name of the CloudWatch LogGroup where ecs-conex logs are sent',
      Value: watcher.ref.logGroup
    },
    AccessKeyId: {
      Description: 'An access key with permission to publish messages to ecs-conex',
      Value: watcher.ref.accessKeyId
    },
    SecretAccessKey: {
      Description: 'A secret access key with permission to publish messages to ecs-conex',
      Value: watcher.ref.secretAccessKey
    },
    WebhookEndpoint: {
      Description: 'The HTTPS endpoint used to send webhooks to ecs-conex',
      Value: watcher.ref.webhookEndpoint
    }
  }
};

// Override aspects of watchbot's default webhook
watcher.Resources.WatchbotWebhookFunction.Properties.Code.ZipFile = cf.join('\n', [
  'var AWS = require("aws-sdk");',
  cf.join(['var sns = new AWS.SNS({ region: "', cf.region, '" });']),
  cf.join(['var topic = "', watcher.ref.topic, '";']),
  cf.join(['var secret = "', watcher.ref.accessKeyId, '";']),
  'var crypto = require("crypto");',
  'module.exports.webhooks = function(event, context) {',
  '  var body = event.body',
  '  var hash = "sha1=" + crypto.createHmac("sha1", secret).update(new Buffer(JSON.stringify(body))).digest("hex");',
  '  if (event.signature !== hash) return context.done("invalid: signature does not match");',
  '  if (body.zen) return context.done(null, "ignored ping request");',
  '  var push = {',
  '    ref: event.body.ref,',
  '    after: event.body.after,',
  '    before: event.body.before,',
  '    deleted: event.body.deleted,',
  '    repository: {',
  '      name: event.body.repository.name,',
  '      owner: { name: event.body.repository.owner.name }',
  '    },',
  '    pusher: { name: event.body.pusher.name }',
  '  };',
  '  var params = {',
  '    TopicArn: topic,',
  '    Subject: "webhook",',
  '    Message: JSON.stringify(push)',
  '  };',
  '  sns.publish(params, function(err) {',
  '    if (err) return context.done("error: " + err.message);',
  '    context.done(null, "success");',
  '  });',
  '};'
]);

watcher.Resources.WatchbotWebhookMethod.Properties.Integration.RequestTemplates = {
  'application/json': '{"signature":"$input.params(\'X-Hub-Signature\')","body":$input.json(\'$\')}'
};

watcher.Resources.WatchbotWebhookMethod.Properties.Integration.IntegrationResponses.push({
  StatusCode: 403,
  SelectionPattern: '^invalid.*'
});

watcher.Resources.WatchbotWebhookMethod.Properties.MethodResponses.push({
  StatusCode: '403',
  ResponseModels: { 'application/json': 'Empty' }
});

// Rollup the template
module.exports = watchbot.merge(watcher, conex);
