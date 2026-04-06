const BASE  = "app1gWDHklIHiq6yu";
const TABLE = "tblU0C9ueSixKn7Cv";

const F_COPY         = "fld7Z2psB9gGg51kh";
const F_STATUS       = "fldZXdXPuF2EkrmWY";
const F_TYPE         = "fld0xOuuoV9eCDAga";
const F_PLATFORMS    = "fldJyU1eS53pRyMwX";
const F_DUE          = "fld3nskHsRUiyrLI5";
const F_ARTIST_PHOTO = "fldB5GD09PckzbfpS";
const F_KEY_ART      = "fldNqudSaYc5rAetC";
const F_VENUE_PHOTO  = "fldjCIFCybkLdJKhq";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")    return res.status(405).json({ error: "Method not allowed" });

  const params = new URLSearchParams();

  // Request specific field IDs
  [F_COPY, F_STATUS, F_TYPE, F_PLATFORMS, F_DUE,
   F_ARTIST_PHOTO, F_KEY_ART, F_VENUE_PHOTO]
    .forEach(f => params.append("fields[]", f));

  // Sort by due date ascending
  params.set("sort[0][field]",     F_DUE);
  params.set("sort[0][direction]", "asc");
  params.set("maxRecords",         "200");

  // Return fields by their ID so App.jsx can look them up reliably
  params.set("returnFieldsByFieldId", "true");

  // No filter — return everything so we can see what's there
  // (add back later once confirmed working: NOT({fld7Z2psB9gGg51kh}=''))

  try {
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?${params.toString()}`;
    const airtableRes = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });

    const data = await airtableRes.json();

    if (!airtableRes.ok) {
      console.error("Airtable error:", data);
      return res.status(airtableRes.status).json(data);
    }

    // Pass raw Airtable records straight through — App.jsx handles mapping
    return res.status(200).json({ records: data.records || [] });

  } catch (e) {
    console.error("Handler error:", e);
    return res.status(500).json({ error: e.message });
  }
}
