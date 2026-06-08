-- Normalize empty category image URLs to NULL (safe to re-run).
UPDATE categories
SET image_url = NULL, updated_at = NOW()
WHERE image_url IS NOT NULL AND trim(image_url) = '';
