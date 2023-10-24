variable "region" {type = string}
variable "solution" {type = string}
variable "environment" {type = string}
variable "iac_group" {type = string}
variable "iac_user" {type = string}
variable "tfstate_bucket" {type = string}
variable "tfstate_lock_table" {type = string}
variable "users_group" {type = string}
variable "user" {type = string}

provider "aws" {
  region  = var.region
}

module "tfstate" {
  source = "github.com/jtviegas-sandbox/tf-modules?ref=development/modules/aws/tfstate"
  solution = var.solution
  bucket = var.tfstate_bucket
  environment = var.environment
  lock_table = var.tfstate_lock_table
}

module "devops_identity" {
  source = "github.com/jtviegas-sandbox/tf-modules?ref=development/modules/aws/devops_identity"

  group = var.iac_group
  user = var.iac_user
  solution = var.solution
  custom_policy = jsonencode(
    {
      "Statement": [ 
          { "Action": [ "amplify:GetJob", "amplify:ListArtifacts", "amplify:ListJobs" ], 
          "Effect": "Allow",
          "Resource": "*",
          "Sid": "VisualEditor01"}
          ],
      "Version": "2012-10-17"
    }
  )
}

module "users_identity" {
  source = "github.com/jtviegas-sandbox/tf-modules?ref=development/modules/aws/users_identity"

  group = var.users_group
  solution = var.solution
  user = var.user

  custom_policy = jsonencode(
    {
      "Statement": [ 
          { "Action": [ "amplify:GetJob", "amplify:ListArtifacts", "amplify:ListJobs" ], 
          "Effect": "Allow",
          "Resource": "*"}
          ],
      "Version": "2012-10-17"
    }
  )
}


output "iac_access_key_id" {
  value = module.devops_identity.iac_user_access_key_id
}

output "iac_access_key" {
  value = module.devops_identity.iac_user_access_key
  sensitive = true
}

output "tfstate_bucket_arn" {
  value = module.tfstate.bucket_arn
}

output "tfstate_bucket_id" {
  value = module.tfstate.bucket_id
}

output "tfstate_lock_table_arn" {
  value = module.tfstate.lock_table_arn
}

output "tfstate_lock_table_id" {
  value = module.tfstate.lock_table_id
}

output "users_group_id" {
  value = module.users_identity.group_id
}

output "users_group_arn" {
  value = module.users_identity.group_arn
}

output "user_access_key_id" {
  value = module.users_identity.user_access_key_id
}

output "user_access_key" {
  value = module.users_identity.user_access_key
  sensitive = true
}