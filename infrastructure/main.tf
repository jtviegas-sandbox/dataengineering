variable "region" {type = string}
variable "solution" {type = string}
variable "environment" {type = string}
variable "data_bucket" {type = string}

provider "aws" {
  region  = var.region
}

resource "aws_s3_bucket" "datalake" {
  bucket = var.data_bucket

  tags = {
    solution    = var.solution
    environment = var.environment
  }
}


