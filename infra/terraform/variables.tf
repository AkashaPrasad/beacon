variable "aws_region" {
  description = "AWS region for every resource."
  type        = string
  default     = "ap-south-1"
}

variable "aws_profile" {
  description = "Local AWS CLI profile Terraform authenticates with."
  type        = string
  default     = "claude-dev"
}

variable "project" {
  description = "Name prefix and Project tag."
  type        = string
  default     = "beacon"
}

variable "github_repo" {
  description = "owner/name of the GitHub repo (used for the deploy role trust policy and tags)."
  type        = string
  default     = "AkashaPrasad/beacon"
}

variable "availability_zone" {
  description = "AZ whose default subnet hosts both instances. t4g.small and t4g.large are offered in a, b and c."
  type        = string
  default     = "ap-south-1a"
}

variable "app_instance_type" {
  description = "Instance type of the app box (caddy + api + worker + redis)."
  type        = string
  default     = "t4g.small"

  validation {
    condition     = can(regex("^[a-z]+[0-9]+g[a-z]*\\.", var.app_instance_type))
    error_message = "The AMI is arm64; use a Graviton instance type (e.g. t4g.small, t4g.medium)."
  }
}

variable "firecrawl_instance_type" {
  description = "Instance type of the self-hosted Firecrawl cold standby (normally stopped)."
  type        = string
  default     = "t4g.large"

  validation {
    condition     = can(regex("^[a-z]+[0-9]+g[a-z]*\\.", var.firecrawl_instance_type))
    error_message = "The AMI is arm64; use a Graviton instance type (e.g. t4g.large)."
  }
}

variable "cpu_credits" {
  description = "Burstable credit mode for both instances: unlimited (never throttled, surplus billed at $0.04/vCPU-h) or standard (throttled to baseline when credits run out)."
  type        = string
  default     = "unlimited"

  validation {
    condition     = contains(["standard", "unlimited"], var.cpu_credits)
    error_message = "cpu_credits must be standard or unlimited."
  }
}

variable "app_volume_size" {
  description = "Root gp3 volume size (GB) of the app box."
  type        = number
  default     = 20
}

variable "firecrawl_volume_size" {
  description = "Root gp3 volume size (GB) of the Firecrawl standby (images + Chromium are ~6 GB)."
  type        = number
  default     = 30
}

variable "ssh_public_key" {
  description = "OpenSSH public key installed as key pair beacon-key (from SSH_PUBLIC_KEY in secrets.env)."
  type        = string

  validation {
    condition     = can(regex("^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)) ", var.ssh_public_key))
    error_message = "ssh_public_key must be an OpenSSH public key line."
  }
}

variable "ssh_private_key_path" {
  description = "Local path of the matching private key; only used to print ssh_command."
  type        = string
  default     = "~/.ssh/id_ed25519"
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH to both boxes. scripts/infra-tfvars.sh fills it with the current public IP /32 from scripts/my-ip.sh."
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_cidr, 0)) && var.admin_cidr != "0.0.0.0/0"
    error_message = "admin_cidr must be a valid IPv4 CIDR (normally x.x.x.x/32) and not 0.0.0.0/0."
  }
}

variable "firecrawl_git_ref" {
  description = "Firecrawl git tag cloned (shallow) on the standby. v2.11.162 is the release the official self-host guide verifies."
  type        = string
  default     = "v2.11.162"
}

variable "firecrawl_image_tag" {
  description = "Tag of ghcr.io/firecrawl/firecrawl (multi-arch) used for the API container; must match firecrawl_git_ref."
  type        = string
  default     = "2.11.162"
}

variable "enable_github_deploy_role" {
  description = "Create an IAM role GitHub Actions (main branch, via OIDC) can assume to open port 22 on beacon-app for the runner IP during a deploy."
  type        = bool
  default     = true
}

variable "create_github_oidc_provider" {
  description = "Create the account-wide token.actions.githubusercontent.com OIDC provider. Set false if it already exists in the account."
  type        = bool
  default     = true
}
