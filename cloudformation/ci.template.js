var cf = require('cloudfriend');

module.exports = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'test user for ecs-conex',
  Resources: {
    User: {
      Type: 'AWS::IAM::User',
      Properties: {
        Policies: [
          {
            PolicyName: 'validate-templates',
            PolicyDocument: {
              Statement: [
                {
                  Action: ['ecr:*'],
                  Effect: 'Allow',
                  Resource: cf.join(['arn:aws:ecr:*:', cf.accountId, ':repository/ecs-conex-test'])
                },
                {
                  Action: ['ecr:GetAuthorizationToken', 'ecr:CreateRepository'],
                  Effect: 'Allow',
                  Resource: '*'
                },
                {
                  Action: ['cloudformation:ValidateTemplate'],
                  Effect: 'Allow',
                  Resource: '*'
                }
              ]
            }
          }
        ]
      }
    },
    AccessKey: {
      Type: 'AWS::IAM::AccessKey',
      Properties: {
        UserName: cf.ref('User')
      }
    }
  },
  Outputs: {
    AccessKeyId: {
      Value: cf.ref('AccessKey')
    },
    SecretAccessKey: {
      Value: cf.getAtt('AccessKey', 'SecretAccessKey')
    }
  }
};
