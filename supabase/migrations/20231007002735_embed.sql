-- General purpose trigger function to generate text embeddings
-- on newly inserted rows.
--
-- Calls an edge function at `/embed` that asynchronously generates
-- the embeddings and stores them on each row.
-- 
-- Trigger is expected to have the format:
--
-- create trigger <trigger_name>
-- after insert on <table_name>
-- referencing new table as inserted
-- for each statement
-- execute procedure private.embed(<content_column>, <embedding_column>);
--
-- Expects 2 arguments: `private.embed(<content_column>, <embedding_column>)`
-- where the first argument indicates the source column containing the text content
-- and the second argument indicates the destination column to store the embedding
create function private.embed() 
returns trigger 
language plpgsql
as $$
declare
  content_column text = TG_ARGV[0];
  embedding_column text = TG_ARGV[1];
  result int;
begin
  select
    net.http_post(
      url := supabase_url() || '/functions/v1/embed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', current_setting('request.headers')::json->>'authorization'
      ),
      body := jsonb_build_object(
        'ids', (select json_agg(inserted.id) from inserted),
        'table', TG_TABLE_NAME,
        'contentColumn', content_column,
        'embeddingColumn', embedding_column
      )
    )
  into result;

  return null;
end;
$$;

create trigger embed_document_sections
  after insert on document_sections
  referencing new table as inserted
  for each statement
  execute procedure private.embed(content, embedding);
