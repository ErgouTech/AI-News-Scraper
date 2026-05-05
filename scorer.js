export function scoreNews(news) {
  const now = Date.now();
  const publishedTime = new Date(news.publishedAt).getTime();
  const ageInHours = (now - publishedTime) / (1000 * 60 * 60);

  const recencyScore = calculateRecencyScore(ageInHours);
  const sourceScore = calculateSourceScore(news.source);
  const companyScore = calculateCompanyScore(news.title + ' ' + news.summary);

  return recencyScore * 0.3 + sourceScore * 0.25 + companyScore * 0.45;
}

function calculateRecencyScore(ageInHours) {
  if (ageInHours <= 1) return 100;
  if (ageInHours <= 3) return 90;
  if (ageInHours <= 6) return 80;
  if (ageInHours <= 12) return 60;
  if (ageInHours <= 24) return 40;
  if (ageInHours <= 48) return 20;
  return 10;
}

function calculateSourceScore(source) {
  const highAuthority = ['techcrunch', 'venturebeat', 'theverge', 'wired', '36kr', 'ithome'];
  const mediumAuthority = ['hackernews', 'hn', 'reddit', 'arxiv', 'leifeng'];

  const sourceLower = source.toLowerCase();

  if (highAuthority.some(s => sourceLower.includes(s))) return 100;
  if (mediumAuthority.some(s => sourceLower.includes(s))) return 80;
  return 60;
}

function calculateCompanyScore(text) {
  const textLower = text.toLowerCase();

  const tier1 = ['openai', 'anthropic', 'deepmind'];
  const tier2 = ['字节跳动', 'bytedance', '阿里巴巴', 'alibaba', '腾讯', 'tencent'];
  const tier3 = ['月之暗面', 'moonshot', '智谱', 'zhipu', 'minimax', '小米', 'xiaomi'];

  if (tier1.some(c => textLower.includes(c))) return 100;
  if (tier2.some(c => textLower.includes(c))) return 90;
  if (tier3.some(c => textLower.includes(c))) return 80;

  return 30;
}

export function isImportant(score) {
  return score > 70;
}

const MANDATORY_COMPANIES = [
  'openai', 'anthropic', 'deepmind',
  '字节跳动', 'bytedance', '阿里巴巴', 'alibaba', '腾讯', 'tencent',
  '月之暗面', 'moonshot', '智谱', 'zhipu', 'minimax', '小米', 'xiaomi'
];

const AI_CONTEXT = [
  'ai', 'artificial intelligence', 'machine learning', 'deep learning',
  'llm', 'large language model', 'neural network', 'gpt', 'claude', 'gemini',
  '大模型', '生成式', '人工智能', '神经网络', 'AI 模型', 'AI 工具', 'Agent', 'agent',
  'chatgpt', '语言模型', '机器学习', '深度学习'
];

export function hasTargetCompany(text) {
  const textLower = text.toLowerCase();
  const hasCompany = MANDATORY_COMPANIES.some(c => textLower.includes(c));
  const hasAI = AI_CONTEXT.some(c => textLower.includes(c));
  return hasCompany && hasAI;
}