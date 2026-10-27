output "app_public_ip" {
  description = "Elastic IP of the app box (target of A api.<domain>, proxied)."
  value       = aws_eip.app.public_ip
}

output "app_instance_id" {
  description = "Instance ID of the app box."
  value       = aws_instance.app.id
}

output "app_security_group_id" {
  description = "beacon-app SG; deploy-api.yml opens 22 here for the runner IP during a deploy."
  value       = aws_security_group.app.id
}

output "firecrawl_instance_id" {
  description = "Instance ID of the Firecrawl standby (FIRECRAWL_INSTANCE_ID)."
  value       = aws_instance.firecrawl.id
}

output "firecrawl_private_ip" {
  description = "Private IP of the Firecrawl standby; stable across stop/start."
  value       = aws_instance.firecrawl.private_ip
}

output "firecrawl_self_hosted_url" {
  description = "FIRECRAWL_SELF_HOSTED_URL used by the worker."
  value       = "http://${aws_instance.firecrawl.private_ip}:3002"
}

output "ssh_command" {
  description = "SSH into the app box."
  value       = "ssh -i ${var.ssh_private_key_path} ${local.ssh_user}@${aws_eip.app.public_ip}"
}

output "github_deploy_role_arn" {
  description = "Role deploy-api.yml assumes via OIDC (secret AWS_DEPLOY_ROLE_ARN). Empty when disabled."
  value       = var.enable_github_deploy_role ? aws_iam_role.gha_deploy[0].arn : ""
}

output "ami_id" {
  description = "Ubuntu 24.04 arm64 AMI the instances were launched from."
  value       = data.aws_ami.ubuntu.id
}
