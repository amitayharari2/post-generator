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

    // אם יש לינק - קרא את הכתבה דרך Jina Reader
    if (isNews && link) {
      try {
        const jinaUrl = `https://r.jina.ai/${link}`;
        const articleRes = await fetch(jinaUrl, {
          headers: { 
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'text/plain'
          },
          signal: AbortSignal.timeout(10000)
        });
        const text = await articleRes.text();
        articleContent = text.slice(0, 4000);
      } catch (e) {
        // אם לא הצלחנו - ממשיך בלי
      }
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

    return res.status(200).json({ post });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
