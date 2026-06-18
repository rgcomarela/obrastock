export const config = {
  runtime: "edge"
};

const SUPABASE_URL = "https://fidukaqmeuldhlrqsssp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__2O4h6CfFjv4rELWKbiF8w_bp7nfbSd";
const SUPABASE_STATE_ID = "main";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || response.statusText);
  }
  return text ? JSON.parse(text) : null;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  try {
    if (request.method === "GET") {
      const rows = await supabase(`obrastock_state?id=eq.${SUPABASE_STATE_ID}&select=data`);
      return Response.json(rows, { headers: jsonHeaders });
    }

    const body = await request.json();

    if (request.method === "POST") {
      const rows = await supabase("obrastock_state", {
        method: "POST",
        body: JSON.stringify(body)
      });
      return Response.json(rows, { headers: jsonHeaders });
    }

    if (request.method === "PATCH") {
      const rows = await supabase(`obrastock_state?id=eq.${SUPABASE_STATE_ID}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      return Response.json(rows, { headers: jsonHeaders });
    }

    return Response.json({ error: "Metodo nao permitido" }, { status: 405, headers: jsonHeaders });
  } catch (error) {
    return Response.json({ error: error.message || "Erro ao acessar banco online" }, { status: 500, headers: jsonHeaders });
  }
}
