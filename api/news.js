export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RSS_FEEDS = [
    { name: 'גלובס', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.aspx?iID=585' },
    { name: 'ביזפורטל', url: 'https://www.bizportal.co.il/rss/capital_market' },
    { name: 'כלכליסט', url: 'https://www.calcalist.co.il/rss/AjaxPage,7340,L-rssFeeder,00.xml' },
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
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

    // תרגם כותרות אנגליות
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const englishItems = top5.filter(i => /[a-zA-Z]{4,}/.test(i.title));
    
    if (apiKey && englishItems.length > 0) {
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
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `תרגם לעברית בלבד. החזר JSON: {"t":["תרגום1","תרגום2",...]}\n${englishItems.map((i,n) => `${n+1}. ${i.title}`).join('\n')}`
            }]
          })
        });
        const tData = await translateRes.json();
        const tText = tData.content[0].text.replace(/```json|```/g, '').trim();
        const tParsed = JSON.parse(tText);
        let idx = 0;
        top5.forEach(item => {
          if (/[a-zA-Z]{4,}/.test(item.title)) {
            item.title = tParsed.t[idx++] || item.title;
          }
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
