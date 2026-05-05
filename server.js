import http from 'http';
import { execSync } from 'child_process';
import { crawlAll } from './crawler.js';
import { scoreNews, isImportant, hasTargetCompany } from './scorer.js';
import { processNewsBatch } from './ai.js';

const PORT = 3000;
const FETCH_INTERVAL = 60 * 60 * 1000; // 1 hour

let newsQueue = [];
let displayQueue = [];

async function refreshNews() {
  console.log(`[${new Date().toISOString()}] Fetching news...`);

  const rawNews = await crawlAll();

  // Mandatory company filter: must contain target company
  const companyFiltered = rawNews.filter(news =>
    hasTargetCompany(news.title + ' ' + news.summary)
  );
  console.log(`After company filter: ${companyFiltered.length} items`);

  const scoredNews = companyFiltered
    .map(news => ({ ...news, score: scoreNews(news) }))
    .filter(news => isImportant(news.score));

  console.log(`Found ${scoredNews.length} important news (score > 70)`);

  const processedNews = await processNewsBatch(scoredNews);

  displayQueue = processedNews
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 10);

  console.log(`Display queue updated with ${displayQueue.length} items`);
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.url === '/api/news' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(displayQueue));
      return;
    }

    if (req.url.startsWith('/api/article') && req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost').searchParams.get('url');
      if (!url) {
        res.writeHead(400);
        res.end('Missing url parameter');
        return;
      }
      try {
        const html = execSync(`curl -s --connect-timeout 10 -L "${url}"`, { encoding: 'utf-8' });
        const text = extractText(html);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: text }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to fetch article' }));
      }
      return;
    }

    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getIndexHTML());
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });
}

function extractMainContent(html) {
  // Try article tag first
  let articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch && articleMatch[1].length > 100) return articleMatch[1];

  // Try main tag
  let mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch && mainMatch[1].length > 100) return mainMatch[1];

  // Try to find the div with most paragraph text (Readability-style)
  let bestContent = '';
  let bestScore = 0;

  const divMatches = html.matchAll(/<div[^>]*(?:class|id)=["']([^"']*)["'][^>]*>([\s\S]*?)<\/div>/gi);
  for (const match of divMatches) {
    const classId = (match[1] || '').toLowerCase();
    const content = match[2];

    // Skip nav, footer, header, sidebar, menu, comment, related,推荐,侧边栏
    const skipPatterns = ['nav', 'footer', 'header', 'sidebar', 'menu', 'comment', 'related', 'recommend', 'popular', 'social', 'share', 'ad-', '广告', '侧边栏', '导航', '评论', '相关'];
    if (skipPatterns.some(p => classId.includes(p))) continue;

    // Score based on paragraph count and length
    const paragraphs = (content.match(/<p[^>]*>/gi) || []).length;
    const textLength = content.replace(/<[^>]*>/g, '').length;
    const score = paragraphs * 100 + Math.min(textLength, 5000);

    if (score > bestScore && textLength > 200) {
      bestScore = score;
      bestContent = content;
    }
  }

  return bestContent || html;
}

function extractText(html) {
  const content = extractMainContent(html);

  // Aggressive cleanup of non-content elements
  let text = content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/<input[^>]*>/gi, '')
    .replace(/<select[^>]*>[\s\S]*?<\/select>/gi, '')
    .replace(/<ul[^>]*>[\s\S]*?<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>[\s\S]*?<\/ol>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '\n• ')
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, '$1')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\n\s*\n+/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // Truncate to reasonable length but allow more than 5000
  return text.slice(0, 10000);
}

function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ErgouTech's AI News Lab</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #0a0a0f;
      color: #e0e0e0;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      min-height: 100vh;
      overflow-x: hidden;
    }

    .bg-grid {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image:
        linear-gradient(rgba(0, 255, 136, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 136, 0.03) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: 0;
    }

    .glow {
      position: fixed;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      filter: blur(150px);
      opacity: 0.15;
      pointer-events: none;
      z-index: 0;
    }

    .glow-1 {
      top: -200px;
      left: -200px;
      background: #00ff88;
      animation: float 8s ease-in-out infinite;
    }

    .glow-2 {
      bottom: -200px;
      right: -200px;
      background: #00aaff;
      animation: float 8s ease-in-out infinite reverse;
    }

    @keyframes float {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(50px, 50px); }
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    header {
      text-align: center;
      margin-bottom: 50px;
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 300;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      background: linear-gradient(135deg, #00ff88, #00aaff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 10px;
    }

    .subtitle {
      color: #666;
      font-size: 0.85rem;
      letter-spacing: 0.2em;
    }

    .status {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin-top: 15px;
      font-size: 0.75rem;
      color: #555;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00ff88;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    #news-list {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .news-card {
      display: block;
      background: linear-gradient(135deg, rgba(20, 20, 30, 0.9), rgba(10, 10, 20, 0.9));
      border: 1px solid rgba(0, 255, 136, 0.2);
      border-radius: 12px;
      padding: 24px;
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
      text-decoration: none;
      color: inherit;
    }

    .news-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 3px;
      height: 100%;
      background: linear-gradient(180deg, #00ff88, #00aaff);
      pointer-events: none;
    }

    .news-card:hover {
      border-color: rgba(0, 255, 136, 0.5);
      transform: translateX(5px);
      box-shadow: 0 0 30px rgba(0, 255, 136, 0.1);
      cursor: pointer;
    }

    .news-source {
      font-size: 0.7rem;
      color: #00ff88;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .news-title {
      font-size: 1.1rem;
      font-weight: 500;
      color: #fff;
      margin-bottom: 6px;
      line-height: 1.4;
    }

    .news-title-en {
      font-size: 0.9rem;
      color: #888;
      margin-bottom: 12px;
      line-height: 1.4;
    }

    .news-summary {
      font-size: 0.9rem;
      color: #aaa;
      line-height: 1.6;
      margin-bottom: 6px;
    }

    .news-summary-en {
      font-size: 0.85rem;
      color: #666;
      line-height: 1.5;
    }

    .news-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .news-time {
      font-size: 0.75rem;
      color: #555;
    }

    .news-score {
      font-size: 0.75rem;
      color: #00aaff;
      padding: 4px 10px;
      border: 1px solid rgba(0, 170, 255, 0.3);
      border-radius: 20px;
    }

    .loading {
      text-align: center;
      padding: 60px;
      color: #555;
    }

    .loading::after {
      content: '';
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid #00ff88;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-left: 10px;
      vertical-align: middle;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      padding: 40px;
    }

    .modal-overlay.active {
      display: flex;
    }

    .modal-content {
      background: linear-gradient(135deg, rgba(20, 20, 30, 0.98), rgba(10, 10, 20, 0.98));
      border: 1px solid rgba(0, 255, 136, 0.3);
      border-radius: 16px;
      max-width: 800px;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    }

    .modal-header {
      padding: 24px 24px 0;
    }

    .modal-title {
      font-size: 1.3rem;
      color: #fff;
      line-height: 1.5;
      margin-bottom: 8px;
    }

    .modal-meta {
      font-size: 0.8rem;
      color: #00ff88;
      margin-bottom: 20px;
    }

    .modal-body {
      padding: 0 24px 24px;
      color: #ccc;
      font-size: 0.95rem;
      line-height: 1.8;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .modal-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #888;
      font-size: 24px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .modal-close:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }

    .modal-loading {
      text-align: center;
      padding: 60px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="glow glow-1"></div>
  <div class="glow glow-2"></div>

  <div class="container">
    <header>
      <h1>ErgouTech's AI News Lab</h1>
      <p class="subtitle">全球 AI 重要新闻滚动更新</p>
      <div class="status">
        <span class="status-dot"></span>
        <span id="update-time">数据加载中...</span>
      </div>
    </header>

    <div id="news-list">
      <div class="loading">正在获取新闻</div>
    </div>
  </div>

  <div id="modal" class="modal-overlay">
    <div class="modal-content">
      <button class="modal-close">&times;</button>
      <div class="modal-header">
        <div class="modal-title" id="modal-title"></div>
        <div class="modal-meta" id="modal-meta"></div>
      </div>
      <div class="modal-body" id="modal-body">
        <div class="modal-loading">正在加载原文内容...</div>
      </div>
    </div>
  </div>

  <script>
    alert('Script loaded!');
    const newsList = document.getElementById('news-list');
    const updateTime = document.getElementById('update-time');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMeta = document.getElementById('modal-meta');
    const modalBody = document.getElementById('modal-body');
    const modalClose = document.querySelector('.modal-close');

    function formatTime(isoString) {
      const date = new Date(isoString);
      const now = new Date();
      const diff = Math.floor((now - date) / 1000 / 60);

      if (diff < 60) return diff + ' 分钟前';
      if (diff < 1440) return Math.floor(diff / 60) + ' 小时前';
      return date.toLocaleDateString('zh-CN');
    }

    function stripHtml(str) {
      if (!str) return '';
      return str.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
    }

    function renderNews(news) {
      var titleHtml;
      if (news.titleEn) {
        titleHtml = '<div class="news-title">' + stripHtml(news.titleZh) + '</div><div class="news-title-en">' + stripHtml(news.titleEn) + '</div>';
      } else {
        titleHtml = '<div class="news-title">' + stripHtml(news.titleZh) + '</div>';
      }

      var summaryHtml;
      if (news.summaryEn) {
        summaryHtml = '<div class="news-summary">' + stripHtml(news.summaryZh) + '</div><div class="news-summary-en">' + stripHtml(news.summaryEn) + '</div>';
      } else {
        summaryHtml = '<div class="news-summary">' + stripHtml(news.summaryZh) + '</div>';
      }

      var cardUrl = news.url || '';
      var score = Math.round(news.score) || 0;
      var timeAgo = formatTime(news.publishedAt);

      return '<div class="news-card" data-url="' + cardUrl + '"><div class="news-source">' + news.source + '</div>' + titleHtml + summaryHtml + '<div class="news-meta"><span class="news-time">' + timeAgo + '</span><span class="news-score">重要性 ' + score + '分</span></div></div>';
    }

    function renderEmpty() {
      return '<div class="loading">暂无重要新闻，请稍后再试</div>';
    }

    async function fetchNews() {
      try {
        console.log('Fetching news...');
        const res = await fetch('/api/news');
        console.log('Response status:', res.status);
        const news = await res.json();
        console.log('Received news count:', news.length);

        if (news.length === 0) {
          newsList.innerHTML = renderEmpty();
        } else {
          newsList.innerHTML = news.map(renderNews).join('');
          document.querySelectorAll('.news-card').forEach((card, idx) => {
            card.addEventListener('click', () => {
              const newsItem = news[idx];
              openModal(newsItem);
            });
          });
        }

        updateTime.textContent = '最后更新: ' + new Date().toLocaleTimeString('zh-CN');
      } catch (e) {
        console.error('Fetch error:', e);
        newsList.innerHTML = '<div class="loading">加载失败，请刷新重试</div>';
      }
    }

    function openModal(newsItem) {
      modalTitle.textContent = newsItem.titleZh || newsItem.title;
      modalMeta.textContent = newsItem.source + ' | ' + formatTime(newsItem.publishedAt);
      modalBody.innerHTML = '<div class="modal-loading">正在加载原文内容...</div>';
      modal.classList.add('active');
      fetchArticleContent(newsItem);
    }

    function closeModal() {
      modal.classList.remove('active');
    }

    async function fetchArticleContent(newsItem) {
      if (!newsItem.url) {
        modalBody.textContent = (newsItem.summaryZh || newsItem.summary || '原文链接不可用');
        return;
      }
      try {
        const res = await fetch('/api/article?url=' + encodeURIComponent(newsItem.url));
        const data = await res.json();
        if (data.content && data.content.length > 50) {
          modalBody.textContent = data.content;
        } else {
          // Fallback to summary if article fetch failed or returned empty
          modalBody.textContent = '【摘要】\\n\\n' + (newsItem.summaryZh || newsItem.summary || '暂无内容');
        }
      } catch (e) {
        // Fallback to summary on error
        modalBody.textContent = '【摘要】\\n\\n' + (newsItem.summaryZh || newsItem.summary || '加载原文失败');
      }
    }

    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    fetchNews();
    setInterval(fetchNews, 30000);
  </script>
</body>
</html>`;
}

async function main() {
  await refreshNews();

  setInterval(refreshNews, FETCH_INTERVAL);

  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

main().catch(console.error);