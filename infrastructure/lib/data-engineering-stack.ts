import { Environment, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Group } from 'aws-cdk-lib/aws-iam';
import { Bucket, BucketAccessControl, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { v4 as uuidv4 } from 'uuid';

interface CustomEnvironment extends Environment {
  name: string;
}

interface DataLayerProps extends StackProps {
  readers: string;
  writers: string;
  readonly env: CustomEnvironment;
  readonly organisation?: string;
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

  constructor(scope: Construct, id: string, props: DataLayerProps) {
    super(scope, id, props);

    this.readers = new Group(this, props.readers);
    this.writers = new Group(this, props.writers);

    this.layers = {
      landing: new Bucket(this, `${id}-landing`, {
          bucketName: `${id}-landing-${uuidv4()}`,
          autoDeleteObjects: true,
          accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
          encryption: BucketEncryption.S3_MANAGED,
          enforceSSL: true,
          publicReadAccess: false,
          removalPolicy: RemovalPolicy.DESTROY,
      }),
      bronze: new Bucket(this, `${id}-bronze`, {
          bucketName: `${id}-bronze-${uuidv4()}`,
          autoDeleteObjects: true,
          accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
          encryption: BucketEncryption.S3_MANAGED,
          enforceSSL: true,
          publicReadAccess: false,
          removalPolicy: RemovalPolicy.DESTROY,
      }),
      silver: new Bucket(this, `${id}-silver`, {
          bucketName: `${id}-silver-${uuidv4()}`,
          autoDeleteObjects: true,
          accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
          encryption: BucketEncryption.S3_MANAGED,
          enforceSSL: true,
          publicReadAccess: false,
          removalPolicy: RemovalPolicy.DESTROY,
      }),
      gold: new Bucket(this, `${id}-gold`, {
          bucketName: `${id}-gold-${uuidv4()}`,
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


