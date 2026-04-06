const BASE    = "app1gWDHklIHiq6yu";
const TABLE   = "tblU0C9ueSixKn7Cv";

// Existing fields
const F_COPY      = "fld7Z2psB9gGg51kh";
const F_STATUS    = "fldZXdXPuF2EkrmWY";
const F_TYPE      = "fld0xOuuoV9eCDAga";
const F_PLATFORMS = "fldJyU1eS53pRyMwX";
const F_DUE       = "fld3nskHsRUiyrLI5";

// New attachment fields
const F_ARTIST_PHOTO = "fldB5GD09PckzbfpS";
const F_KEY_ART      = "fldNqudSaYc5rAetC";
const F_VENUE_PHOTO  = "fldjCIFCybkLdJKhq";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")    return res.status(405).json({ error: "Method not allowed" });

  // We are requesting the specific field IDs to keep the payload light, 
  // plus standard fields App.jsx looks for manually like "Venue" and "Artist"
  const params = new URLSearchParams();
  const ALL_FIELDS = [
    F_COPY, F_STATUS, F_TYPE, F_PLATFORMS, F_DUE,
    F_ARTIST_PHOTO, F_KEY_ART, F_VENUE_PHOTO,
    "Venue", "Artist Name", "Artist", "Artists"
  ];
  
  ALL_FIELDS.forEach(f => params.append("fields[]", f));
  params.set("sort[0][field]",      F_DUE);
  params.set("sort[0][direction]",  "asc");
  params.set("maxRecords",          "100");
  
  // Note: We removed "returnFieldsByFieldId" so Airtable returns standard field names 
  // alongside IDs, which App.jsx relies on for things like "Venue"

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

    // Send the raw Airtable data straight to App.jsx
    res.status(200).json(data);
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
