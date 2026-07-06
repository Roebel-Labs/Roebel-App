-- Hero/banner image for newsletter issues (rendered full-width between header and body)
alter table newsletter_issues add column if not exists hero_image_url text;
