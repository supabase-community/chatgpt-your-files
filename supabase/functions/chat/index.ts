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

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
  console.log("connected");
  const { messages } = await req.json();
  console.log({ messages, model });
  const msg = messages[messages.length - 1].content;
  const output = (await model.run(msg, {
    mean_pool: true,
    normalize: true,
  })) as number[];

  const embedding = JSON.stringify(output);

  console.log({ msg, model, embedding });

  const { data: documents, error: matchError } = await supabase
    .rpc("match_document_sections", {
      embedding,
      match_threshold: 0.9,
    })
    .select("lot_id, name")
    .limit(5);

  const { data: documents_name_desc, error: matchError_name_desc } =
    await supabase
      .rpc("match_document_sections_name_description", {
        embedding,
        match_threshold: 0.8,
      })
      .select("lot_id, name")
      .limit(5);

  const { data: documents_name, error: matchError_name } = await supabase
    .rpc("match_document_sections_name", {
      embedding,
      match_threshold: 0.8,
    })
    .select("lot_id, name")
    .limit(5);

  if (matchError || matchError_name_desc || matchError_name) {
    console.error(matchError, matchError_name_desc, matchError_name);

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

  console.log({ documents_name, documents, documents_name_desc });

  return new Response(
    JSON.stringify({ documents_name, documents, documents_name_desc }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
