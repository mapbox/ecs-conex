'use strict';
var watchbot = require('@mapbox/watchbot');
var cf = require('@mapbox/cloudfriend');
var hookshot = require('@mapbox/hookshot');

var webhook = hookshot.github('ConexWebhookFunction', 'WatchbotWebhook');

// Build watchbot resources
var watcher = watchbot.template({
  prefix: 'Watchbot',
  service: 'ecs-conex',
  serviceVersion: cf.ref('GitSha'),
  family: cf.ref('Family'),
  maxSize: 10,
  minSize: 1,
  reservation: { memory: 512 },
  mounts: '/root',
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
  command: 'eval $(decrypt-kms-env) && timeout 3600 ./ecs-conex.sh',
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
    },
    ConexWebhookFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Role: cf.getAtt('ConexWebhookFunctionRole', 'Arn'),
        Description: cf.join(['watchbot webhooks for ', cf.stackName]),
        Handler: 'index.webhooks',
        Runtime: 'nodejs8.10',
        Timeout: 30,
        MemorySize: 128,
        Code: {
          ZipFile: cf.join('\n', [
            'var AWS = require("aws-sdk");',
            cf.join(['var sns = new AWS.SNS({ region: "', cf.region, '" });']),
            cf.join(['var topic = "', watcher.ref.topic, '";']),
            cf.join(['var secret = "', cf.ref('WatchbotUserKey'), '";']),
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
          ])
        }
      }
    },
    ConexWebhookFunctionRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Sid: 'webhookrole',
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        Policies: [
          {
            PolicyName: 'WatchbotWebhookPolicy',
            PolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['logs:*'],
                  Resource: ['arn:aws:logs:*:*:*']
                },
                {
                  Effect: 'Allow',
                  Action: ['sns:Publish'],
                  Resource: [watcher.ref.topic]
                }
              ]
            }
          }
        ]
      }
    },
    WatchbotUserKey: {
      Type: 'AWS::IAM::AccessKey',
      Description: 'AWS access keys to authenticate as the Watchbot user',
      Properties: {
        Status: 'Active',
        UserName: cf.ref('WatchbotUser')
      }
    },
    WatchbotUser: {
      Type: 'AWS::IAM::User',
      Description: 'An AWS user with permission to publish the the work topic',
      Properties: {
        Policies: [
          {
            PolicyName: cf.join('', [cf.stackName, 'publish-to-sns']),
            PolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Action: [
                    'sns:Publish'
                  ],
                  Resource: [
                    cf.ref('WatchbotTopic')
                  ]
                }
              ]
            }
          }
        ]
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
    }
  }
};

webhook.Resources.WatchbotWebhookStage.Properties.StageName = 'watchbot';
webhook.Resources.WatchbotWebhookResource.Properties.PathPart = 'webhooks';
webhook.Resources.WatchbotWebhookPermission.Properties.FunctionName = cf.ref('ConexWebhookFunction');
webhook.Resources.WatchbotWebhookMethod.Properties.Integration.Uri = cf.sub('arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ConexWebhookFunction.Arn}/invocations');

webhook.Resources.WatchbotWebhookMethod.Properties.Integration.RequestTemplates = {
  'application/json': '{"signature":"$input.params(\'X-Hub-Signature\')","body":$input.json(\'$\')}'
};

watcher.Resources.WatchbotTask.Properties.ContainerDefinitions[0].MountPoints.push({
  ContainerPath: '/var/run/docker.sock',
  SourceVolume: 'docker-sock'
});

watcher.Resources.WatchbotTask.Properties.Volumes.push({
  Host: {
    SourcePath: '/var/run/docker.sock'
  },
  Name: 'docker-sock'
});

// Rollup the template
module.exports = cf.merge(watcher, conex, webhook);
