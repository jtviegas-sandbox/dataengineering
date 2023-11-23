import sys
import logging

from pyspark.context import SparkContext
from pyspark.sql import DataFrame

from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from awsglue.job import Job

from tgedr.nihao.processors.ticker_simple_analysis import TickerSimpleAnalysis

# Set logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Get sys arguments
args = getResolvedOptions(
    sys.argv, ["source_bucket_key", "target_bucket_key", "job_name"]
)
logger.info(f"[in] args: {args}")

# get glue context
glueContext = GlueContext(SparkContext.getOrCreate())

source_bucket_key = args["source_bucket_key"]
target_bucket_key = args["target_bucket_key"]
job_name = args["job_name"]

logger.info(f"glueContext: {glueContext}")

# create the job
job = Job(glueContext)
job.init(job_name, args)

input = glueContext.spark_session.read.parquet(source_bucket_key)
result: DataFrame = TickerSimpleAnalysis().process(input)
result.write.parquet(target_bucket_key, mode="overwrite")
job.commit()

logger.info("[out]")
