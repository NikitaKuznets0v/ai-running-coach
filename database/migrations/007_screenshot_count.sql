-- Migration: 007_screenshot_count.sql
-- Date: 2026-02-08
-- Description: Add screenshot_count for multi-photo training merge support

ALTER TABLE trainings ADD COLUMN screenshot_count INTEGER NOT NULL DEFAULT 1;
