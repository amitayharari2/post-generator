export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing API key' });

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 800,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for today's (${today}) top 5 most relevant financial and crypto news. Find 5 DIFFERENT topics. Return the topics in Hebrew. Return JSON only: {"topics": ["נושא 1", "נושא 2", "נושא 3", "נושא 4", "נושא 5"]}`
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message, topics: ['חדשות שוק ההון היום'] });
    }
    const text = data.content.map(i => i.text || '').filter(Boolean).join('');
    if (!text) {
      return res.status(200).json({ topics: ['חדשות שוק ההון היום'], debug: 'no text in response' });
    }
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message, topics: ['חדשות שוק ההון היום'] });
  }
}
