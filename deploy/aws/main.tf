# Candidate only. No DNS, credentials, cutover or application bootstrap is performed.
resource "aws_vpc" "origin" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
}
resource "aws_subnet" "origin" {
  vpc_id                  = aws_vpc.origin.id
  cidr_block              = var.vpc_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = false
}
resource "aws_internet_gateway" "origin" {
  vpc_id = aws_vpc.origin.id
}
resource "aws_route_table" "origin" {
  vpc_id = aws_vpc.origin.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.origin.id
  }
}
resource "aws_route_table_association" "origin" {
  subnet_id      = aws_subnet.origin.id
  route_table_id = aws_route_table.origin.id
}
resource "aws_security_group" "origin" {
  name_prefix = "discammer-origin-"
  description = "CDN HTTPS only; administration via outbound SSM, no inbound SSH"
  vpc_id      = aws_vpc.origin.id
}
resource "aws_vpc_security_group_ingress_rule" "https" {
  for_each          = var.cdn_ipv4_cidrs
  security_group_id = aws_security_group.origin.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
resource "aws_vpc_security_group_egress_rule" "https" {
  security_group_id = aws_security_group.origin.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
resource "aws_iam_role" "origin" {
  name_prefix        = "discammer-origin-"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.origin.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_instance_profile" "origin" {
  name_prefix = "discammer-origin-"
  role        = aws_iam_role.origin.name
}
resource "aws_ecr_repository" "web" {
  name                 = "discammer-web"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket" "backup" {
  bucket        = var.backup_bucket_name
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_public_access_block" "backup" {
  bucket                  = aws_s3_bucket.backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_policy" "backup" {
  bucket = aws_s3_bucket.backup.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Sid = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.backup.arn, "${aws_s3_bucket.backup.arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } }] })
}
resource "aws_iam_role_policy" "origin" {
  role = aws_iam_role.origin.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"], Resource = aws_ecr_repository.web.arn },
    { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject"], Resource = "${aws_s3_bucket.backup.arn}/discammer/*" },
    { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.backup.arn, Condition = { StringLike = { "s3:prefix" = ["discammer/*"] } } }
  ] })
}
resource "aws_instance" "origin" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.origin.id
  vpc_security_group_ids      = [aws_security_group.origin.id]
  associate_public_ip_address = false
  iam_instance_profile        = aws_iam_instance_profile.origin.name
  disable_api_termination     = true
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  credit_specification { cpu_credits = "standard" }
  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_gib
    encrypted             = true
    delete_on_termination = false
  }
  lifecycle { prevent_destroy = true }
  tags = { Name = "discammer-origin-candidate" }
}
resource "aws_eip" "origin" {
  domain     = "vpc"
  instance   = aws_instance.origin.id
  depends_on = [aws_internet_gateway.origin]
}
resource "aws_ebs_volume" "data" {
  availability_zone = var.availability_zone
  type              = "gp3"
  size              = var.data_gib
  encrypted         = true
  lifecycle { prevent_destroy = true }
  tags = { Name = "discammer-persistent-data" }
}
resource "aws_volume_attachment" "data" {
  device_name                    = "/dev/sdf"
  volume_id                      = aws_ebs_volume.data.id
  instance_id                    = aws_instance.origin.id
  stop_instance_before_detaching = true
  force_detach                   = false
  lifecycle { prevent_destroy = true }
}
resource "aws_cloudwatch_metric_alarm" "status" {
  alarm_name          = "discammer-origin-status"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  dimensions          = { InstanceId = aws_instance.origin.id }
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 2
  period              = 60
  statistic           = "Maximum"
  treat_missing_data  = "breaching"
  alarm_actions       = [var.alarm_topic_arn]
}
output "origin_ipv4" { value = aws_eip.origin.public_ip }
output "instance_id" { value = aws_instance.origin.id }
output "data_volume_id" { value = aws_ebs_volume.data.id }
output "image_repository" { value = aws_ecr_repository.web.repository_url }
output "backup_bucket" { value = aws_s3_bucket.backup.id }
