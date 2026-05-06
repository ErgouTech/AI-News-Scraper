function calculateContentScore(text) {
  const textLower = text.toLowerCase();

  const modelKeywords = ['model', 'gpt', 'claude', 'gemini', 'llm', '大模型', '旗舰模型', '新模型', '新版本', '版本更新', '模型更新', 'model update', 'new model', 'model release', 'benchmark', '评测', '排行榜', 'ranking', '超越', 'surpass', 'outperform', 'SOTA', 'state-of-the-art', 'o1', 'o3', 'o4', 'gpt-5', 'claude 4', 'gemini 2'];
  const hardwareKeywords = ['gpu', 'tpu', 'npu', '芯片', '处理器', 'cpu', '硬件', '显卡', 'server', '服务器', '数据中心', '算力', 'H100', 'H200', 'B100', 'GB200', 'MI300'];
  const agentKeywords = ['agent', 'agentic', 'AI Agent', '智能体', '代理', 'MCP', 'computer use', 'computer control'];

  const modelScore = modelKeywords.filter(kw => textLower.includes(kw)).length * 20;
  const agentScore = agentKeywords.filter(kw => textLower.includes(kw)).length * 15;
  const hardwarePenalty = hardwareKeywords.filter(kw => textLower.includes(kw)).length * 15;

  return Math.max(0, modelScore + agentScore - hardwarePenalty);
}

export function scoreNews(news) {
  const now = Date.now();
  const publishedTime = new Date(news.publishedAt).getTime();
  const ageInHours = (now - publishedTime) / (1000 * 60 * 60);

  const recencyScore = calculateRecencyScore(ageInHours);
  const sourceScore = calculateSourceScore(news.source);
  const companyScore = calculateCompanyScore(news.title + ' ' + news.summary);
  const contentScore = calculateContentScore(news.title + ' ' + news.summary);

  return recencyScore * 0.15 + sourceScore * 0.15 + companyScore * 0.40 + contentScore * 0.30;
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
  const socialAuthority = ['x/', 'twitter', 'x.com'];

  const sourceLower = source.toLowerCase();

  if (socialAuthority.some(s => sourceLower.includes(s))) return 90;
  if (highAuthority.some(s => sourceLower.includes(s))) return 100;
  if (mediumAuthority.some(s => sourceLower.includes(s))) return 80;
  return 60;
}

function calculateCompanyScore(text) {
  const textLower = text.toLowerCase();

  const tier1 = ['openai', 'anthropic', 'deepmind', 'google deepmind', 'xai'];
  const tier2 = ['字节跳动', 'bytedance', '阿里巴巴', 'alibaba', '腾讯', 'tencent', 'kimi', '月之暗面', 'moonshot'];
  const tier3 = ['智谱', 'zhipu', 'minimax', '小米', 'xiaomi', 'glm', 'zhipuai', 'qwen', '通义千问', '文心一言', 'ernie'];

  const tier1Match = tier1.filter(c => textLower.includes(c)).length;
  const tier2Match = tier2.filter(c => textLower.includes(c)).length;
  const tier3Match = tier3.filter(c => textLower.includes(c)).length;

  if (tier1Match > 0) return 100;
  if (tier2Match > 0) return 90;
  if (tier3Match > 0) return 80;

  return 30;
}

export function isImportant(score) {
  return score > 60;
}

const TARGET_COMPANIES = [
  'openai', 'anthropic', 'deepmind', 'google deepmind', 'xai',
  '字节跳动', 'bytedance', 'moonshot', '月之暗面', 'kimi',
  '阿里巴巴', 'alibaba', '阿里巴巴', '腾讯', 'tencent',
  '智谱', 'zhipu', 'zhipuai', 'glm', 'minimax', '小米', 'xiaomi',
  'qwen', '通义千问', 'ernie', '文心一言'
];

const CONTENT_KEYWORDS = [
  'llm', 'large language model', '大模型', '语言模型',
  'model', 'gpt', 'claude', 'gemini', '新模型', '旗舰模型', '版本更新', 'model update', 'new model', 'model release',
  'agent', 'agentic', 'AI Agent', '智能体', '工具', 'assistant',
  'benchmark', '评测', 'ranking', '排行榜', '超越', 'surpass', 'outperform', 'SOTA', 'state-of-the-art',
  'o1', 'o3', 'o4', 'o5', 'gpt-5', 'claude 4', 'gemini 2',
  '发布', 'launch', 'release', 'announce',
  'computer use', 'MCP', '适配', '兼容', 'compatible', 'integration'
];

export function hasTargetCompany(text) {
  const textLower = text.toLowerCase();
  return TARGET_COMPANIES.some(c => textLower.includes(c));
}

export function isRelevantContent(text) {
  const textLower = text.toLowerCase();
  return CONTENT_KEYWORDS.some(kw => textLower.includes(kw));
}