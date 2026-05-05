import https from 'https';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '.env'), 'utf8');
envFile.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

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
    const miniMaxMessages = messages.map(msg => ({
      ...msg,
      sender_name: msg.role === 'user' ? 'user' : 'assistant',
      sender_type: msg.role === 'user' ? 'USER' : 'BOT'
    }));
    const body = JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: miniMaxMessages,
      temperature: 0.3,
      max_tokens: 800,
      bot_setting: [{
        bot_name: 'assistant',
        content: 'You are a helpful assistant.'
      }],
      reply_constraints: {
        return_format: 1,
        sender_type: 'BOT',
        sender_name: 'assistant'
      }
    });

    const options = {
      hostname: MINIMAX_API_URL,
      path: `/v1/chat/completions?GroupId=${GROUP_ID}`,
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
            console.error('MiniMax API response:', JSON.stringify(parsed).substring(0, 500));
            reject(new Error('Invalid response format'));
          }
        } catch (e) {
          console.error('MiniMax response parse error, raw:', data.substring(0, 500));
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

    let cleaned = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned);

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