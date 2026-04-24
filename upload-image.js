export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { showId, fieldId, filename, base64, mimeType } = req.body || {};
  if (!showId || !fieldId || !base64) return res.status(400).json({ error: "Missing required fields" });

  const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
  const BASE = "app1gWDHklIHiq6yu";
  const TABLE = "tblMkZoY6s1QiEBZP";

  try {
    // Use Airtable content upload API
    const uploadRes = await fetch(
      `https://content.airtable.com/v0/${BASE}/${showId}/uploadAttachment`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentType: mimeType || "image/jpeg",
          filename: filename || "photo.jpg",
          file: base64,
          fieldId,
        }),
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Upload failed: ${uploadRes.status} - ${errText}`);
    }

    const uploadData = await uploadRes.json();
    return res.status(200).json({ success: true, url: uploadData.url || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
