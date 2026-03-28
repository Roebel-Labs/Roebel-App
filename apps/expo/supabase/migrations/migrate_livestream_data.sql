-- One-time migration: move livestream data from separate table into events columns
-- Run AFTER add_livestream_to_events.sql and create_announcements_table.sql

-- Step 1: Copy livestream URL and active status to events
UPDATE events e
SET
  livestream_url = l.youtube_url,
  livestream_active = l.is_active
FROM livestreams l
WHERE e.id = l.event_id;

-- Step 2: Create announcements from livestream modal configs
INSERT INTO announcements (title, description, image_url, cta_label, cta_link, cta_type, is_active, priority, show_once)
SELECT
  COALESCE(l.modal_title, e.title || ' – Jetzt live!'),
  COALESCE(l.modal_description, 'Die Veranstaltung „' || e.title || '" wird gerade live übertragen.'),
  COALESCE(l.modal_image_url, e.image_url),
  'Jetzt ansehen',
  '/event/' || e.id,
  'deep_link',
  l.is_active AND l.show_modal,
  10,
  true
FROM livestreams l
JOIN events e ON e.id = l.event_id
WHERE l.show_modal = true;

-- Step 3: Drop the old livestreams table (uncomment after verifying migration)
-- DROP TABLE IF EXISTS livestreams;
