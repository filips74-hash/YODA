export default async function handler(req, res) {
  // Allow viewing directly in the browser
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const BASE = "app1gWDHklIHiq6yu";
  const TABLE = "tblU0C9ueSixKn7Cv";

  try {
    // We'll just pull a max of 3 records to keep the payload readable
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?maxRecords=3`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });
    
    const data = await response.json();

    // Return the HTTP status, a check to confirm the key is present in the env, and the raw data
    res.status(response.status).json({
      http_status: response.status,
      has_api_key: !!process.env.AIRTABLE_API_KEY,
      raw_airtable_data: data
    });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}