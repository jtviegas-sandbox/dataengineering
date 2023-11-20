import logging
import os
from tgedr.nihao.fetchers.tickers_to_s3_parquet import Tickers2S3parquet

logging.getLogger().setLevel(logging.INFO)
logger = logging.getLogger(__name__)

ENV_VAR_REQS = ["TICKERS", "TARGET"]

def handler(event, lambda_context):
    logger.info(f"[handler|in] ({event}, {lambda_context})")
    
    for var in ENV_VAR_REQS:
        if None == os.getenv(var):
            raise Exception(f"missing env var: {var}")
        
    fetcher = Tickers2S3parquet()
    fetcher.fetch(
        tickers=os.environ["TICKERS"], # ,
        target=os.environ["TARGET"],)
    
    logger.info("[handler|out]")
    
    