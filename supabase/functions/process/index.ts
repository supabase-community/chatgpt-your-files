import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { Database } from "../_lib/database.ts";
import { processMarkdown } from "../_lib/markdown-parser.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(async (req) => {
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

  const { document_id } = await req.json();

  const { data: document } = await supabase
    .from("documents_with_storage_path")
    .select()
    .eq("id", document_id)
    .single();

  if (!document?.storage_object_path) {
    return new Response(
      JSON.stringify({ error: "Failed to find uploaded document" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { data: file } = await supabase.storage
    .from("files")
    .download(document.storage_object_path);

  if (!file) {
    return new Response(
      JSON.stringify({ error: "Failed to download storage object" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const fileContents = await file.text();
  const processedCSV = Papa.parse(fileContents, {
    header: true,
    dynamicTyping: true,
    transformHeader: (header: string) => header.toLowerCase(),
  });
  type LOT_CSV_ROW = {
    id: string;
    document_id: number;
    name: string;
    description: string;
    level: number;
    occupation_group: number;
    occupation_group_name: string;
    occupation_group_description: string;
    career_area: number;
    career_area_name: string;
    career_area_description: string;
    requirement_level: number;
    requirement_level_description: string;
    license_typically_required: boolean;
    certification_typically_required: boolean;
    requires_specialized_training: boolean;
    specialized_training_description: boolean;
    name_ca: string;
    name_gb: string;
    version: string;
    embedding: null;
    embedding_name_description: null;
  };
  const { error } = await supabase.from("document_sections").insert(
    processedCSV.map((row: LOT_CSV_ROW) => ({
      document_id,
      id: row.id,
      content: Object.values(row).join("\n"),
      content_name_description: row.name + row.description,
      name: row.name,
      description: row.description,
      level: row.level,
      occupation_group: row.occupation_group,
      occupation_group_name: row.occupation_group_name,
      occupation_group_description: row.occupation_group_description,
      career_area: row.career_area,
      career_area_name: row.career_area_name,
      career_area_description: row.career_area_description,
      requirement_level: row.requirement_level,
      requirement_level_description: row.requirement_level_description,
      license_typically_required: row.license_typically_required,
      certification_typically_required: row.certification_typically_required,
      requires_specialized_training: row.requires_specialized_training,
      specialized_training_description: row.specialized_training_description,
      name_ca: row.name_ca,
      name_gb: row.name_gb,
      version: row.version,
    })),
  );

  if (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: "Failed to save document rows" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  console.log(`Saved ${processedCSV.length} rows for file '${document.name}'`);

  return new Response(null, {
    status: 204,
    headers: { "Content-Type": "application/json" },
  });
});
