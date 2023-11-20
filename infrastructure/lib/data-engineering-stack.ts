import { Group } from 'aws-cdk-lib/aws-iam';
import { Bucket, BucketAccessControl, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Function, Runtime, Code, Handler } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { v4 as uuidv4 } from 'uuid';
import path = require('path');
import {
  Duration, Environment, RemovalPolicy, Stack, StackProps, Tags,
  aws_sqs as sqs,
  aws_lambda_destinations as lambda_destinations,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_ecr_assets as ecr_assets,
  CfnResource
} from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { env } from 'process';

interface CustomEnvironment extends Environment {
  name: string;
}

interface DataLayerProps extends StackProps {
  readonly readers: string;
  readonly writers: string;
  readonly env: CustomEnvironment;
  readonly organisation: string;
  readonly domain?: string;
  readonly solution?: string;
}

interface DataLayers {
  landing: Bucket,
  bronze: Bucket,
  silver: Bucket,
  gold: Bucket
}

export class DataEngineeringStack extends Stack {

  public readonly readers: Group;
  public readonly writers: Group;
  private readonly layers: DataLayers;
  private readonly tickers_source_function: Function;

  constructor(scope: Construct, id: string, props: DataLayerProps) {
    super(scope, id, props);

    const CURRENT_ACCOUNT = new iam.AccountPrincipal(Stack.of(this).account)

    this.readers = new Group(this, props.readers);
    this.writers = new Group(this, props.writers);

    const landingBucketName = `de-landing-${props.env.name}-${uuidv4()}`
    
    this.layers = {
      landing: new Bucket(this, `${id}-landing`, {
        bucketName: landingBucketName,
        autoDeleteObjects: true,
        accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        publicReadAccess: false,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      bronze: new Bucket(this, `${id}-bronze`, {
        bucketName: `de-bronze-${props.env.name}-${uuidv4()}`,
        autoDeleteObjects: true,
        accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        publicReadAccess: false,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      silver: new Bucket(this, `${id}-silver`, {
        bucketName: `de-silver-${props.env.name}-${uuidv4()}`,
        autoDeleteObjects: true,
        accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        publicReadAccess: false,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      gold: new Bucket(this, `${id}-gold`, {
        bucketName: `de-gold-${props.env.name}-${uuidv4()}`,
        autoDeleteObjects: true,
        accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        publicReadAccess: false,
        removalPolicy: RemovalPolicy.DESTROY,
      })
    }

    this.layers.landing.grantDelete(this.writers)
    this.layers.bronze.grantDelete(this.writers)
    this.layers.silver.grantDelete(this.writers)
    this.layers.gold.grantDelete(this.writers)

    this.layers.landing.grantReadWrite(this.writers)
    this.layers.bronze.grantReadWrite(this.writers)
    this.layers.silver.grantReadWrite(this.writers)
    this.layers.gold.grantReadWrite(this.writers)

    this.layers.landing.grantRead(this.readers)
    this.layers.bronze.grantRead(this.readers)
    this.layers.silver.grantRead(this.readers)
    this.layers.gold.grantRead(this.readers)


    const newTickersDataDlq = new sqs.Queue(this, "newTickersDataDlq", {
      //contentBasedDeduplication: true,
      //encryption: sqs.QueueEncryption.KMS_MANAGED,
      enforceSSL: true,
      maxMessageSizeBytes: 2048,
      queueName: `newTickersDataDlq-${props.env.name}`,
      retentionPeriod: Duration.days(3),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const newTickersDataQueue = new sqs.Queue(this, "newTickersDataQueue", {
      //contentBasedDeduplication: true,
      //encryption: sqs.QueueEncryption.KMS_MANAGED,
      enforceSSL: true,
      maxMessageSizeBytes: 4096,
      queueName: `newTickersDataQueue-${props.env.name}`,
      deadLetterQueue: {
        queue: newTickersDataDlq,
        maxReceiveCount: 1
      },
      removalPolicy: RemovalPolicy.DESTROY,
      retentionPeriod: Duration.seconds(900),
      visibilityTimeout: Duration.seconds(900)
    });

    const landingPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:GetObjectTagging",
        "s3:PutObject",
        "s3:DeleteObject",
      ],
      resources: [this.layers.landing.bucketArn, this.layers.landing.bucketArn + "/*"],
    });

    const ecrPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ecr:CompleteLayerUpload",
        "ecr:GetAuthorizationToken",
        "ecr:UploadLayerPart",
        "ecr:InitiateLayerUpload",
        "ecr:BatchCheckLayerAvailability",
        "ecr:PutImage"
      ],
      resources: ["*"],
    });

    const CLOUDWATCH_LAMBDA_INSIGHTS_ARN = 'arn:aws:lambda:eu-north-1:580247275435:layer:LambdaInsightsExtension:14'
    this.tickers_source_function = new Function(this, 'TickersSourceFunction', {
      code: Code.fromAssetImage(
        path.join(__dirname, "../../docker/ticker_fetcher"),
        {
          assetName: 'tickerFetcherDockerImage',
          buildArgs: {
            TICKERS: "AMD,NVDA,MSFT",
            TARGET: `s3://${landingBucketName}/${props.solution}`,
          },
          platform: ecr_assets.Platform.LINUX_AMD64,
        }
      ),
      handler: Handler.FROM_IMAGE,
      runtime: Runtime.FROM_IMAGE,
      description: "function to get tickers into s3 landing stage",
      functionName: `TickersSourceFunction-${props.env.name}`,
      onFailure: new lambda_destinations.SqsDestination(newTickersDataDlq),
      onSuccess: new lambda_destinations.SqsDestination(newTickersDataQueue),
      insightsVersion: lambda.LambdaInsightsVersion.fromInsightVersionArn(CLOUDWATCH_LAMBDA_INSIGHTS_ARN),
      logRetention: RetentionDays.ONE_WEEK,
      memorySize: 512,
      profiling: false,
      timeout: Duration.seconds(900),
    });

    this.tickers_source_function.role?.addToPrincipalPolicy(landingPolicy)

    // Define the IAM role for the scheduler to invoke our Lambda functions with
    const tickersSourceFunctionSchedulerRole = new iam.Role(this, 'tickersSourceFunctionSchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });

    // Create the policy that will allow the role to invoke our functions
    const tickersSourceFunctionSchedulerPolicy = new iam.Policy(this, 'tickersSourceFunctionSchedulerPolicy', {
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ['lambda:InvokeFunction'],
            resources: [this.tickers_source_function.functionArn],
            effect: iam.Effect.ALLOW,
          }),
        ],
      }),
    });

    // Attach the policy to the role
    tickersSourceFunctionSchedulerRole.attachInlinePolicy(tickersSourceFunctionSchedulerPolicy);

    // Defining our recurring schedule
    new CfnResource(this, 'tickersSourceFunctionSchedule', {
      type: 'AWS::Scheduler::Schedule',
      properties: {
        Name: `tickersSourceFunctionScheduler-${props.env.name}`,
        Description: 'Runs a schedule for every day',
        FlexibleTimeWindow: { Mode: 'OFF' },
        ScheduleExpression: 'cron(28 * * * ? *)',
        Target: {
          Arn: this.tickers_source_function.functionArn,
          RoleArn: tickersSourceFunctionSchedulerRole.roleArn,
        },
      },
    });


    Tags.of(this).add('environment', props.env.name);
    if (props.organisation)
      Tags.of(this).add('organisation', props.organisation);
    if (props.domain)
      Tags.of(this).add('domain', props.domain);
    if (props.solution)
      Tags.of(this).add('solution', props.solution);

    /*
    addObjCreationNotification(handler: Function, layer: DataLayer){
        const bucket = this.pick_layer(layer)
        bucket.addObjectCreatedNotification(new LambdaDestination(handler), { prefix: `${layer.toString()}/*` });
    }
    */

  }
}


