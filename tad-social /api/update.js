const BASE = "app1gWDHklIHiq6yu";
const TABLE = "tblU0C9ueSixKn7Cv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  const { id, fields } = req.body || {};
  if (!id || !fields) return res.status(400).json({ error: "Missing id or fields" });

  try {
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}/${id}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
