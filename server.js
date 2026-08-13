import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const sessions = new Map();

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL;

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

async function dbReady() {
  if (!sql) throw new Error("Base Neon/Postgres non configurée.");
  await sql`
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      match TEXT NOT NULL,
      league TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      time TEXT NOT NULL DEFAULT '',
      pick TEXT NOT NULL,
      odds TEXT NOT NULL DEFAULT '',
      analysis TEXT NOT NULL DEFAULT '',
      published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token && sessions.has(token)) return next();
  res.status(401).json({ error: "Non autorisé" });
}

function safeUser() {
  return process.env.ADMIN_USER || "admin";
}

function safePass() {
  return process.env.ADMIN_PASSWORD || "change-me";
}

function mapPrediction(row) {
  return {
    id: row.id,
    match: row.match,
    league: row.league,
    date: row.date,
    time: row.time,
    pick: row.pick,
    odds: row.odds,
    analysis: row.analysis,
    published: row.published,
    createdAt: row.created_at
  };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === safeUser() && password === safePass()) {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { created: Date.now() });
    return res.json({ token });
  }
  res.status(401).json({ error: "Identifiants incorrects" });
});

app.get("/api/predictions", async (req, res) => {
  try {
    await dbReady();
    const rows = await sql`
      SELECT id, match, league, date, time, pick, odds, analysis, published, created_at
      FROM predictions
      WHERE published = TRUE
      ORDER BY created_at DESC
    `;
    res.json(rows.map(mapPrediction));
  } catch (e) {
    console.error("GET /api/predictions:", e);
    res.status(500).json({ error: "Impossible de charger les pronostics." });
  }
});

app.post("/api/predictions", auth, async (req, res) => {
  const { match, league, date, time, pick, odds, analysis } = req.body || {};
  if (!match || !pick) {
    return res.status(400).json({ error: "Match et pronostic obligatoires" });
  }

  try {
    await dbReady();
    const id = crypto.randomUUID();

    const rows = await sql`
      INSERT INTO predictions
        (id, match, league, date, time, pick, odds, analysis, published)
      VALUES
        (${id}, ${match}, ${league || ""}, ${date || ""}, ${time || ""},
         ${pick}, ${odds || ""}, ${analysis || ""}, TRUE)
      RETURNING id, match, league, date, time, pick, odds, analysis, published, created_at
    `;

    res.json(mapPrediction(rows[0]));
  } catch (e) {
    console.error("POST /api/predictions:", e);
    res.status(500).json({ error: "Impossible d'enregistrer le pronostic." });
  }
});

app.delete("/api/predictions/:id", auth, async (req, res) => {
  try {
    await dbReady();
    await sql`DELETE FROM predictions WHERE id = ${req.params.id}`;
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/predictions:", e);
    res.status(500).json({ error: "Impossible de supprimer le pronostic." });
  }
});

app.post("/api/create-payment", async (req, res) => {
  const price = Number(process.env.PRICE_XOF || 500);

  if (!process.env.WAVE_API_KEY) {
    return res.status(503).json({
      error: "Wave n'est pas encore configuré.",
      setup: "Ajoutez WAVE_API_KEY dans les variables d'environnement du serveur."
    });
  }

  try {
    const response = await fetch("https://api.wave.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.WAVE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: String(price),
        currency: "XOF",
        error_url: process.env.WAVE_ERROR_URL,
        success_url: process.env.WAVE_SUCCESS_URL
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    res.json({
      url: data.wave_launch_url || data.checkout_url || data.url,
      session: data
    });
  } catch (e) {
    console.error("POST /api/create-payment:", e);
    res.status(500).json({ error: "Erreur de connexion à Wave" });
  }
});

app.get("/api/config", (req, res) => {
  res.json({
    siteName: process.env.SITE_NAME || "FootPredict CI",
    price: Number(process.env.PRICE_XOF || 500)
  });
});

app.get("/admin", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html"))
);

app.listen(PORT, () => {
  console.log(`FootPredict CI: http://localhost:${PORT}`);
});
