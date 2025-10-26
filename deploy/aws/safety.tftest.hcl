# Mock provider: validates the candidate without credentials or AWS calls.
mock_provider "aws" {}
variables {
  account_id         = "123456789012"
  region             = "eu-central-1"
  availability_zone  = "eu-central-1a"
  ami_id             = "ami-0123456789abcdef0"
  backup_bucket_name = "discammer-synthetic-test-only"
  alarm_topic_arn    = "arn:aws:sns:eu-central-1:123456789012:synthetic-test-only"
  cdn_ipv4_cidrs     = ["192.0.2.0/24"]
}
run "retention_and_network_boundaries" {
  command = plan
  assert {
    condition     = aws_instance.origin.metadata_options[0].http_tokens == "required" && aws_instance.origin.metadata_options[0].http_put_response_hop_limit == 1
    error_message = "IMDS must require tokens and not expose instance-role metadata to application containers."
  }
  assert {
    condition     = aws_ebs_volume.data.encrypted && aws_instance.origin.root_block_device[0].encrypted && !aws_instance.origin.root_block_device[0].delete_on_termination
    error_message = "Root and durable data must be encrypted and retained."
  }
  assert {
    condition     = aws_instance.origin.disable_api_termination && !aws_instance.origin.associate_public_ip_address
    error_message = "Termination protection and exactly one separately managed public address are required."
  }
  assert {
    condition     = aws_s3_bucket_public_access_block.backup.block_public_acls && aws_s3_bucket_public_access_block.backup.block_public_policy && aws_s3_bucket_public_access_block.backup.ignore_public_acls && aws_s3_bucket_public_access_block.backup.restrict_public_buckets
    error_message = "Backup bucket must block all public access."
  }
  assert {
    condition     = alltrue([for r in aws_vpc_security_group_ingress_rule.https : r.from_port == 443 && r.to_port == 443 && r.cidr_ipv4 != "0.0.0.0/0"])
    error_message = "No SSH/application/public-anywhere ingress is permitted."
  }
}
