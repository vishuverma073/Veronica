-- Add example third-level categories (preserves existing parentId tree).
-- Safe to re-run: skips rows that already exist by slug.

INSERT INTO categories (id, parent_id, name, slug, description, image_url, sort_order, show_in_header, status)
VALUES
  (100, 10, '18×16', '18x16', 'Compact single bowl size', '/uploads/categories/kitchen-sinks.webp', 0, true, 'active'),
  (101, 10, '24×20', '24x20', 'Medium single bowl size', '/uploads/categories/kitchen-sinks.webp', 1, true, 'active'),
  (102, 10, '32×20', '32x20', 'Large single bowl size', '/uploads/categories/kitchen-sinks.webp', 2, false, 'active'),
  (200, 20, 'Long Body', 'long-body', 'Long body ABS health faucets', '/uploads/categories/health-faucets.webp', 0, true, 'active'),
  (201, 20, 'Short Body', 'short-body', 'Short body ABS health faucets', '/uploads/categories/health-faucets.webp', 1, true, 'active'),
  (202, 20, 'Heavy', 'heavy', 'Heavy-duty ABS health faucets', '/uploads/categories/health-faucets.webp', 2, true, 'active')
ON CONFLICT (slug) DO NOTHING;
