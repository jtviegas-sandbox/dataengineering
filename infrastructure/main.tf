variable "region" {type = string}
variable "solution" {type = string}
variable "environment" {type = string}
variable "data_bucket" {type = string}

provider "aws" {
  region  = var.region
}

resource "aws_s3_bucket" "data" {
  bucket = var.data_bucket

  tags = {
    solution    = var.solution
    environment = var.environment
  }
}

output "iac_access_key_id" {
  value = module.devops_identity.user_devops_identity_access_key_id
}

output "iac_access_key" {
  value = module.devops_identity.user_devops_identity_access_key
  sensitive = true
}
