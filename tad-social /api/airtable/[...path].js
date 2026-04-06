export default async function handler(req, res) {
  const { method, body, query } = req;
  const { path } = query;

  if (!path) return res.status(400).json({ error: "Missing path" });

  const url = `https://api.airtable.com/v0/${path.join("/")}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      ...(method !== "GET" && body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
