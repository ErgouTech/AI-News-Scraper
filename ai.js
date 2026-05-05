import https from 'https';

const MINIMAX_API_URL = 'api.minimax.chat';
const GROUP_ID = process.env.MINIMAX_GROUP_ID || 'your-group-id';
const API_KEY = process.env.MINIMAX_API_KEY || 'your-api-key';

function stripHtml(str) {
  if (!str) return '';
  // Decode HTML entities first
  let s = str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  // Remove all HTML tags: properly closed, self-closing, or unclosed (ending with > or end of string)
  s = s.replace(/<[^>]*(>|$)/g, '');
  return s.trim();
}

function callMiniMax(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'MiniMax-Text-01',
      messages,
      temperature: 0.3,
      max_tokens: 800
    });

    const options = {
      hostname: MINIMAX_API_URL,
      path: `/v1/text/chatcompletion_pro?GroupId=${GROUP_ID}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0]) {
            resolve(parsed.choices[0].message.content);
          } else {
            reject(new Error('Invalid response format'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function summarizeNews(newsItem) {
  const isEnglish = /^[a-zA-Z]/.test(newsItem.title);

  const systemPrompt = `You are a news editor. Summarize the news concisely.
1. If it's English news, provide Chinese summary (keep English original too)
2. Keep the original title as-is (do not modify)
3. Summaries should be concise but can vary in length
4. Return in JSON format:
{"summary_zh": "中文摘要", "summary_en": "English summary if applicable"}`;

  const userPrompt = `Title: ${newsItem.title}
Content: ${newsItem.summary || 'No additional content'}`;

  try {
    const result = await callMiniMax([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const parsed = JSON.parse(result);

    return {
      ...newsItem,
      titleZh: newsItem.title,
      titleEn: isEnglish ? newsItem.title : null,
      summaryZh: stripHtml(parsed.summary_zh) || stripHtml(newsItem.summary) || '',
      summaryEn: parsed.summary_en ? stripHtml(parsed.summary_en) : (isEnglish ? stripHtml(newsItem.summary) : null),
      isEnglish
    };
  } catch (e) {
    console.error('AI summarization failed:', e);
    const strippedSummary = stripHtml(newsItem.summary) || '';
    console.log('Fallback: stripped summary length:', strippedSummary.length, 'has img:', strippedSummary.includes('<img'));
    return {
      ...newsItem,
      titleZh: newsItem.title,
      titleEn: isEnglish ? newsItem.title : null,
      summaryZh: strippedSummary,
      summaryEn: isEnglish ? stripHtml(newsItem.summary) : null,
      isEnglish
    };
  }
}

export async function processNewsBatch(newsList) {
  return Promise.all(newsList.map(news => summarizeNews(news)));
}