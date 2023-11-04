variable "region" { type = string }
variable "solution" { type = string }
variable "account" { type = string }

provider "aws" {
  region  = var.region
}

module "tgedr_admin" {
  source = "github.com/jtviegas-sandbox/tf-modules?ref=development/modules/aws/tgedr_admin"
  solution = var.solution
  account = var.account
}

output "name" {
  value = module.tgedr_admin.name
}

output "access_key_id" {
  value = module.tgedr_admin.access_key_id
}

output "access_key" {
  value = module.tgedr_admin.access_key
  sensitive = true
}

