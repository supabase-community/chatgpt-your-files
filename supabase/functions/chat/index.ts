import { createClient } from "@supabase/supabase-js";
import { Database } from "../_lib/database.ts";

const model = new Supabase.ai.Session("gte-small");

// These are automatically injected
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({
        error: "Missing environment variables.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const authorization = req.headers.get("Authorization");

  const headers = authorization ? { authorization } : undefined;

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers,
    },
    auth: {
      persistSession: false,
    },
  });

  const { messages } = await req.json();
  console.log({ messages });
  const output = (await model.run(messages[messages.length - 1], {
    mean_pool: true,
    normalize: true,
  })) as number[];

  const embedding = JSON.stringify(output);

  const { data: documents, error: matchError } = await supabase
    .rpc("match_document_sections", {
      embedding,
      match_threshold: 0.8,
    })
    .limit(5);

  const { data: documents_name_desc, error: matchError_name_desc } =
    await supabase
      .rpc("match_document_sections_name_description", {
        embedding,
        match_threshold: 0.8,
      })
      .limit(5);

  if (matchError || matchError_name_desc) {
    console.error(matchError);

    return new Response(
      JSON.stringify({
        error: "There was an error reading your documents, please try again.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  console.log({ documents, documents_name_desc });

  return new Response(JSON.stringify({ documents, documents_name_desc }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
