resource "aws_key_pair" "beacon" {
  key_name   = "${local.name}-key"
  public_key = trimspace(var.ssh_public_key)
}

locals {
  # User-data is rendered from templates/ + files/ and gzipped (cloud-init detects
  # gzip). EC2 caps user-data at 16 KB before base64; the standby's raw YAML is
  # ~17 KB, about 6 KB compressed. Preconditions below guard the limit.
  common_sh = file("${path.module}/files/common.sh")

  app_user_data_b64 = base64gzip(templatefile("${path.module}/templates/app-cloud-init.yaml.tftpl", {
    hostname     = "${local.name}-app"
    common_sh    = local.common_sh
    bootstrap_sh = file("${path.module}/files/app-bootstrap.sh")
    kc           = file("${path.module}/files/kc")
    swap_mb      = 1024
  }))

  firecrawl_user_data_b64 = base64gzip(templatefile("${path.module}/templates/firecrawl-cloud-init.yaml.tftpl", {
    hostname            = "${local.name}-firecrawl"
    common_sh           = local.common_sh
    bootstrap_sh        = file("${path.module}/files/firecrawl-bootstrap.sh")
    compose             = file("${path.module}/../compose/firecrawl/docker-compose.yaml")
    env_template        = file("${path.module}/../compose/firecrawl/firecrawl.env.template")
    unit                = file("${path.module}/../compose/firecrawl/firecrawl.service")
    swap_mb             = 2048
    firecrawl_git_ref   = var.firecrawl_git_ref
    firecrawl_image_tag = var.firecrawl_image_tag
  }))

  # Raw (decoded) byte counts, which is what the 16 KB limit applies to.
  app_user_data_bytes       = floor(length(local.app_user_data_b64) * 3 / 4)
  firecrawl_user_data_bytes = floor(length(local.firecrawl_user_data_b64) * 3 / 4)
}

# ── Firecrawl cold standby ────────────────────────────────────────────────
# Boots once, installs Docker + Firecrawl, starts it (firecrawl.service), and is
# then STOPPED by scripts/infra-apply.sh after a verified scrape. From then on
# the worker starts it on demand (ec2:StartInstances) and stops it after
# FIRECRAWL_STANDBY_IDLE_MINUTES. Its private IP survives stop/start, so
# FIRECRAWL_SELF_HOSTED_URL is stable; its public IP changes on every start.
resource "aws_instance" "firecrawl" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.firecrawl_instance_type
  subnet_id                   = data.aws_subnet.firecrawl.id
  vpc_security_group_ids      = [aws_security_group.firecrawl.id]
  key_name                    = aws_key_pair.beacon.key_name
  associate_public_ip_address = true # outbound internet in the default VPC (no NAT)
  user_data_base64            = local.firecrawl_user_data_b64
  monitoring                  = false

  credit_specification {
    cpu_credits = var.cpu_credits
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1 # containers here never need instance metadata
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.firecrawl_volume_size
    encrypted             = true
    delete_on_termination = true
    tags                  = { Name = "${local.name}-firecrawl-root" }
  }

  tags = {
    Name = "${local.name}-firecrawl"
    Role = "firecrawl-standby"
  }

  lifecycle {
    # user_data is first-boot only; a newer AMI must not replace the instance.
    ignore_changes = [ami, user_data, user_data_base64]

    precondition {
      condition     = local.firecrawl_user_data_bytes < 16384
      error_message = "Firecrawl user-data exceeds the 16 KB EC2 limit."
    }
  }
}

# ── App box ───────────────────────────────────────────────────────────────
resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.app_instance_type
  subnet_id              = data.aws_subnet.default.id
  vpc_security_group_ids = [aws_security_group.app.id]
  key_name               = aws_key_pair.beacon.key_name
  iam_instance_profile   = aws_iam_instance_profile.app.name
  user_data_base64       = local.app_user_data_b64
  monitoring             = false

  credit_specification {
    cpu_credits = var.cpu_credits
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2 # the worker container needs the instance role via IMDSv2
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.app_volume_size
    encrypted             = true
    delete_on_termination = true
    tags                  = { Name = "${local.name}-app-root" }
  }

  tags = {
    Name = "${local.name}-app"
    Role = "app"
  }

  lifecycle {
    ignore_changes = [ami, user_data, user_data_base64]

    precondition {
      condition     = local.app_user_data_bytes < 16384
      error_message = "App user-data exceeds the 16 KB EC2 limit."
    }
  }
}

resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = { Name = "${local.name}-app" }
}
