var watchbot = require('watchbot');
var cf = require('cloudfriend');

var watcher = watchbot.template({
  prefix: 'Watchbot',
  service: 'ecs-conex',
  serviceVersion: cf.ref('GitSha'),
  workers: 4,
  reservation: { memory: 512 },
  env: {
    StackRegion: cf.region,
    AccountId: cf.accountId,
    GithubAccessToken: cf.ref('GithubAccessToken'),
    NPMAccessToken: cf.ref('NPMAccessToken')
  },
  mounts: '/mnt/data:/mnt/data,/var/run/docker.sock:/var/run/docker.sock',
  webhook: true,
  user: true,
  notificationEmail: cf.ref('AlarmEmail'),
  cluster: cf.ref('Cluster'),
  clusterRole: cf.ref('ClusterRole'),
  watchbotVersion: cf.ref('WatchbotVersion'),
  alarmThreshold: 20,
  alarmPeriods: 6,
  messageTimeout: 1200
});

var conex = {
  Parameters: {
    GitSha: {
      Description: 'The SHA of the task repository to use',
      Type: 'String'
    },
    WatchbotVersion: {
      Description: 'The version of Watchbot to use',
      Type: 'String',
      Default: 'c48625c6649f8790fae33dd55b1bed55f63505bd'
    },
    GithubAccessToken: {
      Description: 'A Github access token with permission to clone private repositories',
      Type: 'String'
    },
    NPMAccessToken: {
      Type: 'String',
      Description: 'npm access token used to install private packages',
      Default: ''
    },
    Cluster: {
      Description: 'The ARN of the ECS cluster to run on',
      Type: 'String'
    },
    ClusterRole: {
      Description: 'An IAM role that can be assumed by EC2s in the ECS cluster',
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
    }
  },
  Conditions: {
    ForwardLogs: cf.notEquals(cf.ref('LogAggregationFunction'), 'none')
  },
  Resources: {
    LogForwarding: {
      Type: 'AWS::Logs::SubscriptionFilter',
      Description: 'Sends log events from CloudWatch Logs to a Lambda function',
      Condition: 'ForwardLogs',
      Properties: {
        DestinationArn: cf.ref('LogAggregationFunction'),
        LogGroupName: watcher.ref.logGroup,
        FilterPattern: ''
      }
    },
    WorkerPolicy: {
      Type: 'AWS::IAM::Policy',
      Description: 'The IAM policy required by ecs-conex',
      Properties: {
        Roles: [cf.ref('ClusterRole')],
        PolicyName: 'ecs-conex-worker-policy',
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'ecr:BatchGetImage',
                'ecr:CreateRepository',
                'ecr:DescribeRepositories',
                'ecr:GetAuthorizationToken',
                'ecr:InitiateLayerUpload',
                'ecr:CompleteLayerUpload',
                'ecr:UploadLayerPart',
                'ecr:PutImage'
              ],
              Resource: '*'
            }
          ]
        }
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

module.exports = watchbot.merge(watcher, conex);
