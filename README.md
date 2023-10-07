<img alt="Next.js 13 and app template Router-ready Supabase starter kit." src="https://demo-nextjs-with-supabase.vercel.app/opengraph-image.png">
<h1 align="center">ChatGPT Your Files - Supabase Workshop</h1>

<p align="center">
In this workshop, we will create a production-ready MVP for securely chatting with your documents.
</p>

## Features

- **Interactive Chat Interface:** Interact your documentation, leveraging the capabilities of OpenAI’s GPT models and retrieval augmented generation (RAG).
- **Login With <3rd Party>:** Integrate one-click 3rd party login with any of our 18 auth providers and user/password.
- **Document Storage:** Securely upload, store, and retrieve user uploaded documents.
- **REST API:** Expose a flexible REST API that we’ll consume to build the interactive front-end.
- **Row-level Security:** Secure all of your user data user data with production-ready row-level security.

## Workshop Instructions

1. Clone this repo at `step-0`:

   ```shell
   git clone -b step-0 https://github.com/supabase-community/chatgpt-your-files.git
   ```

1. The workshop is broken down into steps (git tags). Generally there's a step for every major feature.

   Follow along live with the presenter. When it's time to jump to the next step, run:

   ```shell
   git stash push -u # stash your working directory
   git checkout step-X # jump to a checkpoint (replace X with #)
   ```

1. These steps are also written out line-by-line below. If you fall behind or miss something, simply refer to the written steps [below](#step-by-step).

## Pre-req’s

- Unix-based OS (if Windows, WSL2)
- Docker
- Node.js 18+

## Step-by-step

Jump to a step:

0. [Setup](#step-0---setup)
1. [Storage](#step-1---storage)
2. [Documents](#step-2---documents)
3. [Embeddings](#step-3---embeddings)
4. [Chat](#step-4---chat)
5. [Database Types](#step-5---database-types-bonus) (Bonus)

---

### `Step 0` - Setup

```shell
git checkout step-0
```

1. Install Supabase as dev dependency

   ```bash
   npm i -D supabase@1.102.0
   ```

2. Initialize and start Supabase

   ```bash
   npx supabase init
   npx supabase start
   ```

3. Store Supabase URLs/keys in `.env.local`

   ```bash
   npx supabase status -o env \
     --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
     --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY |
   	 grep NEXT_PUBLIC > .env.local
   ```

4. (Optional) Setup VSCode environment

   ```bash
   mkdir -p .vscode && cat > .vscode/settings.json <<- EOF
   {
     "deno.enable": true,
     "deno.lint": true,
     "deno.unstable": false,
     "deno.enablePaths": [
       "supabase"
     ],
     "deno.importMap": "./supabase/functions/import_map.json"
   }
   EOF
   ```

5. (Optional) Setup VSCode recommended extensions

   ```bash
   cat > .vscode/extensions.json <<- EOF
   {
   	"recommendations": [
   		"denoland.vscode-deno",
   		"esbenp.prettier-vscode",
   		"dbaeumer.vscode-eslint",
   		"bradlc.vscode-tailwindcss",
   	],
   }
   EOF
   ```

   Then `cmd`+`shift`+`p` → `>show recommended extensions` → install all

6. Create `import_map.json` placeholder

   ```bash
   echo "{}" > supabase/functions/import_map.json
   ```

### Frontend

1. Initialize `shadcn-ui`

   ```bash
   npx shadcn-ui@latest init
   ```

   ```bash
   Would you like to use TypeScript (recommended)? yes
   Which style would you like to use? › Default
   Which color would you like to use as base color? › Slate
   Where is your global CSS file? › › app/globals.css
   Do you want to use CSS variables for colors? › yes
   Where is your tailwind.config.js located? › tailwind.config.js
   Configure the import alias for components: › @/components
   Configure the import alias for utils: › @/lib/utils
   Are you using React Server Components? › yes
   ```

2. Add components

   ```bash
   npx shadcn-ui@latest add button input toast
   ```

3. Install dependencies

   ```bash
   npm i @tanstack/react-query three-dots
   ```

4. Wrap the app in a `<QueryClientProvider>`
5. Build layouts

---

### `Step 1` - Storage

```shell
git stash push -u -m "my work on step-0"
git checkout step-1
```

1. Migration

   1. Create migration file

      ```bash
      npx supabase migration new files
      ```

   2. Create private schame

      ```sql
      create schema private;
      ```

   3. Add bucket

      ```sql
      insert into storage.buckets (id, name)
      values ('files', 'files');
      ```

   4. Add RLS policies

      ```sql
      create policy "Authenticated users can upload files"
      on storage.objects for insert to authenticated with check (
        bucket_id = 'files' and owner = auth.uid()
      );

      create policy "Users can view their own files"
      on storage.objects for select to authenticated using (
        bucket_id = 'files' and owner = auth.uid()
      );

      create policy "Users can update their own files"
      on storage.objects for update to authenticated with check (
        bucket_id = 'files' and owner = auth.uid()
      );

      create policy "Users can delete their own files"
      on storage.objects for delete to authenticated using (
        bucket_id = 'files' and owner = auth.uid()
      );
      ```

2. Frontend

   1. Setup supabase client

      ```tsx
      const supabase = createClientComponentClient();
      ```

   2. Handle file upload

      ```tsx
      await supabase.storage
        .from('files')
        .upload(`${crypto.randomUUID()}/${selectedFile.name}`, selectedFile);
      ```

3. Improve upload RLS

   1. Create `uuid_or_null()`

      ```sql
      create or replace function private.uuid_or_null(str text)
      returns uuid
      language plpgsql
      as $$
      begin
        return str::uuid;
        exception when invalid_text_representation then
          return null;
        end;
      $$;
      ```

   2. Improve RLS on insert

      ```sql
      create policy "Authenticated users can upload files"
      on storage.objects for insert to authenticated with check (
        bucket_id = 'files' and
          owner = auth.uid() and
          private.uuid_or_null(path_tokens[1]) is not null
      );
      ```

   3. Run the migration

      ```bash
      npx supabase migration up
      ```

---

### `Step 2` - Documents

```shell
git stash push -u -m "my work on step-1"
git checkout step-2
```

1. Migration

   1. Create migration file

      ```bash
      npx supabase migration new documents
      ```

   2. Enable `pg_net` and `pgvector` extensions

      ```sql
      create extension if not exists pg_net with schema extensions;
      create extension if not exists vector with schema extensions;
      ```

   3. Create `documents` table and view

      ```sql
      create table documents (
        id bigint primary key generated always as identity,
        name text not null,
        storage_object_id uuid not null references storage.objects (id),
        created_by uuid not null references auth.users (id) default auth.uid(),
        created_at timestamp with time zone not null default now()
      );
      ```

   4. And view (for easy access to the storage object path)

      ```sql
      create view documents_with_storage_path
      with (security_invoker=true)
      as
        select documents.*, storage.objects.name as storage_object_path
        from documents
        join storage.objects
          on storage.objects.id = documents.storage_object_id;
      ```

   5. Create `document_sections` table

      ```sql
      create table document_sections (
        id bigint primary key generated always as identity,
        document_id bigint not null references documents (id),
        content text not null,
        embedding vector (384)
      );
      ```

   6. Add HNSW index

      ```sql
      create index on document_sections using hnsw (embedding vector_ip_ops);
      ```

   7. Setup RLS

      ```sql
      alter table documents enable row level security;
      alter table document_sections enable row level security;

      create policy "Users can insert documents"
      on documents for insert to authenticated with check (
        auth.uid() = created_by
      );

      create policy "Users can query their own documents"
      on documents for select to authenticated using (
        auth.uid() = created_by
      );

      create policy "Users can insert document sections"
      on document_sections for insert to authenticated with check (
        document_id in (
          select id
          from documents
          where created_by = auth.uid()
        )
      );

      create policy "Users can update their own document sections"
      on document_sections for update to authenticated using (
        document_id in (
          select id
          from documents
          where created_by = auth.uid()
        )
      ) with check (
        document_id in (
          select id
          from documents
          where created_by = auth.uid()
        )
      );

      create policy "Users can query their own document sections"
      on document_sections for select to authenticated using (
        document_id in (
          select id
          from documents
          where created_by = auth.uid()
        )
      );
      ```

   8. Add `supabase_url` secret to `seed.sql`

      ```sql
      select vault.create_secret(
        'http://api.supabase.internal:8000',
        'supabase_url'
      );
      ```

   9. And a function to retrieve it

      ```sql
      create function supabase_url()
      returns text
      language plpgsql
      security definer
      as $$
      declare
        secret_value text;
      begin
        select decrypted_secret into secret_value from vault.decrypted_secrets where name = 'supabase_url';
        return secret_value;
      end;
      $$;
      ```

   10. Create trigger to process new documents

       ```sql
       create function private.handle_storage_update()
       returns trigger
       language plpgsql
       as $$
       declare
         document_id bigint;
         result int;
       begin
         insert into documents (name, storage_object_id, created_by)
           values (new.path_tokens[2], new.id, new.owner)
           returning id into document_id;

         select
           net.http_post(
             url := supabase_url() || '/functions/v1/process',
             headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'Authorization', current_setting('request.headers')::json->>'authorization'
             ),
             body := jsonb_build_object(
               'document_id', document_id
             )
           )
         into result;

         return null;
       end;
       $$;

       create trigger on_file_upload
         after insert on storage.objects
         for each row
         execute procedure private.handle_storage_update();
       ```

   11. Run the migration

       ```bash
       npx supabase migration up
       ```

2. Edge function for `/process`

   1. First: update `import_map.json` with our dependencies

      ```bash
      cat > supabase/functions/import_map.json <<- EOF
      {
        "imports": {
          "@std/": "https://deno.land/std@0.168.0/",

          "@xenova/transformers": "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.1",
          "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.21.0",
          "openai": "https://esm.sh/openai@4.10.0",
          "common-tags": "https://esm.sh/common-tags@1.8.2",
          "ai": "https://esm.sh/ai@2.2.13",

          "mdast-util-from-markdown": "https://esm.sh/mdast-util-from-markdown@2.0.0",
          "mdast-util-to-markdown": "https://esm.sh/mdast-util-to-markdown@2.1.0",
          "mdast-util-to-string": "https://esm.sh/mdast-util-to-string@4.0.0",
          "unist-builder": "https://esm.sh/unist-builder@4.0.0",
          "mdast": "https://esm.sh/v132/@types/mdast@4.0.0/index.d.ts",

          "https://esm.sh/v132/decode-named-character-reference@1.0.2/esnext/decode-named-character-reference.mjs": "https://esm.sh/decode-named-character-reference@1.0.2?target=deno"
        }
      }
      EOF
      ```

   2. Create edge function file

      ```bash
      npx supabase functions new process
      ```

      Make sure you have the latest version of `deno` installed

      ```bash
      brew install deno
      ```

   3. In `process/index.ts`, check for Supabase environment variables

      ```tsx
      import { createClient } from '@supabase/supabase-js';
      import { processMarkdown } from '../_lib/markdown-parser.ts';

      // These are automatically injected
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

      Deno.serve(async (req) => {
        if (!supabaseUrl || !supabaseAnonKey) {
          return new Response(
            JSON.stringify({
              error: 'Missing environment variables.',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      });
      ```

   4. Create Supabase client and configure to inherit the user’s authorization

      ```tsx
      const authorization = req.headers.get('Authorization');

      if (!authorization) {
        return new Response(
          JSON.stringify({ error: `No authorization header passed` }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            authorization,
          },
        },
        auth: {
          persistSession: false,
        },
      });
      ```

   5. Grab the `document_id` from the request body and query it

      ```tsx
      const { document_id } = await req.json();

      const { data: document } = await supabase
        .from('documents_with_storage_path')
        .select()
        .eq('id', document_id)
        .single();

      if (!document?.storage_object_path) {
        return new Response(
          JSON.stringify({ error: 'Failed to find uploaded document' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      ```

   6. Download the file

      ```tsx
      const { data: file } = await supabase.storage
        .from('files')
        .download(document.storage_object_path);

      if (!file) {
        return new Response(
          JSON.stringify({ error: 'Failed to download storage object' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const fileContents = await file.text();
      ```

   7. Process markdown and store in `document_sections` table:

      ```tsx
      const processedMd = processMarkdown(fileContents);

      const { error } = await supabase.from('document_sections').insert(
        processedMd.sections.map(({ content }) => ({
          document_id,
          content,
        }))
      );

      if (error) {
        console.error(error);
        return new Response(
          JSON.stringify({ error: 'Failed to save document sections' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      console.log(
        `Saved ${processedMd.sections.length} sections for file '${document.name}'`
      );
      ```

   8. Return success

      ```tsx
      return new Response(null, {
        status: 204,
        headers: { 'Content-Type': 'application/json' },
      });
      ```

3. Watch the edge function logs

   ```bash
   npx supabase functions serve
   ```

4. Display documents on the frontend

   1. Fetch documents using `useQuery` hook:

      ```tsx
      const { data: documents } = useQuery(['files'], async () => {
        const { data, error } = await supabase
          .from('documents_with_storage_path')
          .select();

        if (error) {
          toast({
            variant: 'destructive',
            description: 'Failed to fetch documents',
          });
          throw error;
        }

        return data;
      });
      ```

   2. Download the file on click

      ```tsx
      const { data, error } = await supabase.storage
        .from('files')
        .createSignedUrl(document.storage_object_path, 60);

      if (error) {
        toast({
          variant: 'destructive',
          description: 'Failed to download file. Please try again.',
        });
        return;
      }

      window.location.href = data.signedUrl;
      ```

---

### `Step 3` - Embeddings

```shell
git stash push -u -m "my work on step-2"
git checkout step-3
```

1. Create migration

   1. Create migration file

      ```bash
      npx supabase migration new embed
      ```

   2. Create `embed()` trigger function

      ```sql
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
      ```

   3. Add embed trigger to `document_sections` table

      ```sql
      create trigger embed_document_sections
        after insert on document_sections
        referencing new table as inserted
        for each statement
        execute procedure private.embed(content, embedding);
      ```

   4. Run the migration

      ```bash
      npx supabase migration up
      ```

2. Create edge function for `/embed`

   1. Create edge function file

      ```bash
      npx supabase functions new embed
      ```

   2. In `embed/index.ts`, create embedding pipeline

      ```tsx
      import { createClient } from '@supabase/supabase-js';
      import { env, pipeline } from '@xenova/transformers';

      // Configuration for Deno runtime
      env.useBrowserCache = false;
      env.allowLocalModels = false;

      const generateEmbedding = await pipeline(
        'feature-extraction',
        'Supabase/gte-small'
      );
      ```

   3. Check for Supabase environment variables

      ```tsx
      // These are automatically injected
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

      Deno.serve(async (req) => {
        if (!supabaseUrl || !supabaseAnonKey) {
          return new Response(
            JSON.stringify({
              error: 'Missing environment variables.',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      });
      ```

   4. Create Supabase client and configure to inherit the user’s authorization

      ```tsx
      const authorization = req.headers.get('Authorization');

      if (!authorization) {
        return new Response(
          JSON.stringify({ error: `No authorization header passed` }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            authorization,
          },
        },
        auth: {
          persistSession: false,
        },
      });
      ```

   5. Fetch the text content from the specified table/column

      ```tsx
      const { ids, table, contentColumn, embeddingColumn } = await req.json();

      const { data: rows, error: selectError } = await supabase
        .from(table)
        .select(`id, ${contentColumn}` as '*')
        .in('id', ids)
        .is(embeddingColumn, null);

      if (selectError) {
        return new Response(JSON.stringify({ error: selectError }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      ```

   6. Generate an embedding on each text and update the respective rows

      ```tsx
      for (const row of rows) {
        const { id, [contentColumn]: content } = row;

        if (!content) {
          console.error(`No content available in column '${contentColumn}'`);
          continue;
        }

        const output = await generateEmbedding(content, {
          pooling: 'mean',
          normalize: true,
        });

        const embedding = JSON.stringify(Array.from(output.data));

        const { error } = await supabase
          .from(table)
          .update({
            [embeddingColumn]: embedding,
          })
          .eq('id', id);

        if (error) {
          console.error(
            `Failed to save embedding on '${table}' table with id ${id}`
          );
        }

        console.log(
          `Generated embedding ${JSON.stringify({
            table,
            id,
            contentColumn,
            embeddingColumn,
          })}`
        );
      }
      ```

   7. Return success

      ```tsx
      return new Response(null, {
        status: 204,
        headers: { 'Content-Type': 'application/json' },
      });
      ```

---

### `Step 4` - Chat

```shell
git stash push -u -m "my work on step-3"
git checkout step-4
```

1. Frontend

   1. Install dependencies

      ```bash
      npm i @xenova/transformers ai
      ```

   2. Configure `next.config.js` to support Transformers.js

      ```jsx
        webpack: (config) => {
          config.resolve.alias = {
            ...config.resolve.alias,
            sharp$: false,
            'onnxruntime-node$': false,
          };
          return config;
        },
      ```

   3. Import dependencies

      ```tsx
      import { usePipeline } from '@/lib/hooks/use-pipeline';
      import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
      import { useChat } from 'ai/react';
      ```

   4. Create `supabase` client in `chat/page.tsx`

      ```tsx
      const supabase = createClientComponentClient();
      ```

   5. Create embeddings pipeline

      ```tsx
      const generateEmbedding = usePipeline(
        'feature-extraction',
        'Supabase/gte-small'
      );
      ```

   6. Manage chat messages and state with `useChat()`

      ```tsx
      const { messages, input, handleInputChange, handleSubmit, isLoading } =
        useChat({
          api: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat`,
        });
      ```

   7. Set ready status when pipeline has loaded

      ```tsx
      const isReady = !!generateEmbedding;
      ```

   8. Connect `input` and `handleInputChange`

      ```tsx
      <Input
        type="text"
        autoFocus
        placeholder="Send a message"
        value={input}
        onChange={handleInputChange}
      />
      ```

   9. Generate an embedding and send messages on form submit

      ```tsx
      if (!generateEmbedding) {
        throw new Error('Unable to generate embeddings');
      }

      const output = await generateEmbedding(input, {
        pooling: 'mean',
        normalize: true,
      });

      const embedding = JSON.stringify(Array.from(output.data));

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        return;
      }

      handleSubmit(e, {
        options: {
          headers: {
            authorization: `Bearer ${session.access_token}`,
          },
          body: {
            embedding,
          },
        },
      });
      ```

   10. Disable send button if not ready

       ```tsx
       <Button type="submit" disabled={!isReady}>
         Send
       </Button>
       ```

2. Migration

   1. Create migration file for match function

      ```bash
      npx supabase migration new match
      ```

   2. Create match function

      ```sql
      create or replace function match_document_sections(
        embedding vector(384),
        match_threshold float
      )
      returns setof document_sections
      language plpgsql
      as $$
      #variable_conflict use_variable
      begin
        return query
        select *
        from document_sections
        where document_sections.embedding <#> embedding < -match_threshold
      	order by document_sections.embedding <#> embedding;
      end;
      $$;
      ```

   3. Run the migration

      ```bash
      npx supabase migration up
      ```

3. Create edge function for `/chat`

   1. Generate an API key from [OpenAI](https://platform.openai.com/account/api-keys) and save in `supabase/functions/.env`

      ```bash
      cat > supabase/functions/.env <<- EOF
      OPENAI_API_KEY=<your-api-key>
      EOF
      ```

   2. Create edge function file

      ```bash
      npx supabase functions new chat
      ```

   3. Load OpenAI and Supabase keys

      ```tsx
      import { createClient } from '@supabase/supabase-js';
      import { OpenAIStream, StreamingTextResponse } from 'ai';
      import { codeBlock } from 'common-tags';
      import OpenAI from 'openai';

      const openai = new OpenAI({
        apiKey: Deno.env.get('OPENAI_API_KEY'),
      });

      // These are automatically injected
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      ```

   4. Handle CORS

      ```tsx
      export const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type',
      };

      Deno.serve(async (req) => {
        // Handle CORS
        if (req.method === 'OPTIONS') {
          return new Response('ok', { headers: corsHeaders });
        }
      });
      ```

   5. Check for environment variables and create Supabase clients

      ```tsx
      if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
        return new Response(
          JSON.stringify({
            error: 'Missing environment variables.',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const authorization = req.headers.get('Authorization');

      if (!authorization) {
        return new Response(
          JSON.stringify({ error: `No authorization header passed` }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            authorization,
          },
        },
        auth: {
          persistSession: false,
        },
      });
      ```

   6. Perform similarity search for RAG

      ```tsx
      const { chatId, message, messages, embedding } = await req.json();

      const { data: documents, error: matchError } = await supabase
        .rpc('match_document_sections', {
          embedding,
          match_threshold: 0.8,
        })
        .select('content')
        .limit(5);

      if (matchError) {
        console.error(matchError);

        return new Response(
          JSON.stringify({
            error:
              'There was an error reading your documents, please try again.',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      ```

   7. Build our prompt

      ```tsx
      const injectedDocs =
        documents && documents.length > 0
          ? documents.map(({ content }) => content).join('\n\n')
          : 'No documents found';

      const completionMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        [
          {
            role: 'user',
            content: codeBlock`
                You're an AI assistant who answers questions about documents.
      
                You're a chat bot, so keep your replies succinct.
      
                You're only allowed to use the documents below to answer the question.
      
                If the question isn't related to these documents, say:
                "Sorry, I couldn't find any information on that."
      
                If the information isn't available in the below documents, say:
                "Sorry, I couldn't find any information on that."
      
                Do not go off topic.
      
                Documents:
                ${injectedDocs}
              `,
          },
          ...messages,
        ];
      ```

   8. Create completion stream and return it

      ```tsx
      const completionStream = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo-0613',
        messages: completionMessages,
        max_tokens: 1024,
        temperature: 0,
        stream: true,
      });

      const stream = OpenAIStream(completionStream);
      return new StreamingTextResponse(stream, { headers: corsHeaders });
      ```

---

### `Step 5` - Database Types (Bonus)

```shell
git stash push -u -m "my work on step-4"
git checkout step-5
```

1. Generate TypeScript types based on DB schema

   ```bash
   supabase gen types typescript --local > supabase/functions/_lib/database.ts
   ```

2. Add `<Database>` generic to all Supabase clients

   1. In React

      ```tsx
      import { Database } from '@/supabase/functions/_lib/database';

      const supabase = createClientComponentClient<Database>();
      ```

      ```tsx
      import { Database } from '@/supabase/functions/_lib/database';

      const supabase = createServerComponentClient<Database>();
      ```

   2. In edge functions

      ```tsx
      import { Database } from '../_lib/database.ts';

      const supabase = createClient<Database>(...);
      ```

3. Fix type errors 😃

   1. In `files/page.tsx`, add to top of document click handler

      ```tsx
      if (!document.storage_object_path) {
        toast({
          variant: 'destructive',
          description: 'Failed to download file, please try again.',
        });
        return;
      }
      ```

## Feedback and issues

Please file feedback and issues on the [on this repo's issue board](https://github.com/supabase-community/chatgpt-your-files/issues/new/choose).

## Supabase Vector resources

- [Supabase AI & Vector](https://supabase.com/docs/guides/ai)
- [pgvector Columns](https://supabase.com/docs/guides/ai/vector-columns)
- [pgvector Indexes](https://supabase.com/docs/guides/ai/vector-indexes)
- [Generate Embeddings using Edge Functions](https://supabase.com/docs/guides/ai/quickstarts/generate-text-embeddings)
- [Going to Production](https://supabase.com/docs/guides/ai/going-to-prod)
