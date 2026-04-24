const BASE  = "app1gWDHklIHiq6yu";
const TABLE = "tblMkZoY6s1QiEBZP";
const VIEW  = "viw80PS0lRjDKUT5q"; // TAD SOCIAL (Christian)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  let allRecords = [];
  let offset = null;

  try {
    do {
      const params = new URLSearchParams();
      params.set("view", VIEW);
      params.set("returnFieldsByFieldId", "true");
      params.set("pageSize", "100");
      params.set("sort[0][field]", "fldYOYoazpSSb1xKr"); // Start Date asc
      params.set("sort[0][direction]", "asc");
      if (offset) params.set("offset", offset);

      const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?${params.toString()}`;

      const airtableRes = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      });

      if (!airtableRes.ok) {
        const body = await airtableRes.text();
        console.error("Airtable error body:", body);
        throw new Error(`Airtable API error: ${airtableRes.status}`);
      }

      const data = await airtableRes.json();
      if (data.records) allRecords = allRecords.concat(data.records);
      offset = data.offset;

    } while (offset);

    return res.status(200).json({ records: allRecords });

  } catch (error) {
    console.error("Fetch error:", error);
    return res.status(500).json({ error: error.message, records: [] });
  }
}
