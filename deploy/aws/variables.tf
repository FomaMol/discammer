variable "account_id" {
  type        = string
  description = "Owner-confirmed AWS account; never inferred from local credentials."
  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "A confirmed 12-digit account ID is required."
  }
}
variable "region" {
  type        = string
  description = "Owner-confirmed AWS region; Frankfurt in cost worksheet is illustrative only."
}
variable "availability_zone" {
  type        = string
  description = "Confirmed zone shared by instance and retained data volume."
}
variable "ami_id" {
  type        = string
  description = "Verified Ubuntu 24.04 x86_64 AMI with working SSM agent. No mutable latest lookup."
}
variable "instance_type" {
  type    = string
  default = "t3.small"
  validation {
    condition     = contains(["t3.small", "t3.medium"], var.instance_type)
    error_message = "Review architecture/cost before widening instance types."
  }
}
variable "root_gib" {
  type    = number
  default = 24
}
variable "data_gib" {
  type    = number
  default = 40
  validation {
    condition     = var.data_gib >= 40
    error_message = "Observed media is already about 15 GiB; allow backups, releases and headroom."
  }
}
variable "cdn_ipv4_cidrs" {
  type        = set(string)
  description = "Freshly verified full Cloudflare IPv4 list. Explicit input, never 0.0.0.0/0."
  validation {
    condition     = length(var.cdn_ipv4_cidrs) > 0 && alltrue([for c in var.cdn_ipv4_cidrs : can(cidrnetmask(c)) && c != "0.0.0.0/0"])
    error_message = "Supply verified non-global IPv4 CIDRs."
  }
}
variable "backup_bucket_name" {
  type        = string
  description = "Owner-approved globally unique private bucket name."
}
variable "alarm_topic_arn" {
  type        = string
  description = "Existing, owner-approved same-region SNS topic. No subscription/email is created."
}
variable "vpc_cidr" {
  type    = string
  default = "10.87.0.0/24"
}
