export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RSS_FEEDS = [
    { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/businessNews', limit: 4 },
    { name: 'Investing.com', url: 'https://www.investing.com/rss/news.rss', limit: 4 },
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', limit: 2 },
    { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss', limit: 2 },
    { name: 'גלובס - שוק ההון', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=585', limit: 4 },
    { name: 'גלובס - גלובלי', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=1225', limit: 4 },
    { name: 'גלובס', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2', limit: 3 },
    { name: 'דה מרקר', url: 'https://www.themarker.com/srv/rss', limit: 3 },
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
        while ((match = itemRegex.exec(xml)) !== null && items.length < (feed.limit || 2)) {
          const item = match[1];
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                            item.match(/<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/) ||
                           item.match(/<link href="(.*?)"/);
          if (titleMatch) {
            let link = linkMatch ? linkMatch[1].trim() : '';
            // נקה CDATA
            link = link.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
            items.push({
              title: titleMatch[1].trim(),
              link: link,
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

    // קח פול של עד 25 כותרות, ובקש מ-Claude לבחור את 10 המאקרו ולתרגם
    const candidates = allItems.slice(0, 25);
    let finalTopics = null;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && candidates.length > 0) {
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
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: `מהרשימה הבאה של כותרות חדשות פיננסיות, בחר את 10 הכותרות הכי מאקרו / רחבות.

עדיפות גבוהה (מאקרו):
- ריבית, אינפלציה, נתונים מאקרו-כלכליים
- מדדי שוק (S&P 500, נאסד"ק, ת"א 35, דאו, FTSE)
- בנקים מרכזיים (פד, בנק ישראל, ECB)
- גיאופוליטיקה ומדיניות שמשפיעות על השוק
- מטבעות, דולר, שקל, ביטקוין כתופעה רחבה
- סחורות (נפט, זהב)
- רגולציה רחבה, מסים, חקיקה כלכלית
- מגמות שוק כלליות, סקטורים, תעשיות

עדיפות נמוכה (מיקרו - הימנע):
- חברה ספציפית אחת (אלא אם זו ענקית שמזיזה את כל השוק כמו אנבידיה/אפל בהקשר מאקרו)
- יעדי מחיר לאנליסטים על מניה אחת
- רכישות פרטיות, דוחות רבעוניים של חברה בודדת
- חדשות לא-פיננסיות (תרבות, ספורט, פוליטיקה לא-כלכלית)

החזר JSON בלבד בפורמט הזה בדיוק, ללא טקסט נוסף:
{"selected":[{"i":3,"t":"כותרת בעברית"},{"i":7,"t":"כותרת בעברית"}, ...]}

i = מספר הכותרת ברשימה למטה. t = הכותרת בעברית (אם המקור עברי - העתק כמו שהוא; אם אנגלית - תרגם לעברית קצרה וברורה).

הכותרות:
${candidates.map((it,n) => `${n+1}. [${it.source}] ${it.title}`).join('\n')}`
            }]
          })
        });
        if (translateRes.ok) {
          const tData = await translateRes.json();
          const rawText = tData.content && tData.content[0] && tData.content[0].text ? tData.content[0].text : '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const tParsed = JSON.parse(jsonMatch[0]);
            if (tParsed.selected && Array.isArray(tParsed.selected)) {
              const built = [];
              for (const sel of tParsed.selected) {
                if (sel && typeof sel.i === 'number' && sel.i >= 1 && sel.i <= candidates.length) {
                  const orig = candidates[sel.i - 1];
                  built.push({
                    title: typeof sel.t === 'string' && sel.t.length > 0 ? sel.t : orig.title,
                    source: orig.source,
                    link: orig.link
                  });
                }
              }
              if (built.length > 0) finalTopics = built;
            }
          }
        } else {
          console.error('Filter/translate API failed:', translateRes.status);
        }
      } catch(e) {
        console.error('Filter/translate error:', e.message);
      }
    }

    // fallback: אם הסינון נכשל, החזר את 10 הראשונים כמו שהם
    if (!finalTopics) {
      finalTopics = candidates.slice(0, 10).map(i => ({ title: i.title, source: i.source, link: i.link }));
    }

    return res.status(200).json({ topics: finalTopics });
  } catch (error) {
    return res.status(200).json({ topics: [{ title: 'חדשות שוק ההון היום', source: '', link: '' }] });
  }
}
