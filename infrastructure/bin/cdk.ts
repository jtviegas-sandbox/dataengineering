#!/usr/bin/env node
import 'source-map-support/register';
import { DataEngineeringStack } from '../lib/data-engineering-stack';
import { App } from 'aws-cdk-lib';

const env = process.env.ENVIRONMENT || 'dev';
const solution = process.env.SOLUTION;
const region = process.env.AWS_DEFAULT_REGION;
const root_user: string = process.env.ROOT_USER || "tgedr_root";
const domain: string = process.env.DOMAIN || "it";
const organisation: string = process.env.ORGANISATION || "tgedr";

const app = new App();

new DataEngineeringStack(app, "dataengineering", {
    env: { name: env , region: region },
    organisation: organisation,
    domain: domain,
    solution: solution,
    readers: "datalayer-readers", 
    writers: "datalayer-writers"
});
