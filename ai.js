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
      max_tokens: 1500,
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
  // Detect English by checking if most of title+summary is ASCII (not just first char)
  const combinedText = (newsItem.title + ' ' + (newsItem.summary || '')).substring(0, 200);
  const asciiCount = (combinedText.match(/[a-zA-Z]/g) || []).length;
  const nonAsciiCount = (combinedText.match(/[^\x00-\x7F]/g) || []).length;
  const isEnglish = asciiCount > 10 && asciiCount > nonAsciiCount;

  const systemPrompt = `You are a news editor. Return ONLY valid JSON, no other text.
1. Keep the original title AS-IS, do NOT translate or modify it
2. If the news content is in English, translate it to Chinese and also keep the English original
3. Return ONLY this JSON structure:
{"summary_zh": "中文摘要", "summary_en": "English original summary if applicable"}`;

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

export async function cleanArticleContent(rawContent, isEnglish) {
  const systemPrompt = `You are a content editor. Return ONLY valid JSON, no other text.
1. Remove ALL content irrelevant to the main article: advertisements, "click for more", "share to", navigation links, promotional text, cookie notices, social media handles, etc.
2. If the cleaned content is in English, translate it to Chinese AND keep the original English
3. Return ONLY this JSON structure:
{"content_zh": "清理后的中文正文", "content_en": "Cleaned English original if applicable"}`;

  const userPrompt = `Content to clean:\n${rawContent.substring(0, 4000)}`;

  try {
    const result = await callMiniMax([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    let cleaned = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }

    if (!parsed) {
      return { content_zh: stripHtml(rawContent), content_en: isEnglish ? stripHtml(rawContent) : null };
    }

    return {
      content_zh: stripHtml(parsed.content_zh) || stripHtml(rawContent),
      content_en: parsed.content_en ? stripHtml(parsed.content_en) : (isEnglish ? stripHtml(rawContent) : null)
    };
  } catch (e) {
    console.error('AI article cleaning failed:', e);
    const stripped = stripHtml(rawContent) || '';
    return { content_zh: stripped, content_en: isEnglish ? stripped : null };
  }
}

export async function processNewsBatch(newsList) {
  return Promise.all(newsList.map(news => summarizeNews(news)));
}