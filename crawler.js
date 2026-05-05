import { execSync } from 'child_process';

const HACKER_NEWS_API = 'https://hacker-news.firebaseio.com/v0';

const AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'deep learning',
  'openai', 'anthropic', 'google deepmind', 'chatgpt', 'claude', 'gemini',
  'llm', 'large language model', 'neural network', 'gpt',
  '字节跳动', 'bytedance', '阿里巴巴', 'alibaba', '腾讯', 'tencent',
  '月之暗面', 'moonshot', '智谱', 'zhipu', 'minimax', '小米', 'xiaomi',
  '人工智能', '大模型', '生成式 AI', 'AI 模型', '神经网络'
];

function fetchUrl(url) {
  try {
    return execSync(`curl -s --connect-timeout 10 -m 30 "${url}"`, { encoding: 'utf-8' });
  } catch (e) {
    return '';
  }
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+/g, '').trim();
}

function extractText(xml, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\/${tag}>`, 'i');
  let m = xml.match(cdataRe);
  if (m) return stripHtml(m[1]);

  const simpleRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i');
  m = xml.match(simpleRe);
  if (m) return stripHtml(m[1]);

  return '';
}

function extractRSSItems(xml, source) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractText(itemXml, 'title');
    const link = extractText(itemXml, 'link');
    const description = extractText(itemXml, 'description');
    const pubDate = extractText(itemXml, 'pubDate');

    if (title) {
      items.push({
        title,
        summary: description.slice(0, 500),
        url: link,
        source: source,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
      });
    }
  }
  return items;
}

// Hacker News
async function fetchHackerNews() {
  try {
    const data = fetchUrl(`${HACKER_NEWS_API}/jobstories.json`);
    const jobIds = JSON.parse(data);
    const top30 = jobIds.slice(0, 30);

    const items = await Promise.all(
      top30.map(id => {
        const itemData = fetchUrl(`${HACKER_NEWS_API}/item/${id}.json`);
        return JSON.parse(itemData);
      })
    );

    return items
      .filter(item => item && item.title)
      .map(item => ({
        id: item.id,
        title: item.title,
        summary: item.text ? item.text.replace(/<[^>]*>/g, '').slice(0, 500) : '',
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        source: 'HackerNews',
        publishedAt: new Date(item.time * 1000).toISOString()
      }));
  } catch (e) {
    console.error('HackerNews error:', e.message);
    return [];
  }
}

// International RSS feeds
async function fetchTechCrunch() {
  try {
    const xml = fetchUrl('https://techcrunch.com/feed/');
    return extractRSSItems(xml, 'TechCrunch');
  } catch (e) {
    console.error('TechCrunch error:', e.message);
    return [];
  }
}

async function fetchVentureBeat() {
  try {
    const xml = fetchUrl('https://venturebeat.com/feed/');
    return extractRSSItems(xml, 'VentureBeat');
  } catch (e) {
    console.error('VentureBeat error:', e.message);
    return [];
  }
}

async function fetchTheVerge() {
  try {
    const xml = fetchUrl('https://www.theverge.com/rss/index.xml');
    return extractRSSItems(xml, 'TheVerge');
  } catch (e) {
    console.error('TheVerge error:', e.message);
    return [];
  }
}

async function fetchWired() {
  try {
    const xml = fetchUrl('https://www.wired.com/feed/rss');
    return extractRSSItems(xml, 'Wired');
  } catch (e) {
    console.error('Wired error:', e.message);
    return [];
  }
}

async function fetchArsTechnica() {
  try {
    const xml = fetchUrl('https://feeds.arstechnica.com/arstechnica/index');
    return extractRSSItems(xml, 'ArsTechnica');
  } catch (e) {
    console.error('ArsTechnica error:', e.message);
    return [];
  }
}

async function fetchReddit() {
  try {
    const data = fetchUrl('https://www.reddit.com/r/MachineLearning/hot/.json?limit=30');
    if (!data) return [];
    const json = JSON.parse(data);
    return (json.data?.children || [])
      .map(item => ({
        id: item.data.id,
        title: item.data.title,
        summary: item.data.selftext || '',
        url: item.data.url,
        source: 'Reddit/r/ML',
        publishedAt: new Date(item.data.created_utc * 1000).toISOString()
      }));
  } catch (e) {
    console.error('Reddit error:', e.message);
    return [];
  }
}

// X (Twitter) via Nitter RSS
async function fetchXNitter(screenName, sourceName) {
  const nitterInstances = [
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
    'https://nitter.kavin.rocks'
  ];
  for (const instance of nitterInstances) {
    try {
      const xml = execSync(`curl -s --connect-timeout 3 -m 5 "${instance}/${screenName}/rss"`, { encoding: 'utf-8' });
      if (xml && xml.includes('<item>')) {
        return extractRSSItems(xml, sourceName);
      }
    } catch (e) {
      continue;
    }
  }
  return [];
}

async function fetchTwitterX() {
  const accounts = [
    { screenName: 'sama', sourceName: 'X/OpenAI' },
    { screenName: 'AnthropicAI', sourceName: 'X/Anthropic' },
    { screenName: 'GoogleAI', sourceName: 'X/GoogleAI' },
    { screenName: 'xai', sourceName: 'X/xAI' },
    { screenName: 'kimi_all', sourceName: 'X/Kimi' },
    { screenName: 'MinimaxTech', sourceName: 'X/Minimax' },
    { screenName: 'zhipuai', sourceName: 'X/GLM' }
  ];

  try {
    const results = await Promise.all(
      accounts.map(acc => fetchXNitter(acc.screenName, acc.sourceName))
    );
    return results.flat();
  } catch (e) {
    console.error('Twitter/X fetch error:', e.message);
    return [];
  }
}

// Chinese RSS feeds
async function fetch36kr() {
  try {
    const xml = fetchUrl('https://36kr.com/feed');
    return extractRSSItems(xml, '36kr');
  } catch (e) {
    console.error('36kr error:', e.message);
    return [];
  }
}

async function fetchJiqizhixin() {
  try {
    const xml = fetchUrl('https://www.jiqizhixin.com/rss');
    return extractRSSItems(xml, '机器之心');
  } catch (e) {
    console.error('Jiqizhixin error:', e.message);
    return [];
  }
}

async function fetchITHomes() {
  try {
    const xml = fetchUrl('https://www.ithome.com/rss/');
    return extractRSSItems(xml, 'IT之家');
  } catch (e) {
    console.error('ITHomes error:', e.message);
    return [];
  }
}

async function fetchSinaTech() {
  try {
    const xml = fetchUrl('https://feed.baidu.com/feedjsons/tech');
    return extractRSSItems(xml, '新浪科技');
  } catch (e) {
    console.error('SinaTech error:', e.message);
    return [];
  }
}

async function fetchLeiFeng() {
  try {
    const xml = fetchUrl('https://www.leiphone.com/feed');
    return extractRSSItems(xml, '雷峰网');
  } catch (e) {
    console.error('LeiFeng error:', e.message);
    return [];
  }
}

async function fetchEvery() {
  try {
    const xml = fetchUrl('https://every.to/feeds/global.xml');
    return extractRSSItems(xml, 'Every');
  } catch (e) {
    console.error('Every error:', e.message);
    return [];
  }
}

// Additional Reddit AI communities
async function fetchRedditAI() {
  try {
    const data = fetchUrl('https://www.reddit.com/r/LocalLLaMA/hot/.json?limit=20');
    if (!data) return [];
    const json = JSON.parse(data);
    return (json.data?.children || [])
      .map(item => ({
        id: item.data.id,
        title: item.data.title,
        summary: item.data.selftext || '',
        url: item.data.url,
        source: 'Reddit/LocalLLaMA',
        publishedAt: new Date(item.data.created_utc * 1000).toISOString()
      }));
  } catch (e) {
    console.error('Reddit LocalLLaMA error:', e.message);
    return [];
  }
}

function isAIRelated(news) {
  const text = (news.title + ' ' + news.summary).toLowerCase();
  return AI_KEYWORDS.some(kw => text.includes(kw));
}

export async function crawlAll() {
  console.log('Crawling all sources...');

  const [
    hn, tc, vb, verge, wired, ars, twitterX,
    kr36, leifeng, ithome, every
  ] = await Promise.all([
    fetchHackerNews(),
    fetchTechCrunch(),
    fetchVentureBeat(),
    fetchTheVerge(),
    fetchWired(),
    fetchArsTechnica(),
    fetchTwitterX(),
    fetch36kr(),
    fetchLeiFeng(),
    fetchITHomes(),
    fetchEvery()
  ]);

  const allNews = [...hn, ...tc, ...vb, ...verge, ...wired, ...ars, ...twitterX, ...kr36, ...leifeng, ...ithome, ...every];
  console.log(`Total fetched: ${allNews.length} items`);

  const aiNews = allNews.filter(isAIRelated);
  console.log(`AI-related: ${aiNews.length} items`);

  return aiNews;
}