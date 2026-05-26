export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Missing Supabase config' });

  try {
    const supabaseBase = supabaseUrl.replace('/rest/v1/', '').replace(/\/$/, '');
    const response = await fetch(`${supabaseBase}/rest/v1/learned_posts?order=created_at.desc&limit=15`, {
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
