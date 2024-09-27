import { createClient } from "@supabase/supabase-js";
import { Database } from "../_lib/database.ts";

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

  if (!authorization) {
    return new Response(
      JSON.stringify({ error: `No authorization header passed` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        authorization,
      },
    },
    auth: {
      persistSession: false,
    },
  });

  const { messages, embedding } = await req.json();

  const { data: documents, error: matchError } = await supabase
    .rpc("match_document_sections", {
      embedding,
      match_threshold: 0.8,
    })
    .select("content")
    .limit(5);

  const { data: documents_name_desc, error: matchError_name_desc } = await supabase
    .rpc("match_document_sections_name_description", {
      embedding,
      match_threshold: 0.8,
    })
    .select("content_name_description")
    .limit(5);
  `
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

  const resultDocs =
    documents && documents.length > 0
      ? documents.map(({ content }) => content).join("\n\n")
      : "No documents found";
  
  const resultDocs_name_desc =
    documents_name_desc && documents_name_desc.length > 0
      ? documents_name_desc.map(({ content_name_description }) => content_name_description).join("\n\n")
      : "No documents found";

  console.log({resultDocs, resultDocs_name_desc });

  return new Response(JSON.stringify({resultDocs, resultDocs_name_desc }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
