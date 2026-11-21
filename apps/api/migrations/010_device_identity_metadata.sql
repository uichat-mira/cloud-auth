-- Additional non-sensitive labels; the installation key and session authority do not change.
ALTER TABLE devices ADD COLUMN device_name TEXT;
ALTER TABLE devices ADD COLUMN os_name TEXT;
ALTER TABLE devices ADD COLUMN os_version TEXT;
