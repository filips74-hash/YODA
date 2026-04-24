const BASE       = "app1gWDHklIHiq6yu";
const POSTS_TBL  = "tblU0C9ueSixKn7Cv";

const FIELD_MAP = {
  status:  "fldZXdXPuF2EkrmWY", // Status
  content: "fld7Z2psB9gGg51kh", // Post Copy
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  const { recordId, field, value } = req.body || {};

  if (!recordId || !field || value === undefined) {
    return res.status(400).json({ error: "Missing recordId, field, or value" });
  }

  const fieldId = FIELD_MAP[field];
  if (!fieldId) {
    return res.status(400).json({ error: `Unknown field: ${field}. Use 'status' or 'content'.` });
  }

  try {
    const url = `https://api.airtable.com/v0/${BASE}/${POSTS_TBL}/${recordId}`;
    const airtableRes = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: { [fieldId]: value }, typecast: true }),
    });

    if (!airtableRes.ok) {
      const errText = await airtableRes.text();
      throw new Error(`Airtable ${airtableRes.status}: ${errText}`);
    }

    const updated = await airtableRes.json();
    return res.status(200).json({ success: true, record: updated });
  } catch (err) {
    console.error("update-post.js error:", err);
    return res.status(500).json({ error: err.message });
  }
}