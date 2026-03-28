-- Add version targeting to announcements
-- min_app_version: only show on devices running >= this version
-- max_app_version: only show on devices running <= this version
-- Example: force update modal with max_app_version = "2.2.0" shows on all devices running 2.2.0 or older

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS min_app_version TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS max_app_version TEXT;
