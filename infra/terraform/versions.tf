terraform {
  required_version = ">= 1.6.0"

  # Local backend on purpose: one owner, one environment. State lives in
  # infra/terraform/terraform.tfstate (git-ignored, see .gitignore here).
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Repo      = var.github_repo
    }
  }
}
