data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "default" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = var.availability_zone
  default_for_az    = true
}

# Latest Canonical Ubuntu 24.04 LTS (noble) arm64 image on gp3.
# Instances ignore later AMI changes (see lifecycle in ec2.tf), so a newer
# image never forces a replacement; unattended-upgrades keeps packages current.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

# Cloudflare edge ranges; 80/443 on the app box accept only these.
data "http" "cloudflare_ipv4" {
  url = "https://www.cloudflare.com/ips-v4"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "Could not fetch https://www.cloudflare.com/ips-v4."
    }
  }
}

data "http" "cloudflare_ipv6" {
  url = "https://www.cloudflare.com/ips-v6"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "Could not fetch https://www.cloudflare.com/ips-v6."
    }
  }
}

locals {
  name = var.project

  cloudflare_ipv4 = sort(distinct([
    for line in split("\n", data.http.cloudflare_ipv4.response_body) : trimspace(line) if trimspace(line) != ""
  ]))
  cloudflare_ipv6 = sort(distinct([
    for line in split("\n", data.http.cloudflare_ipv6.response_body) : trimspace(line) if trimspace(line) != ""
  ]))

  # One SG rule per (CIDR, port). Roughly 15 v4 + 7 v6 ranges x 2 ports = 44 rules,
  # inside the default 60-inbound-rules-per-SG quota (counted per address family).
  cloudflare_web_rules = merge(
    { for pair in setproduct(local.cloudflare_ipv4, [80, 443]) :
      "v4-${pair[1]}-${pair[0]}" => { cidr_ipv4 = pair[0], cidr_ipv6 = null, port = pair[1] }
    },
    { for pair in setproduct(local.cloudflare_ipv6, [80, 443]) :
      "v6-${pair[1]}-${pair[0]}" => { cidr_ipv4 = null, cidr_ipv6 = pair[0], port = pair[1] }
    },
  )

  ssh_user = "ubuntu"
}
