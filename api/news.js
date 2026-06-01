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
        
        // חלץ כותרות מה-RSS
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && items.length < 2) {
          const item = match[1];
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                            item.match(/<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/) ||
                           item.match(/<link href="(.*?)"/);
          const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
          
          if (titleMatch) {
            items.push({
              title: titleMatch[1].trim(),
              link: linkMatch ? linkMatch[1].trim() : '',
              pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
              source: feed.name
            });
          }
        }
        return items;
      })
    );

    // איסוף כל הכותרות
    const allItems = [];
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    });

    if (allItems.length === 0) {
      return res.status(200).json({ topics: [{ title: 'חדשות שוק ההון היום', source: '', link: '' }] });
    }

    const top5 = allItems.slice(0, 5);

    // תרגם כותרות אנגליות לעברית
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const englishTitles = top5.filter(i => /[a-zA-Z]/.test(i.title));
        if (englishTitles.length > 0) {
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
                content: `תרגם את הכותרות הבאות לעברית. החזר JSON בלבד: {"translations": ["כותרת 1", "כותרת 2", ...]}

${englishTitles.map((i,n) => `${n+1}. ${i.title}`).join('
')}`
              }]
            })
          });
          const tData = await translateRes.json();
          const tText = tData.content[0].text.replace(/```json|```/g, '').trim();
          const tParsed = JSON.parse(tText);
          let tIndex = 0;
          top5.forEach(item => {
            if (/[a-zA-Z]/.test(item.title)) {
              item.title = tParsed.translations[tIndex++] || item.title;
            }
          });
        }
      } catch(e) {}
    }

    const topics = top5.map(item => ({
      title: item.title,
      source: item.source,
      link: item.link
    }));

    return res.status(200).json({ topics });
  } catch (error) {
    return res.status(200).json({ topics: [{ title: 'חדשות שוק ההון היום', source: '', link: '' }] });
  }
}
