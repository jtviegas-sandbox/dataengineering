variable "region" {type = string}
variable "solution" {type = string}
variable "environment" {type = string}
variable "datalake_bucket" {type = string}

provider "aws" {
  region  = var.region
}

resource "aws_s3_bucket" "datalake" {
  bucket = var.datalake_bucket

  tags = {
    solution    = var.solution
    environment = var.environment
  }
}

resource "aws_s3_bucket_object" "bronze" {
    bucket = aws_s3_bucket.datalake.id
    key    = "bronze/"
    source = "/dev/null"
}

resource "aws_s3_bucket_object" "silver" {
    bucket = aws_s3_bucket.datalake.id
    key    = "silver/"
    source = "/dev/null"
}

resource "aws_s3_bucket_object" "gold" {
    bucket = aws_s3_bucket.datalake.id
    key    = "gold/"
    source = "/dev/null"
}


