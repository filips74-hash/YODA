const BASE  = "app1gWDHklIHiq6yu";
const TABLE = "tblMkZoY6s1QiEBZP"; // SOCIAL MEDIA table

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  const { recordId, fieldId, value } = req.body || {};

  if (!recordId || !fieldId) {
    return res.status(400).json({ error: "recordId and fieldId are required" });
  }

  try {
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`;

    const airtableRes = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: { [fieldId]: value } }),
    });

    if (!airtableRes.ok) {
      const body = await airtableRes.text();
      throw new Error(`Airtable error ${airtableRes.status}: ${body}`);
    }

    const data = await airtableRes.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error("update-show error:", error);
    return res.status(500).json({ error: error.message });
  }
}
