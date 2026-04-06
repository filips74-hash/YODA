const BASE    = "app1gWDHklIHiq6yu";
const TABLE   = "tblU0C9ueSixKn7Cv";

// Due date field ID for sorting
const F_DUE = "fld3nskHsRUiyrLI5";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const params = new URLSearchParams();
  params.set("sort[0][field]", F_DUE);
  params.set("sort[0][direction]", "asc");
  params.set("maxRecords", "100");

  try {
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });
    
    // Parse the raw Airtable response
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Send the raw Airtable data straight to App.jsx unchanged
    res.status(200).json(data);
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
