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
  CfnResource
} from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { aws_glue as glue } from 'aws-cdk-lib';
import { env } from 'process';
import { Source, BucketDeployment } from 'aws-cdk-lib/aws-s3-deployment';
import * as stepFunctionsTasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Timeout } from 'aws-cdk-lib/aws-stepfunctions';
import * as stepFunctions from "aws-cdk-lib/aws-stepfunctions";
import * as logs from 'aws-cdk-lib/aws-logs';

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

    // -------------------------------------------------------------------------
    // --- data lake layers ---
    this.readers = new Group(this, props.readers);
    this.writers = new Group(this, props.writers);
    
    this.layers = {
      landing: new Bucket(this, `${id}-landing`, {
        bucketName: `tgedr-de-landing-${props.env.name}`,
        autoDeleteObjects: true,
        accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        publicReadAccess: false,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      bronze: new Bucket(this, `${id}-bronze`, {
        bucketName: `tgedr-de-bronze-${props.env.name}`,
        autoDeleteObjects: true,
        accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        publicReadAccess: false,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      silver: new Bucket(this, `${id}-silver`, {
        bucketName: `tgedr-de-silver-${props.env.name}`,
        autoDeleteObjects: true,
        accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        publicReadAccess: false,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      gold: new Bucket(this, `${id}-gold`, {
        bucketName: `tgedr-de-gold-${props.env.name}`,
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

    // -------------------------------------------------------------------------
    // --- ticker simple analysis ---

    const dataset_tickers = "tickers"

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

    const CLOUDWATCH_LAMBDA_INSIGHTS_ARN = 'arn:aws:lambda:eu-north-1:580247275435:layer:LambdaInsightsExtension:14'
    this.tickers_source_function = new Function(this, 'TickersSourceFunction', {
      code: Code.fromAssetImage(
        path.join(__dirname, "../../docker/ticker_fetcher"),
        {
          assetName: 'tickerFetcherDockerImage',
          buildArgs: {
            TICKERS: "AMD,NVDA,MSFT",
            TARGET: `s3://tgedr-de-landing-${props.env.name}/${dataset_tickers}`,
          },
          platform: Platform.LINUX_AMD64,
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
    this.tickers_source_function.node.addDependency(this.layers.landing)

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

    this.tickers_source_function.role?.addToPrincipalPolicy(landingPolicy)

    // -------------------------------------------------------------------------
    // --- glue job for bronze processing ---

    const srcBucket = new Bucket(this, `${id}-src`, {
      bucketName: `tgedr-de-src-${props.env.name}`,
      autoDeleteObjects: true,
      accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: false,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const glueJobsDeployment = new BucketDeployment(this, `glueJobsUpload`, {
      sources: [Source.asset("../src/glue_jobs/")],
      destinationBucket: srcBucket,
      destinationKeyPrefix: 'glue_jobs'
    })


    // Glue jobs
    const glueJobsRole = new iam.Role(this, "glueJobsRole", {
      roleName: `tgedr_dataengineering_glueJobsRole`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("glue.amazonaws.com"),
       // new iam.AccountPrincipal(props?.env?.account)
        new iam.AccountPrincipal(CURRENT_ACCOUNT.accountId)
      ),
      inlinePolicies: {
        "tgedr_dataengineering_job_policy": new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["sts:AssumeRole"],
              effect: iam.Effect.ALLOW,
              resources: [
                "arn:aws:iam::*:role/DatalakeLocalRole-*",
                "arn:aws:iam::*:role/DatalakeClientRole-*",
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                "s3:List*",
                "s3:Get*",
                "s3:PutObject*",
                "s3:DeleteObject*",
                "s3:PutLifecycleConfiguration",
              ],
              effect: iam.Effect.ALLOW,
              resources: [
                `arn:aws:s3:::${this.layers.landing.bucketName}`,
                `arn:aws:s3:::${this.layers.landing.bucketName}/*`,
                `arn:aws:s3:::${this.layers.bronze.bucketName}`,
                `arn:aws:s3:::${this.layers.bronze.bucketName}/*`,
                `arn:aws:s3:::${this.layers.silver.bucketName}`,
                `arn:aws:s3:::${this.layers.silver.bucketName}/*`,
                `arn:aws:s3:::${this.layers.gold.bucketName}`,
                `arn:aws:s3:::${this.layers.gold.bucketName}/*`,
                `arn:aws:s3:::${srcBucket.bucketName}`,
                `arn:aws:s3:::${srcBucket.bucketName}/*`,
              ],
            })
          ],
        }),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSGlueServiceRole'
        ),
      ],
    });

    const logsBucket = new Bucket(this, `${id}-logs`, {
      bucketName: `tgedr-de-logs-${props.env.name}`,
      autoDeleteObjects: true,
      accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: false,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
    })
    
    const logGroup = new logs.LogGroup(this, 'tgedr-de-tickerSimpleAnalysisJob-logGroup')
    const tickerSimpleAnalysisJobArguments = {
      "--additional-python-modules": "tgedr-nihao",
      "--python-modules-installer-option": "--upgrade",
      "--source_bucket_key": `s3://${this.layers.landing.bucketName}/${dataset_tickers}`,
      "--target_bucket_key": `s3://${this.layers.bronze.bucketName}/${dataset_tickers}`,
      "--job_name": "ticker-simple-analysis",
      "--enable-auto-scaling": "true",
      "--enable-job-insights": "true",
      "--num_workers": 3,
      "--enable-spark-ui": "true",
      '--spark-event-logs-path': `s3://tgedr-de-logs-${props.env.name}/glue_jobs/tickerSimpleAnalysisJob`,
      '--enable-continuous-cloudwatch-log': 'true',
      '--continuous-log-logGroup': logGroup.logGroupName,
      "--enable-metrics": "true"
    };

    const tickerSimpleAnalysisJob = new glue.CfnJob(this, 'tickerSimpleAnalysisJob', 
    {
      command: {
        name: 'glueetl',
        pythonVersion: '3',
        scriptLocation: `s3://tgedr-de-src-${props.env.name}/glue_jobs/ticker_simple_analysis.py`,
      },
      role: glueJobsRole.roleArn,
      defaultArguments: tickerSimpleAnalysisJobArguments,
      description: 'massages tickers data into bronze dataset',
      executionProperty: {
        maxConcurrentRuns: 1,
      },
      glueVersion: '4.0',
      maxCapacity: 2,
      maxRetries: 2,
      name: 'ticker-simple-analysis-job',
//      numberOfWorkers: 2,
      timeout: 30,
//      workerType: 'G.1X',
    });

    
    // -------------------------------------------------------------------------
    // --- state machine ---

    // states
    const tickersLandingJob = new stepFunctionsTasks.LambdaInvoke(
      this,
      "state-machine-job-tickers-landing", {
        lambdaFunction: this.tickers_source_function,
        stateName: "landing-tickers"
      }
    );

    const tickersBronzeJob = new stepFunctionsTasks.GlueStartJobRun(this, 
      "state-machine-job-tickers-bronze", {
      glueJobName: tickerSimpleAnalysisJob.name!,
      taskTimeout: Timeout.duration(Duration.minutes(30)),
      stateName: "bronze-tickers"
    });

    // chaining

    const stateMachineDefinition = tickersLandingJob.next(tickersBronzeJob);
    const stateMachine = new stepFunctions.StateMachine(this, "data-engineering-state-machine", {
      definitionBody: stepFunctions.DefinitionBody.fromChainable(
        stateMachineDefinition
      ),
      timeout: Duration.minutes(5),
      stateMachineName: "dataEngineeringStateMachine",
      logs: {
        destination: new logs.LogGroup(this, 'tgedr-de-dataEngineeringStateMachine-logGroup'),
        level: stepFunctions.LogLevel.ALL,
      }
    });

    // Define the IAM role for the scheduler to invoke our Lambda functions with
    const dataEngineeringStateMachineSchedulerRole = new iam.Role(this, 'dataEngineeringStateMachineSchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });

    // Create the policy that will allow the role to invoke our functions
    const dataEngineeringStateMachineSchedulerPolicy = new iam.Policy(this, 'dataEngineeringStateMachineSchedulerPolicy', {
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ['states:StartExecution'],
            resources: [stateMachine.stateMachineArn],
            effect: iam.Effect.ALLOW,
          }),
        ],
      }),
    });

    // Attach the policy to the role
    dataEngineeringStateMachineSchedulerRole.attachInlinePolicy(dataEngineeringStateMachineSchedulerPolicy);

    // Defining our recurring schedule
    new CfnResource(this, 'dataEngineeringStateMachineSchedule', {
      type: 'AWS::Scheduler::Schedule',
      properties: {
        Name: `dataEngineeringStateMachineSchedule-${props.env.name}`,
        Description: 'Runs it every half an ahour',
        FlexibleTimeWindow: { Mode: 'OFF' },
        ScheduleExpression: 'cron(0 */6 * * ? *)',
        Target: {
          Arn: stateMachine.stateMachineArn,
          RoleArn: dataEngineeringStateMachineSchedulerRole.roleArn,
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


