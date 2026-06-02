export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic, link, learnedStyle, isNews } = req.body;

  const systemPrompt = `אתה כותב פוסטים פיננסיים בעברית.

כללים:
- כתוב בדיוק על הנושא שניתן - לא על שום דבר אחר
- התחל ישירות עם הפוסט - ללא כותרת
- כוכבית אחת להדגשה: *ככה*
- מקף קצר (-)
- 200-350 מילים
- אל תמליץ ישירות על מוצרים פיננסיים
- כתוב רק בעברית - אסור אנגלית בפוסט

מבנה:
1. משפט פתיחה מפתיע או שאלה שמכאיבה
2. הסבר שגורם לקורא להגיד "זה אני"
3. הסיכון האמיתי
4. הפתרון - גרום לקורא להבין לבד
5. שורת סיום עמוקה

סיים עם:
אין לראות בכתוב המלצה לפעולה
[CTA]

${learnedStyle ? 'למד מהסגנון הזה:\n' + learnedStyle : ''}`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing API key' });

    let articleContent = '';

    // אם יש לינק - קרא כתבה דרך Bright Data Web Unlocker
    if (isNews && link) {
      try {
        const bdKey = process.env.BRIGHT_DATA_API_KEY;
        if (bdKey) {
          const articleRes = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${bdKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              zone: 'web_unlocker1',
              url: link,
              format: 'raw'
            }),
            signal: AbortSignal.timeout(20000)
          });
          if (articleRes.ok) {
            const html = await articleRes.text();
            if (html && html.length > 200) {
              const text = html
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              articleContent = text.slice(0, 5000);
            }
          }
        }
      } catch (e) {}
    }

    const userMessage = isNews && articleContent
      ? `כתוב פוסט בעברית בלבד על הנושא הבא. השתמש בתוכן הכתבה לקבלת עובדות מדויקות. כתוב רק את הפוסט עצמו.\n\nנושא: ${topic}\n\nתוכן הכתבה:\n${articleContent}`
      : `נושא: ${topic}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || JSON.stringify(data) });

    let post = data.content[0].text;

    const investmentKeywords = ['מדד', 'קרן סל', 'להשקיע', 'ביטקוין', 'נדלן', 'ריבית', 'S&P', 'תל אביב', 'IPO', 'מניה', 'תיק', 'זהב', 'שוק'];
    const isInvestment = investmentKeywords.some(t => topic.includes(t) || post.includes(t));

    const cta = isInvestment
      ? '*להטבות הצטרפות לפתיחת חשבון מסחר 👇*\nhttps://bonimhon.co.il/ההטבות-שלנו/'
      : '*הצטרפו לקבלת עוד תוכן כזה 👇*\nhttps://chat.whatsapp.com/KRq5OeeQxZb0vfcjdTUEaF';

    post = post.replace('[CTA]', cta);

    return res.status(200).json({ post, articleLength: articleContent.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
