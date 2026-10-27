# Rules are standalone aws_vpc_security_group_*_rule resources (not inline
# blocks) so that the temporary port-22 rule a GitHub Actions deploy adds for
# its runner IP never shows up as drift, and is never removed by an apply.

# ── beacon-app ───────────────────────────────────────────────────────────
resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "Beacon app box: 80/443 from Cloudflare only, 22 from admin"
  vpc_id      = data.aws_vpc.default.id

  tags = { Name = "${local.name}-app" }

  lifecycle {
    precondition {
      condition = (
        length(local.cloudflare_ipv4) >= 5 &&
        length(local.cloudflare_ipv6) >= 3 &&
        alltrue([for c in concat(local.cloudflare_ipv4, local.cloudflare_ipv6) : can(cidrhost(c, 0))])
      )
      error_message = "Cloudflare IP lists look wrong (too short or not CIDRs); refusing to build the SG."
    }
  }
}

resource "aws_vpc_security_group_ingress_rule" "app_ssh_admin" {
  security_group_id = aws_security_group.app.id
  description       = "SSH from admin"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
  cidr_ipv4         = var.admin_cidr

  tags = { Name = "${local.name}-app-ssh-admin" }
}

resource "aws_vpc_security_group_ingress_rule" "app_cloudflare" {
  for_each = local.cloudflare_web_rules

  security_group_id = aws_security_group.app.id
  description       = "HTTP(S) from Cloudflare"
  ip_protocol       = "tcp"
  from_port         = each.value.port
  to_port           = each.value.port
  cidr_ipv4         = each.value.cidr_ipv4
  cidr_ipv6         = each.value.cidr_ipv6

  tags = { Name = "${local.name}-app-cf-${each.value.port}" }
}

resource "aws_vpc_security_group_egress_rule" "app_all_ipv4" {
  security_group_id = aws_security_group.app.id
  description       = "All egress (IPv4)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "app_all_ipv6" {
  security_group_id = aws_security_group.app.id
  description       = "All egress (IPv6)"
  ip_protocol       = "-1"
  cidr_ipv6         = "::/0"
}

# ── beacon-firecrawl (cold standby) ──────────────────────────────────────
resource "aws_security_group" "firecrawl" {
  name        = "${local.name}-firecrawl"
  description = "Beacon Firecrawl standby: 3002 from beacon-app only, 22 from admin"
  vpc_id      = data.aws_vpc.default.id

  tags = { Name = "${local.name}-firecrawl" }
}

resource "aws_vpc_security_group_ingress_rule" "firecrawl_api_from_app" {
  security_group_id            = aws_security_group.firecrawl.id
  description                  = "Firecrawl API from the app box"
  ip_protocol                  = "tcp"
  from_port                    = 3002
  to_port                      = 3002
  referenced_security_group_id = aws_security_group.app.id

  tags = { Name = "${local.name}-firecrawl-3002-from-app" }
}

resource "aws_vpc_security_group_ingress_rule" "firecrawl_ssh_admin" {
  security_group_id = aws_security_group.firecrawl.id
  description       = "SSH from admin"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
  cidr_ipv4         = var.admin_cidr

  tags = { Name = "${local.name}-firecrawl-ssh-admin" }
}

resource "aws_vpc_security_group_egress_rule" "firecrawl_all_ipv4" {
  security_group_id = aws_security_group.firecrawl.id
  description       = "All egress (IPv4)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "firecrawl_all_ipv6" {
  security_group_id = aws_security_group.firecrawl.id
  description       = "All egress (IPv6)"
  ip_protocol       = "-1"
  cidr_ipv6         = "::/0"
}
