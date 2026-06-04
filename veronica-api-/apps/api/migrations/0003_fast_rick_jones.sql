CREATE OR REPLACE FUNCTION veronica_product_search(_name text, _description text, _tags text[])
RETURNS tsvector LANGUAGE sql IMMUTABLE AS $$
  SELECT to_tsvector('english', coalesce(_name, '') || ' ' || coalesce(_description, '') || ' ' || coalesce(array_to_string(_tags, ' '), ''))
$$;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (veronica_product_search(name, description, tags)) STORED;--> statement-breakpoint
CREATE INDEX "products_search_idx" ON "products" USING gin ("search_vector");