# ── App box instance role ────────────────────────────────────────────────
# The worker (inside a container on the app box) starts/stops the Firecrawl
# standby with the instance role: no static AWS keys anywhere. IMDSv2 hop
# limit is 2 on the app box so containers can reach the metadata service.

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${local.name}-app"
  description        = "Beacon app box: start/stop the Firecrawl standby"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "firecrawl_standby_control" {
  statement {
    sid       = "StartStopStandbyOnly"
    actions   = ["ec2:StartInstances", "ec2:StopInstances"]
    resources = [aws_instance.firecrawl.arn]
  }

  # Describe* calls do not support resource-level permissions.
  statement {
    sid       = "DescribeInstances"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "app_firecrawl_standby" {
  name   = "${local.name}-firecrawl-standby-control"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.firecrawl_standby_control.json
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.name}-app"
  role = aws_iam_role.app.name
}

# ── GitHub Actions deploy role (OIDC) ─────────────────────────────────────
# Port 22 on beacon-app is open to admin_cidr only, and GitHub-hosted runners
# have unpredictable IPs. deploy-api.yml assumes this role (main branch only),
# adds <runner-ip>/32 on port 22 for the duration of the job, then revokes it.
# The role can do nothing else.

resource "aws_iam_openid_connect_provider" "github" {
  count = var.enable_github_deploy_role && var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.enable_github_deploy_role && !var.create_github_oidc_provider ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_provider_arn = var.enable_github_deploy_role ? (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  ) : null
}

data "aws_iam_policy_document" "gha_assume" {
  count = var.enable_github_deploy_role ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      # New repositories use immutable IDs in the subject. Keep main as an exact condition.
      values = var.github_oidc_subject_prefix != "" ? [
        "${var.github_oidc_subject_prefix}:ref:refs/heads/main"
        ] : distinct([
          "repo:${var.github_repo}:ref:refs/heads/main",
          "repo:${lower(var.github_repo)}:ref:refs/heads/main",
      ])
    }
  }
}

resource "aws_iam_role" "gha_deploy" {
  count = var.enable_github_deploy_role ? 1 : 0

  name                 = "${local.name}-gha-deploy"
  description          = "GitHub Actions (${var.github_repo}@main): temporarily allow SSH from the runner to beacon-app"
  assume_role_policy   = data.aws_iam_policy_document.gha_assume[0].json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "gha_deploy" {
  count = var.enable_github_deploy_role ? 1 : 0

  statement {
    sid = "EditAppSecurityGroupOnly"
    actions = [
      "ec2:AuthorizeSecurityGroupIngress",
      "ec2:RevokeSecurityGroupIngress",
    ]
    resources = [aws_security_group.app.arn]
  }

  statement {
    sid = "DescribeSecurityGroups"
    actions = [
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSecurityGroupRules",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "gha_deploy" {
  count = var.enable_github_deploy_role ? 1 : 0

  name   = "${local.name}-gha-deploy-ssh-window"
  role   = aws_iam_role.gha_deploy[0].id
  policy = data.aws_iam_policy_document.gha_deploy[0].json
}
