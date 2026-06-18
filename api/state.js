const SUPABASE_URL = "https://fidukaqmeuldhlrqsssp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__2O4h6CfFjv4rELWKbiF8w_bp7nfbSd";
const SUPABASE_STATE_ID = "main";

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
    const error = new Error(text || response.statusText);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const rows = await supabase(`obrastock_state?id=eq.${SUPABASE_STATE_ID}&select=data`);
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const rows = await supabase("obrastock_state", {
        method: "POST",
        body: JSON.stringify(req.body)
      });
      return res.status(200).json(rows);
    }

    if (req.method === "PATCH") {
      const rows = await supabase(`obrastock_state?id=eq.${SUPABASE_STATE_ID}`, {
        method: "PATCH",
        body: JSON.stringify(req.body)
      });
      return res.status(200).json(rows);
    }

    return res.status(405).json({ error: "Metodo nao permitido" });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Erro ao acessar banco online" });
  }
}
