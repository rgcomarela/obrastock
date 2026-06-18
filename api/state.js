const https = require("https");

const SUPABASE_HOST = "fidukaqmeuldhlrqsssp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__2O4h6CfFjv4rELWKbiF8w_bp7nfbSd";
const SUPABASE_STATE_ID = "main";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON invalido"));
      }
    });
    req.on("error", reject);
  });
}

function supabase(path, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const request = https.request({
      hostname: SUPABASE_HOST,
      path: `/rest/v1/${path}`,
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(data || response.statusMessage);
          error.status = response.statusCode;
          reject(error);
          return;
        }
        resolve(data ? JSON.parse(data) : null);
      });
    });
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET") {
      const rows = await supabase(`obrastock_state?id=eq.${SUPABASE_STATE_ID}&select=data`);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(rows));
      return;
    }

    const body = await readBody(req);

    if (req.method === "POST") {
      const rows = await supabase("obrastock_state", { method: "POST", body });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(rows));
      return;
    }

    if (req.method === "PATCH") {
      const rows = await supabase(`obrastock_state?id=eq.${SUPABASE_STATE_ID}`, { method: "PATCH", body });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(rows));
      return;
    }

    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Metodo nao permitido" }));
  } catch (error) {
    res.statusCode = error.status || 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message || "Erro ao acessar banco online" }));
  }
};
