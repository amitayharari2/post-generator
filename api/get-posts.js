export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Missing Supabase config' });

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/learned_posts?order=created_at.desc&limit=5`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    const data = await response.json();
    return res.status(200).json({ posts: data.map(d => d.post) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
