export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RSS_FEEDS = [
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
    { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/businessNews' },
    { name: 'CNBC', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
    { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  ];

  try {
    const results = await Promise.allSettled(
      RSS_FEEDS.map(async (feed) => {
        const response = await fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000)
        });
        const xml = await response.text();
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && items.length < 2) {
          const item = match[1];
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                            item.match(/<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/) ||
                           item.match(/<link href="(.*?)"/);
          if (titleMatch) {
            items.push({
              title: titleMatch[1].trim(),
              link: linkMatch ? linkMatch[1].trim() : '',
              source: feed.name
            });
          }
        }
        return items;
      })
    );

    const allItems = [];
    results.forEach(result => {
      if (result.status === 'fulfilled') allItems.push(...result.value);
    });

    if (allItems.length === 0) {
      return res.status(200).json({ topics: [{ title: 'חדשות שוק ההון היום', source: '', link: '' }] });
    }

    const top5 = allItems.slice(0, 5);

    // תרגם את כל הכותרות לעברית
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const translateRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `תרגם את הכותרות הבאות לעברית קצרה וברורה. החזר JSON בלבד ללא הסברים: {"t":["תרגום1","תרגום2","תרגום3","תרגום4","תרגום5"]}\n${top5.map((i,n) => `${n+1}. ${i.title}`).join('\n')}`
            }]
          })
        });
        const tData = await translateRes.json();
        const tText = tData.content[0].text.replace(/```json|```/g, '').trim();
        const tParsed = JSON.parse(tText);
        top5.forEach((item, idx) => {
          if (tParsed.t[idx]) item.title = tParsed.t[idx];
        });
      } catch(e) {}
    }

    return res.status(200).json({ 
      topics: top5.map(i => ({ title: i.title, source: i.source, link: i.link }))
    });
  } catch (error) {
    return res.status(200).json({ topics: [{ title: 'חדשות שוק ההון היום', source: '', link: '' }] });
  }
}
