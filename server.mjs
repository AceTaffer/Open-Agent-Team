/**
 * ★ AI 智能体工作站 · 后端服务（P3）
 * ─────────────────────────────────────────────────────────────
 * ★ 零第三方依赖：只使用 Node 内置模块 + 全局 fetch（Node 18+，推荐 24）
 * ★ 功能总览：
 * ★   P1：API 仓库、余额中心、单智能体对话
 * ★   P2：模型精细管理、多智能体团队（队长→策划/美术/程序/测试）、工具协议、画板、代码视图
 * ★   P3：每任务成本统计、联网搜索/网页抓取、自定义 API 插件（http_call）、本地 exe 白名单调用、
 * ★       GitHub 集成（Token/仓库列表/下载仓库/打包上传，REST 实现无需 git）、开发者调试面板、设置
 * ★ 安全：只监听 127.0.0.1；API Key / GitHub Token 均 AES-256-GCM 加密存储
 */
import http from 'node:http'
import { readFile, writeFile, mkdir, readdir, rm, copyFile, cp, stat, appendFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import dgram from 'node:dgram'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { spawn, exec as execCb, execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(execCb)
const execFileAsync = promisify(execFile)

// ★ 版本比较（用于 GitHub 热更新检测）
function appVersion() { try { return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version || '0.0.0' } catch { return '0.0.0' } }
function cmpVer(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0)
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

// ★ 崩溃防护：记录未捕获异常而不是让进程直接退出（SSE 断连、巨型流等场景下的稳定性）
process.on('uncaughtException', (e) => { try { console.error(`[${new Date().toISOString()}] UNCAUGHT ${e?.stack || e}`) } catch { /* ignore */ } })
process.on('unhandledRejection', (e) => { try { console.error(`[${new Date().toISOString()}] UNHANDLED ${e?.stack || e}`) } catch { /* ignore */ } })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// ★ Android 壳/便携模式支持：数据目录与默认工作区可用环境变量重定向（缺省仍为程序目录下 data/workspace）
const DATA_DIR = process.env.OAT_DATA_DIR ? path.resolve(process.env.OAT_DATA_DIR) : path.join(__dirname, 'data')
const WEB_DIR = path.join(__dirname, 'web')
const WORKSPACE_DIR = process.env.OAT_WORKSPACE_DIR ? path.resolve(process.env.OAT_WORKSPACE_DIR) : path.join(__dirname, 'workspace')
const ARTIFACT_DIR = path.join(WORKSPACE_DIR, 'artifacts')
const PROVIDERS_FILE = path.join(DATA_DIR, 'providers.json')
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json')
const KEY_FILE = path.join(DATA_DIR, '.key')
const ROLES_FILE = path.join(DATA_DIR, 'roles.json')
const PLUGINS_FILE = path.join(DATA_DIR, 'plugins.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const TASKS_DIR = path.join(DATA_DIR, 'tasks')
const SKILLS_FILE = path.join(DATA_DIR, 'skills.json')
const STATS_FILE = path.join(DATA_DIR, 'stats.json')
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json')
const JS_PLUGINS_DIR = path.join(DATA_DIR, 'plugins-js')
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json')   // ★ TAT 手机设备（已配对）
const AUDIT_FILE = path.join(DATA_DIR, 'audit.jsonl')      // ★ TAT 远程操作审计日志
const PORT = Number(process.env.PORT || 3410)
const HOST = process.env.HOST || '127.0.0.1'
// ★ 设备权限档：read=只读 / operate=可对话+任务操作 / approve=可批准权限与回答 / config=可改配置
const DEVICE_PERMS = ['read', 'operate', 'approve', 'config']

/* ═══════════════════════════════════════════════════════════════
 * 一、内置厂商模板
 * ═══════════════════════════════════════════════════════════════ */
const TEMPLATES = {
  deepseek: { label: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'], capabilities: ['对话', '代码'], balance: 'deepseek', needsKey: true },
  openai: { label: 'OpenAI（GPT）', baseUrl: 'https://api.openai.com/v1', models: ['gpt-5.6', 'gpt-5.2', 'gpt-5-nano', 'o4', 'o4-mini'], capabilities: ['对话', '视觉', '推理'], balance: 'probe', needsKey: true },
  anthropic: { label: 'Anthropic（Claude）', baseUrl: 'https://api.anthropic.com/v1', models: ['claude-fable-5.1', 'claude-opus-5', 'claude-opus-4.8', 'claude-sonnet-4'], capabilities: ['对话', '视觉', '代码'], balance: 'probe', needsKey: true },
  zhipu: { label: '智谱 AI（GLM）', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-5.3', 'glm-5.3-flash', 'glm-5.2', 'glm-5', 'cogview-4'], capabilities: ['对话', '代码', '出图'], balance: 'probe', needsKey: true },
  minimax: { label: 'MiniMax（海螺）', baseUrl: 'https://api.minimaxi.com/v1', models: ['minimax-m3', 'minimax-m2.7', 'minimax-m2.5'], capabilities: ['对话', '代码'], balance: 'probe', needsKey: true },
  xai: { label: 'xAI（Grok）', baseUrl: 'https://api.x.ai/v1', models: ['grok-5', 'grok-4.1', 'grok-4-fast'], capabilities: ['对话', '推理'], balance: 'probe', needsKey: true },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-3.1-pro', 'gemini-3-flash', 'gemini-2.5-pro'], capabilities: ['对话', '视觉', '推理'], balance: 'probe', needsKey: true },
  dashscope: { label: '阿里云百炼（通义千问/万相）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-plus', 'qwen-vl-max', 'qwen-tts', 'wanx2.1-t2i-turbo', 'wanx2.1-i2v-turbo', 'wanx2.1-t2v-turbo', 'wanx2.2-t2v-plus'], capabilities: ['对话', '视觉', '出图', '语音', '视频'], balance: 'probe', needsKey: true },
  opencode_go: { label: 'OpenCode Go / Zen', baseUrl: 'https://opencode.ai/zen/go/v1', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4.1-flash', 'deepseek-flash', 'deepseek-v4-flash-vision-exp', 'glm-5.2', 'glm-5.3', 'glm-5.3-flash', 'gpt-6-luna', 'gpt-5.6-luna', 'grok-4.7', 'grok-4.6', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus', 'kimi-k3', 'kimi-k2.7-code', 'minimax-m3', 'minimax-m2.7', 'mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.5-pro', 'mimo-v2.5', 'hy4-preview', 'hy3', 'longcat-2.0', 'longcat-2.5-preview-free', 'space-bunny-free', 'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor'], capabilities: ['对话', '代码'], balance: 'opencode_go', needsKey: true },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['deepseek/deepseek-chat-v3.1', 'anthropic/claude-sonnet-4.5'], capabilities: ['对话', '代码'], balance: 'openrouter', needsKey: true },
  siliconflow: { label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3.2-Exp', 'Qwen/Qwen3-VL-32B-Instruct', 'Kwai-Kolors/Kolors'], capabilities: ['对话', '视觉', '出图'], balance: 'probe', needsKey: true },
  moonshot: { label: 'Kimi / Moonshot', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k2-0905-preview', 'moonshot-v1-32k'], capabilities: ['对话', '代码'], balance: 'moonshot', needsKey: true },
  openai_compatible: { label: 'OpenAI 兼容中转站（OneAPI/NewAPI 等）', baseUrl: '', models: [], capabilities: ['对话'], balance: 'probe', needsKey: true },
  custom: { label: '自定义', baseUrl: '', models: [], capabilities: ['对话'], balance: 'probe', needsKey: true },
  local: { label: '本地智能体（Ollama / LM Studio / vLLM）', baseUrl: 'http://127.0.0.1:11434/v1', models: [], capabilities: ['对话', '本地'], balance: 'none', needsKey: false },
}

/* ═══════════════════════════════════════════════════════════════
 * 二、模型分类 + 价格
 * ═══════════════════════════════════════════════════════════════ */
function classifyModel(id) {
  const s = String(id).toLowerCase()
  const has = (...a) => a.some((k) => s.includes(k))
  const tags = []
  if (has('-vl', 'vl-', 'vision', '-omni', 'omni-', 'gpt-4o', 'gpt-4.1', 'claude', 'gemini-', 'qvq', 'qv-')) tags.push('视觉')
  if (has('coder', 'code-', '-code', 'codestral', 'deepseek-coder')) tags.push('代码')
  if (has('reasoner', '-r1', 'r1-', 'qwq', 'thinking', '-think')) tags.push('推理')
  if (has('wanx', 'wan2', 'wan-', 'wan_', 'flux', 'kolors', 'stable-diffusion', 'dall-e', 't2i', 'i2i', '-image', 'image-')) tags.push('出图')
  if (has('t2v', 'i2v', 'video', 'cogvideo', 'kling', 'seedance', 'animate')) tags.push('视频')
  if (has('tts', 'cosyvoice', 'sambert', 'speech', 'audio', 'voice', 'asr', 'whisper', 'sensevoice', 'paraformer')) tags.push('语音')
  if (has('embedding', 'embed', 'bge-', 'gte-', 'text-embedding')) tags.push('嵌入')
  if (has('rerank')) tags.push('重排')
  if (!tags.length) tags.push('对话')
  else if (!tags.some((t) => ['出图', '视频', '语音', '嵌入', '重排'].includes(t))) tags.unshift('对话')
  return tags
}
function normalizeModels(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((m) => (typeof m === 'string' ? { id: m, tags: classifyModel(m) } : { id: m.id, tags: m.tags?.length ? m.tags : classifyModel(m.id), ...(m.price ? { price: m.price } : {}) })).filter((m) => m.id)
}
// ★ 内置单价表（人民币 / 百万 token），可在厂商里填"默认单价"覆盖，或给单个模型配 price
const DEFAULT_PRICES = {
  'deepseek-chat': { inMiss: 2, inHit: 0.5, out: 8 },
  'deepseek-reasoner': { inMiss: 4, inHit: 1, out: 16 },
  'deepseek-v4.1-flash': { inMiss: 2, inHit: 0.04, out: 8 },
  'qwen-max': { inMiss: 2.4, inHit: 0.48, out: 9.6 },
  'qwen-plus': { inMiss: 0.8, inHit: 0.16, out: 2 },
  'qwen-turbo': { inMiss: 0.3, inHit: 0.06, out: 0.6 },
}
function getPrice(provider, modelId) {
  const m = provider?.models?.find((x) => x.id === modelId)
  if (m?.price && (m.price.inMiss || m.price.out)) return m.price
  const key = Object.keys(DEFAULT_PRICES).sort((a, b) => b.length - a.length).find((k) => modelId.toLowerCase().includes(k))
  if (key) return DEFAULT_PRICES[key]
  if (provider?.defaultPrice && (provider.defaultPrice.inMiss || provider.defaultPrice.out)) return provider.defaultPrice
  return null
}
function calcCost(price, usage) {
  if (!price || !usage) return null
  const hit = usage.prompt_cache_hit_tokens || 0
  const prompt = usage.prompt_tokens || 0
  const miss = Math.max(0, prompt - hit)
  const out = usage.completion_tokens || 0
  const c = (miss / 1e6) * (price.inMiss || 0) + (hit / 1e6) * (price.inHit ?? price.inMiss ?? 0) + (out / 1e6) * (price.out || 0)
  return Number(c.toFixed(6))
}

/* ═══════════════════════════════════════════════════════════════
 * 三、存储
 * ═══════════════════════════════════════════════════════════════ */
let providers = []
let secrets = {}
let roles = []          // ★ 角色为数组，可增删改（Open Agent Team）
let plugins = []        // HTTP API 插件
let skills = []         // ★ Agent 技能预设 [{id,name,description,prompt}]
let sessions = []       // ★ 会话：每个 API 下可多个独立会话（含消息、工作区、模型）
let devices = []        // ★ TAT：已配对的手机设备 [{id,name,tokenHash,perm,revoked,createdAt,lastSeen,lastIp}]
let settings = { developerMode: false, exeEnabled: false, exeAllowlist: [], githubLogin: '', workspaces: [], activeWorkspace: '', language: '', taskBudgetCost: 0, chatTools: true, defaultPermission: 'modify', reasoningEffort: 'low', artProvider: '', artModel: '', videoProvider: '', videoModel: '', updateRepo: 'AceTaffer/Open-Agent-Team', updateBranch: 'main', toolLimits: { chat: 0, team: 0, roleChat: 0 }, lanListen: false, pauseOnDisconnect: false, easytier: { networkName: '', networkSecret: '', virtualIp: '10.126.126.1', peerUrl: 'tcp://public.easytier.cn:11010' }, ui: { theme: 'dark', accent: '#2f9e8f', fontSize: 13, spacing: 'normal', teamInputPos: 'bottom' }, qwenTts: { url: 'http://127.0.0.1:7860' }, qwenModel: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base', qwenModelCV: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', qwenSpeaker: '', qwenVoice: '', qwenLanguage: 'auto' }

/* ═══════════════════════════════════════════════════════════════
 * ★ TAT 手机互联基础：事件流（rev）、审计、设备配对
 * ═══════════════════════════════════════════════════════════════ */
const streamClients = new Set()          // /api/stream 监听器
let listenAll = false                    // ★ 当前是否监听 0.0.0.0（服务启动时确定）
let currentOrigin = ''                   // ★ 当前非 GET 请求的客户端标识（用于广播回显抑制）
const revs = {}                          // 各数据域版本号（客户端增量同步用）
function bumpRev(key) {
  revs[key] = (revs[key] || 0) + 1
  // ★ origin：本次变更由哪个客户端发起（客户端据此忽略自己的回声，避免"另一台设备更新"互相刷屏）
  const ev = { type: 'changed', key, rev: revs[key], at: Date.now(), origin: currentOrigin || '' }
  dbg('rev.bump', { key, by: currentOrigin || 'server' })
  for (const fn of streamClients) { try { fn(ev) } catch { /* ignore */ } }
}
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')
function audit(req, action, detail) {
  try {
    const line = JSON.stringify({ t: Date.now(), ip: req?.socket?.remoteAddress || '', device: req?.device ? { id: req.device.id, name: req.device.name, perm: req.device.perm } : null, action, detail })
    appendFile(AUDIT_FILE, line + '\n').catch(() => {})
  } catch { /* ignore */ }
}
// ★ 一次性配对码（5 分钟有效，PIN 或二维码 token 二选一提交）
const pairCodes = new Map() // code -> { token, expires }
function genPairCode() {
  for (const [k, v] of pairCodes) if (v.expires < Date.now()) pairCodes.delete(k)
  const code = String(crypto.randomInt(100000, 1000000))
  const token = crypto.randomBytes(16).toString('hex')
  pairCodes.set(code, { token, expires: Date.now() + 5 * 60 * 1000 })
  return { code, token, expires: Date.now() + 5 * 60 * 1000 }
}
// ★ 安全审计修复：配对码暴力破解防护（每 IP 10 分钟窗口内最多 10 次失败，超限锁 10 分钟）
//   rec: { n 失败计数, until 锁定截止, first 窗口起点 }
const pairFails = new Map()
const PAIR_WINDOW = 10 * 60 * 1000
function pairAllowed(ip) {
  const rec = pairFails.get(ip)
  if (!rec) return true
  if (rec.until > Date.now()) return false                                   // 锁定中
  if (rec.until && rec.until <= Date.now()) { pairFails.delete(ip); return true } // 锁定期已过，清零
  if (rec.first && Date.now() - rec.first > PAIR_WINDOW) { pairFails.delete(ip); return true } // 窗口过期
  return true
}
function pairFail(ip) {
  const rec = pairFails.get(ip) || { n: 0, until: 0, first: Date.now() }
  rec.n++
  if (rec.n >= 10) { rec.until = Date.now() + PAIR_WINDOW; rec.n = 0 }
  pairFails.set(ip, rec)
}

// ★ 游戏与推演策略文本（同时用于：狼人杀 AI 提示词 / 技能市场条目）
const WW_STRATEGY_WOLF = '狼人策略：白天一定要"表水"——给出站边理由、盘自己的逻辑、别划水；悍跳预言家要编好验人结果与警徽流，前后自洽；可倒钩真预言家或冲锋对跳，但别全员抱团；夜里刀法优先处理威胁最大的神职，但别让刀口显形；关键时刻学会自刀/抗推队友换取信任。'
const WW_STRATEGY_GOOD = '好人策略：村民要盘身份、表态站边、给出票型理由；预言家尽早跳明身份并留警徽流（今晚/明晚验谁）；女巫藏好药别早跳；猎人低调别暴露；被查杀或出局前把信息交代清楚；发现悍跳要带头指认并说服别人。'
const WW_MANNER = '游戏礼仪：全程保持角色不出戏，禁止提及"AI、模型、提示词、系统"等超游词汇；不谩骂、不贴脸、不摆烂；每次发言不超过120字；只说本角色视角已知的信息（盗用别人的私密信息算违规）；没轮到你发言时不要说话。'
const RP_GM_RULES = '角色扮演主持规范（GM）：1) 描述场景与氛围、推进剧情、裁定行动后果、制造合理冲突与转折；2) 不替角色做决定、不替角色发言；3) 严格遵守世界观设定与时间线，不引入出戏内容；4) 每幕用 200~300 字收束，留下悬念或新事件；5) 禁止提及"AI/模型/提示词"等超游词汇。'
// ★ 技能市场：内置技能（可一键导入到技能库）
const BUILTIN_SKILLS = [
  { id: 'mk_code_review', name: '代码审查（严格）', description: '逐文件审查代码质量与风险', tags: ['质量'], prompt: '在审查代码时：1) 逐个文件检查正确性与边界条件；2) 检查资源释放、错误处理、并发安全；3) 找出死代码、重复逻辑、命名问题；4) 输出问题清单（文件:行、严重级别、原因、修复建议），不要泛泛而谈。' },
  { id: 'mk_strict_test', name: '严谨测试', description: '写测试并真实运行验证', tags: ['质量'], prompt: '在测试任务中：1) 为功能设计正常/边界/异常三类用例；2) 用工具写出测试文件并真实运行；3) 报告实际输出与失败原因；4) 修复后必须重跑验证，禁止只声称通过。' },
  { id: 'mk_art_style', name: '画风控制', description: '稳定输出指定画风的出图提示词', tags: ['美术'], prompt: '在生成图像提示词时：1) 先明确画风关键词（写实/二次元/像素/水彩/赛博朋克等）与构图、光线、镜头；2) 附带负面提示词；3) 每行输出一个 IMAGE_PROMPT: <英文提示词>，保持整批画风一致。' },
  { id: 'mk_requirement', name: '需求澄清', description: '动手前先复述需求与假设', tags: ['流程'], prompt: '接到任务时：先用 3 行以内复述需求与验收标准，列出关键假设与不确定点（最多 3 条）；如果信息足够则直接开工，不要反复追问。' },
  { id: 'mk_safe_ops', name: '安全优先', description: '危险操作前先备份与评估', tags: ['安全'], prompt: '执行命令/文件操作时：1) 先评估破坏性（删除、覆盖、批量修改）并优先使用非破坏性方案；2) 修改前先备份或使用版本控制；3) 拒绝任何不可逆的危险操作并在报告中说明原因。' },
  { id: 'mk_doc_cn', name: '中文技术文档', description: '结构化简体中文文档', tags: ['文档'], prompt: '撰写文档时使用简体中文：结构化小标题、先结论后细节、附可复制的命令与示例；避免空话与营销腔。' },
  { id: 'mk_refactor', name: '最简有效重构', description: '小步重构，保持行为不变', tags: ['质量'], prompt: '重构时坚持最简有效原则：能少写一行绝不多写；一次只做一类改动；每步改动后运行验证确保行为不变；不做与任务无关的“顺手优化”。' },
  { id: 'mk_research', name: '资料研究', description: '联网检索并给出处', tags: ['研究'], prompt: '研究问题时：先用 web_search/web_fetch 检索多个来源交叉验证；输出结论时要标注来源链接与关键原文摘要；找不到可靠来源要明确说明。' },
  { id: 'mk_security_audit', name: '安全审计（多阶段）', description: '侦察→覆盖排查→验证→报告（借鉴 Cloudflare security-audit-skill）', tags: ['安全', '质量'], prompt: '进行安全审计时按六阶段执行：1) 侦察：梳理架构、信任边界、输入面与历史证据，输出覆盖清单；2) 覆盖式排查：逐项检查注入、越权/鉴权绕过、路径穿越、命令注入、密钥与敏感信息泄露、依赖与配置风险，记录检查证据；3) 候选验证：每个可疑点交由独立验证者尝试证伪，确认可利用性与影响；4) 结构化输出：分为 confirmed / needs_validation / rejected 三类，写清 文件:行、复现步骤、影响；5) 独立复核：对最终结论逐条复核来源引用；6) 报告：输出结论、证据、修复建议与遗留问题。禁止无证据断言。' },
  { id: 'mk_pixel_asset', name: '游戏像素素材规范', description: '三视图→动作帧→PNG 标准化流程', tags: ['游戏', '美术'], prompt: '制作游戏素材时严格遵守：1) 先确认角色/场景设定，角色需产出正面/侧面/背面三视图；2) 依据三视图逐动作生成帧素材：待机、向左走、向右走、起跳、下落、下蹲、攻击、受击；3) 所有素材必须是 PNG（用 generate_image 生成，自动为 PNG）；4) 文件命名规范：角色ID_动作_序号.png（如 qianxia_run_01.png），场景命名：场景_分层_序号.png；5) 生成后用 list_files 核对文件确实存在，再汇总路径清单交给程序。' },
  { id: 'mk_game_qa', name: '游戏测试清单', description: '操作/碰撞/边界/性能全项验证', tags: ['游戏', '质量'], prompt: '测试游戏时按清单逐项真实验证并记录结果：1) 启动与加载无报错（浏览器控制台）；2) 键盘/鼠标操作响应正确；3) 移动、跳跃、碰撞、得分、胜负等核心机制；4) 边界情况：卡墙、出界、连续输入、暂停恢复；5) 素材加载：所有引用的 PNG 是否存在且能显示；6) 性能：帧率与内存无明显异常。发现问题要给出复现步骤与期望/实际结果，修复后必须回归重测。' },
  { id: 'mk_asset_org', name: '素材归档与命名', description: 'assets 目录结构与索引清单', tags: ['游戏', '流程'], prompt: '整理素材时：1) 统一放入工作区 assets/ 目录，按角色/场景/UI 分子目录；2) 文件名只使用小写字母、数字、下划线；3) 生成 assets/README.md 或 manifest.json 索引：文件名→用途→来源/生成提示词；4) 引用素材的代码必须使用清单中的路径，禁止出现找不到的文件。' },
  { id: 'mk_video_storyboard', name: '视频分镜脚本规范', description: '脚本→分镜表→逐镜生成', tags: ['视频', '策划'], prompt: '制作视频时按分镜流程：1) 先出脚本（旁白/字幕/时长）；2) 拆成分镜表：镜号、画面描述（英文提示词可直接用于 generate_video）、时长、转场、音效建议；3) 每个分镜单独调用 generate_video 生成 MP4（name 建议 shot01、shot02…），必要时用 generate_image 出关键帧；4) 全部生成后用 list_files 核对文件，输出成片清单（文件→分镜内容→时长）交测试质检。' },
  { id: 'mk_file_organize', name: '文件整理规范', description: '分类归档+去重+命名+清单', tags: ['效率', '流程'], prompt: '整理文件时：1) 动手前先完整列出目标目录清单（list_files），识别类型/重复/命名混乱项；2) 制定整理规则（分类维度、命名规范、保留策略）并先向用户确认；3) 操作使用"复制到新目录 + 生成清单"的非破坏性方式，删除/移动类危险操作必须先备份并征得用户确认；4) 完成后输出整理报告：每类文件数量、去处、重命名映射表、遗留问题。' },
  { id: 'mk_novel_outline', name: '小说大纲与世界观', description: '世界观/人物/主线/章纲一体设计', tags: ['小说', '策划'], prompt: '设计小说大纲时产出：1) 世界观设定（时代背景、核心设定与规则、禁忌与代价）；2) 人物设定：主角/对手/关键配角，写明目标、动机、性格缺陷、成长弧线；3) 主线与支线梗概（冲突升级节点）；4) 分章大纲：每章注明「本章目标、核心冲突、结尾钩子、预计字数」；5) 交付为工作区 md 文件（如 outline.md），编号规范，供写手直接按章写作。' },
  { id: 'mk_novel_style', name: '文风与视角控制', description: '统一视角/语气/节奏与用词', tags: ['小说', '风格'], prompt: '写作时严格控制文风：1) 开工前先确定并记录：叙事视角（第一/第三人称、限知/全知）、整体基调（轻松/严肃/黑暗）、语言风格（简洁白描/细腻抒情）与禁用词表；2) 每章写作保持人物语气、称呼、时间线一致；3) 对话要符合人物性格与身份，避免所有角色一个腔调；4) 章节结尾留钩子，控制段落节奏，避免大段说明文。' },
  { id: 'mk_novel_draft', name: '章节写作规范', description: '按章纲写稿、真实落盘、自检', tags: ['小说', '写作'], prompt: '写章节时：1) 严格按分章大纲写作，每章用 write_file 真实落盘（如 chapters/chapter_01.md），不要只在回复里贴正文；2) 开篇承接上一章，场景/时间/地点交代清楚；3) 写完自检：本章目标是否达成、伏笔是否记录、字数是否达标、有无与前面章节矛盾；4) 在 chapters/README.md 里维护进度清单（章号、标题、字数、状态），写完用 list_files 核对文件存在。' },
  { id: 'mk_novel_proofread', name: '小说校对规范', description: '逻辑/人设/时间线/文字逐项校对', tags: ['小说', '质量'], prompt: '校对小说话稿时逐项检查并给出证据：1) 剧情逻辑漏洞（动机不足、前后矛盾）；2) 人设一致性（性格、能力、称呼是否走形）；3) 时间线/空间线错误（季节、昼夜、路程）；4) 重复用词、口头禅滥用、错别字；5) 节奏问题（拖沓/跳跃）与建议删改段。输出「文件+段落位置+问题类型+修改建议」清单，重大问题用 ask_role 反馈给写手，改后必须复审。' },
  // ★ Paperclip 要点②：验收证据门——任何「完成/通过」结论必须附可复核证据（借鉴 Paperclip 的"无证据不算完成"）
  { id: 'mk_evidence', name: '验收证据规范', description: '完成/通过必须附命令、输出与读回证据', tags: ['质量', '规范'], prompt: '任何「完成 / 通过 / 已修复」结论都必须附可复核证据（禁止只声称）：1) 文件类：给出完整路径 + 用 read_file 读回的关键片段（或 list_files 结果）；2) 命令类：给出执行的命令原文 + 关键输出片段（如语法检查、字节比对、测试通过行）；3) 数据类：给出统计口径与原始数字；4) 若某项无法验证，明确写「未验证」并说明原因，不得默认通过；5) 汇报格式：结论 → 证据（逐项）→ 遗留问题。' },
  // ★ 角色扮演/世界观推演技能（V2 角色卡 / 世界书 / 群像演出 / 情景推演 / 一致性审校）
  { id: 'mk_roleplay_card', name: '角色卡规范（V2 兼容）', description: 'SillyTavern V2 字段映射 + 心理四要素 + 关系网', tags: ['角色扮演', '设定'], prompt: '角色卡规范（兼容 SillyTavern V2 / chara_card_v2）：每名主要角色产出一张卡，字段映射——description=身份/外观/背景与稳定事实；personality=性格与口吻（用 W++ 风格列特质，附口癖与语气例句）；scenario=所处情境与与主角关系；first_mes=该角色开场消息（用 {{user}} 占位）；mes_example=2~3 组语气校准（<START> 分隔，{{char}}/{{user}} 占位）。心理四要素必写：核心欲望 / 核心恐惧 / 核心谎言 / 需要学会的真相。另维护「角色关系网」（对谁：态度/张力/秘密）。交付 roleplay/characters.md + 每卡一份 roleplay/cards/*.json（chara_card_v2 兼容信封：spec/spec_version/data）。' },
  { id: 'mk_world_bible', name: '世界书规范（Lorebook）', description: '条目化世界观：关键词触发与分层', tags: ['角色扮演', '设定'], prompt: '世界书规范（Lorebook 思路）：世界观拆成「条目」而非长文——每条：标题、关键词 keys（2~6 个，含常见别名）、触发方式（constant 常驻 / selective 主键+副键）、优先级、30~120 字正文。按层组织：世界规则与禁忌、地理与气候、势力与政治、历史与纪年、经济与技术、日常文化与用语。禁止矛盾条目并存；拿不准的挂「待裁定」交主持；关键词避免用「你/我/这里」这类高频词（防误触发）。交付 roleplay/worldbook.md（条目表）。' },
  { id: 'mk_group_stage', name: '群像演出规范（GM 主持）', description: '多角色同场：轮转发言、防抢话、防全知', tags: ['角色扮演', '演出'], prompt: '群像演出规范：多角色同场时——1) 每轮按发言顺序轮流发言，用「角色名：」开头，每人一次 1~3 句，不得替他人说话；2) 严格遵守角色卡的口癖、学识、立场与已知信息：只能知道本场景亲历或他人明确告知的信息，禁止全知视角；3) 场景推进、时间流逝与突发事件由主持（GM）裁定与描述，演员只扮演自己的角色；4) 情绪与冲突要延续前文，不跳戏、不出戏（不写"作为AI…"之类）；5) 每幕结束由 GM 小结局面与悬念。' },
  { id: 'mk_roleplay_sim', name: '情景推演规范', description: '回合制多角色推演、因果链与分支钩子', tags: ['角色扮演', '推演'], prompt: '多智能体情景推演规范：1) 输入：情景设定、角色卡、各角色当前目标与可选手段；2) 按回合推演：每个角色从自身立场选行动并说明理由 → 主持依据世界规则裁定结果（成功/代价/新信息）；3) 记录因果链：时间、地点、行动者、行动、结果、影响；4) 每轮更新状态表（位置/关系/资源/情绪/已知信息）；5) 输出 2~3 条「如果…则…」分支钩子与后续冲突建议；6) 禁止上帝视角与结果钦定，每次裁定必须给出依据。' },
  { id: 'mk_continuity_check', name: '设定一致性审校', description: '规则/口吻/时间线/信息可知性逐项核对', tags: ['角色扮演', '质量'], prompt: '设定一致性审校：逐项检查并给证据（文件/条目/位置）：1) 世界观规则与禁忌是否被违反（能力边界、代价、限制）；2) 角色口吻、称呼、关系网是否走形（对照角色卡例句核验）；3) 时间线与空间线是否自洽（季节/昼夜/路程/纪年）；4) 信息可知性：角色是否使用了本不该知道的信息；5) 重复设定 / 吃书 / 互斥条目。输出「问题+位置+依据+修改建议」清单；出现设定级冲突必须判不通过并点名返工对象，修改后复审。' },
  // ★ 短视频流水线技能（project.json 工程规范 / 图生视频 / 配音 / 配乐 / 合成与媒体质检）
  { id: 'mk_video_project', name: '短视频工程规范（project.json）', description: '分镜工程单一事实源：场景表结构与时序约定', tags: ['视频', '规范'], prompt: '短视频项目以 video-project/project.json 为唯一事实源，所有角色都读写它、不要各自发明格式。结构：{"meta":{"title":"","aspect":"9:16 或 16:9","width":1080,"height":1920,"fps":30,"style":"风格关键词","music":{"file":"audio/bgm.mp3","volumeDb":-18},"subtitle":true},"scenes":[{"id":1,"dur":5,"narration":"中文文案（用于配音与字幕）","subtitleText":"可选覆盖字幕文本","visualPrompt":"可直接用于出图/视频的英文提示词","negative":"负面提示词","mode":"i2v","keyframe":"keyframes/k01.png","shot":"shots/shot01.mp4","voice":"audio/vo01.mp3"}]}。路径规范（重要）：project.json 内字段一律写「工程内相对路径」，直接以 shots/、audio/、keyframes/ 开头，**不要带 video-project/ 前缀**（如 "shots/shot01.mp4"、"audio/vo01.mp3"、"keyframes/k01.png"）；调用工具时一律用「工作区相对路径」（带 video-project/ 前缀）。工作纪律：先写全场景表再开工；每完成一个产物立即回写对应字段；时长以配音实测时长为准（合成工具会自动对齐全片时间线）。' },
  { id: 'mk_i2v', name: '图生视频规范', description: '关键帧先行、镜头风格一致性与重试策略', tags: ['视频', '生成'], prompt: '短视频镜头生成策略：1) 先用 generate_image 生成关键帧，必须带 out 参数写入工程目录，如 out:"video-project/keyframes/k01.png"（工具参数一律用「工作区相对路径」= video-project/ 开头；project.json 内字段才用工程内相对路径如 keyframes/k01.png）；画幅与 meta 一致（9:16 用 720x1280、16:9 用 1280x720），全片共用同一风格前缀；2) 再用 generate_video 携带 image:"video-project/keyframes/k01.png" 走图生视频（out 写 "video-project/shots/shot01.mp4"；被拒会自动回退文生视频；关键帧缺失会明确报错）；3) 多镜可用 shots:[...] 一次批量（默认 2 路并发）；4) 失败镜头先改提示词再重试，最多 3 次，仍失败要报告缺哪一镜并给替代方案；5) 完成后用 list_files 核对文件真实存在，并把「工程内相对路径」写回 project.json.shot。' },
  { id: 'mk_dubbing', name: '配音规范', description: '音色一致、少样本克隆、语速与镜头时长匹配', tags: ['视频', '配音'], prompt: '配音工作规范：1) 先确定音色：云端后端用设置的 TTS 音色；本地 Qwen-TTS 后端先 clone_voice 登记克隆音色（sample 指向工作区里 10 秒~2 分钟干净人声，如 uploads/voice-ref.wav；先 clone_voice list:true 可查看已登记音色与 WebUI 预设音色），之后 generate_speech 的 voice 传音色名即可（或直接传 WebUI 预设音色名走预设合成）；本地 VoiceStudio 后端用其 profile_id；2) 逐镜用 generate_speech 生成配音，out 用「工作区相对路径」如 "video-project/audio/vo01.mp3"（工具参数 = video-project/ 开头），并在 project.json.voice 写「工程内相对路径」如 audio/vo01.mp3；3) 语速与镜头时长相配：文案预计朗读超过 scene.dur - 0.5s 时先精简文案而不是硬加速；4) 数字、英文缩写、多音字改写为口语化表达避免读错；5) 配音完成后用 media_probe 核对时长与音轨。' },
  { id: 'mk_music', name: '配乐规范', description: 'BGM 选择/生成、音量包络与对白避让', tags: ['视频', '配乐'], prompt: '配乐工作规范：1) 先 generate_music list:true 查看工作区 bgm/ 已有音乐，有合适的直接 pick:"文件名"；没有就用 generate_music style 合成氛围配乐（calm/warm/tense/uplift），out 用 "video-project/audio/bgm.mp3"；2) project.json.meta.music.file 写工程内相对路径 "audio/bgm.mp3"，volumeDb 默认 -18（对白为主，音乐垫底）；3) 风格与情绪匹配：舒缓 calm、温情 warm、紧张 tense、高潮 uplift；4) 成片后如质检指出音乐盖住人声，把 volumeDb 调低 2~4dB 后重新合成。' },
    { id: 'mk_compose', name: '合成与媒体验收规范', description: 'ffmpeg 合成参数标准与成片验收清单', tags: ['视频', '质量'], prompt: '合成与验收规范：1) 合成前先 make_subtitles 生成字幕（会同时产出 ASS 与 SRT，ASS 用于烧录）；2) compose_video 一步完成归一化/转场/混音/烧字幕，输出 video-project/cut/final.mp4；缺镜头会黑场占位并在结果中警告，出现该警告一律不通过、必须补生成镜头后重新合成；3) 成片验收硬指标（全部用 media_probe 取证据）：分辨率符合 meta、有音轨、时长≈Σ镜头时长-转场重叠、响度约 -16 LUFS（±3）、**平均亮度 avgY ≥ 25（黑屏不通过；夜景等暗调题材 ≥ 18 且报告需说明）**、black 字段不得为 true；4) shot 与 final 都要探测；5) 字幕必须与配音逐句对齐（对照 subs/final.srt 与 scenes 文案），缺句/错句算不通过；6) 不通过时明确列出「哪个镜头/哪条配音/哪段字幕」需要返工，返工后重新合成再复审。' },
    // ★ 团队会话（游戏与推演）技能：狼人杀双阵营策略 / 游戏礼仪 / 扮演主持
    { id: 'mk_werewolf_play', name: '狼人杀·狼人策略', description: '表水/悍跳/倒钩/刀法（给扮演狼人的 AI 用）', tags: ['游戏', '狼人杀'], prompt: WW_STRATEGY_WOLF },
    { id: 'mk_good_logic', name: '狼人杀·好人逻辑', description: '盘身份/表水/站边/票型与指认悍跳', tags: ['游戏', '狼人杀'], prompt: WW_STRATEGY_GOOD },
    { id: 'mk_game_manner', name: '游戏与扮演礼仪', description: '不出戏/不超游/不贴脸/信息不越权', tags: ['游戏', '规范'], prompt: WW_MANNER },
    { id: 'mk_roleplay_stage', name: '扮演模式主持规范', description: 'GM 推进剧情/裁定后果/留悬念', tags: ['角色扮演', '主持'], prompt: RP_GM_RULES },
]
let stats = { calls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cost: 0, toolCalls: 0, byRole: {}, byModel: {}, updatedAt: 0 }
let ROLE_META = {}      // ★ 由 roles 动态重建：{ id: role }，兼容旧代码的 ROLE_META[id].label/.color

// ★ 默认团队角色（可在「团队配置」页增删改）
const DEFAULT_ROLES = [
  { id: 'leader', label: '队长', color: '#4f8cff', desc: '统筹规划、派发任务、最终汇总', enabled: true, providerId: '', model: '', systemPrompt: '', skills: [] },
  { id: 'planner', label: '策划', color: '#e0b34a', desc: '需求拆解、策略与步骤设计', enabled: true, providerId: '', model: '', systemPrompt: '', skills: [] },
  { id: 'artist', label: '美术', color: '#c86bff', desc: '视觉方案与出图提示词', enabled: true, providerId: '', model: '', systemPrompt: '', skills: [] },
  { id: 'coder', label: '程序', color: '#43d17c', desc: '写代码、写文件、跑命令', enabled: true, providerId: '', model: '', systemPrompt: '', skills: [] },
  { id: 'tester', label: '测试', color: '#ff8c5a', desc: '运行验证、报告问题', enabled: true, providerId: '', model: '', systemPrompt: '', skills: [] },
]
function roleById(id) { return roles.find((r) => r.id === id) }
// ★ 宽松角色匹配：兼容模型用"角色名/中文标签/大小写"引用角色（如 ask_role 写「程序」）
function findRole(key) {
  if (key == null) return null
  const k = String(key).trim()
  if (!k) return null
  return roles.find((r) => r.id === k) ||
    roles.find((r) => r.label === k) ||
    roles.find((r) => r.id.toLowerCase() === k.toLowerCase()) ||
    roles.find((r) => r.label.includes(k) || r.id.toLowerCase().includes(k.toLowerCase()))
}
function rebuildRoleMeta() {
  ROLE_META = {}
  for (const r of roles) ROLE_META[r.id] = { ...r, label: r.label || r.id, color: r.color || '#888', desc: r.desc || '' }
}

// ★ 上下文长度表（用于"上下文占用"展示，可在模型/厂商里覆盖）
const DEFAULT_CONTEXT_LIMITS = { 'deepseek-chat': 128000, 'deepseek-reasoner': 128000, 'deepseek-v4.1-flash': 256000, 'deepseek-v4-pro': 256000, 'qwen-max': 131072, 'qwen-plus': 131072, 'qwen-turbo': 1000000, 'qwen3.8': 262144, 'kimi': 262144, 'moonshot': 131072, 'glm': 131072, 'grok': 262144, 'gpt-5': 400000, 'minimax': 204800, 'mimo': 262144, 'hy3': 131072 }
function getContextLimit(provider, modelId) {
  const m = provider?.models?.find((x) => x.id === modelId)
  if (m?.contextLimit) return m.contextLimit
  const key = Object.keys(DEFAULT_CONTEXT_LIMITS).find((k) => String(modelId).toLowerCase().includes(k))
  if (key) return DEFAULT_CONTEXT_LIMITS[key]
  return provider?.defaultContextLimit || 128000
}

// ★ 全局统计累计
function statsAdd({ role = '', model = '', usage = null, cost = 0, toolCalls = 0 }) {
  if (usage) stats.calls += 1
  stats.toolCalls += toolCalls
  if (usage) {
    stats.promptTokens += usage.prompt_tokens || 0
    stats.completionTokens += usage.completion_tokens || 0
    stats.cacheHitTokens += usage.prompt_cache_hit_tokens || 0
  }
  stats.cost = Number(((stats.cost || 0) + (cost || 0)).toFixed(6))
  if (role && usage) { const b = (stats.byRole[role] ||= { calls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cost: 0, toolCalls: 0 }); b.calls += 1; b.promptTokens += usage.prompt_tokens || 0; b.completionTokens += usage.completion_tokens || 0; b.cacheHitTokens += usage.prompt_cache_hit_tokens || 0; b.cost = Number((b.cost + (cost || 0)).toFixed(6)); b.toolCalls += toolCalls }
  if (model && usage) { const m = (stats.byModel[model] ||= { calls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cost: 0 }); m.calls += 1; m.promptTokens += usage.prompt_tokens || 0; m.completionTokens += usage.completion_tokens || 0; m.cacheHitTokens += usage.prompt_cache_hit_tokens || 0; m.cost = Number((m.cost + (cost || 0)).toFixed(6)) }
  stats.updatedAt = Date.now()
  saveStatsDebounced()
}
let statsTimer = null
function saveStatsDebounced() {
  clearTimeout(statsTimer)
  statsTimer = setTimeout(() => { writeFile(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8').then(() => bumpRev('stats')).catch(() => {}) }, 1200)
}

// ★ OAT JS 插件运行时（data/plugins-js/*.mjs）
let jsTools = new Map()      // name -> { description, params, run(pluginTool), plugin }
let jsPluginMeta = []        // [{ file, name, enabled, tools:[], error }]
function jsToolDoc() {
  if (!jsTools.size) return ''
  const lines = [...jsTools.entries()].map(([n, t]) => `- ${n}：${t.description || ''}${t.params ? '　参数：' + Object.keys(t.params).join('、') : ''}　调用示例：{"tool":"${n}",${Object.keys(t.params || {}).map((k) => `"${k}":"..."`).join(',')}}`)
  return `\n【OAT JS 插件工具】\n${lines.join('\n')}`
}
async function loadJsPlugins() {
  jsTools = new Map()
  jsPluginMeta = []
  if (!existsSync(JS_PLUGINS_DIR)) { try { mkdirSync(JS_PLUGINS_DIR, { recursive: true }) } catch { /* ignore */ } ; return }
  let meta = []
  try { meta = JSON.parse(await readFile(path.join(JS_PLUGINS_DIR, 'plugins.json'), 'utf8')) } catch { meta = [] }
  for (const f of await readdir(JS_PLUGINS_DIR)) {
    if (!f.endsWith('.mjs')) continue
    const entry = meta.find((m) => m.file === f) || { file: f, enabled: true }
    const rec = { file: f, name: f.replace(/\.mjs$/, ''), enabled: entry.enabled !== false, tools: [], error: '' }
    if (rec.enabled) {
      try {
        const mod = await import(pathToFileURL(path.join(JS_PLUGINS_DIR, f)).href + '?t=' + Date.now())
        const plugin = mod.default || mod
        rec.name = plugin.name || rec.name
        for (const t of Array.isArray(plugin.tools) ? plugin.tools : []) {
          if (!t?.name || typeof t.run !== 'function') continue
          jsTools.set(t.name, { ...t, plugin: rec.name })
          rec.tools.push(t.name)
        }
      } catch (e) { rec.error = String(e?.message || e) }
    }
    jsPluginMeta.push(rec)
  }
  dbg('jsplugins.loaded', { count: jsPluginMeta.length, tools: [...jsTools.keys()] })
}

/** ★ 当前工作区根目录（所有文件读写/代码视图/GitHub 发布都在这里） */
function getActiveRoot() {
  const w = settings.activeWorkspace && existsSync(settings.activeWorkspace) ? settings.activeWorkspace : WORKSPACE_DIR
  if (!existsSync(w)) { try { mkdirSync(w, { recursive: true }) } catch { /* ignore */ } }
  return w
}
/** ★ 当前工作区内的 artifacts 目录（画板图片保存处） */
function getArtifactDir() {
  const d = path.join(getActiveRoot(), 'artifacts')
  if (!existsSync(d)) { try { mkdirSync(d, { recursive: true }) } catch { /* ignore */ } }
  return d
}

async function ensureDirs() {
  for (const d of [DATA_DIR, WORKSPACE_DIR, ARTIFACT_DIR, TASKS_DIR]) if (!existsSync(d)) await mkdir(d, { recursive: true })
}
async function getCryptoKey() {
  if (!existsSync(KEY_FILE)) await writeFile(KEY_FILE, crypto.randomBytes(32))
  return readFile(KEY_FILE)
}
function encryptText(text, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`
}
function decryptText(payload, key) {
  try {
    const [i, t, d] = payload.split('.')
    const dc = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(i, 'base64'))
    dc.setAuthTag(Buffer.from(t, 'base64'))
    return Buffer.concat([dc.update(Buffer.from(d, 'base64')), dc.final()]).toString('utf8')
  } catch { return '' }
}
async function setSecret(id, value) {
  const key = await getCryptoKey()
  if (value) secrets[id] = encryptText(value, key)
  else delete secrets[id]
  await writeFile(SECRETS_FILE, JSON.stringify(secrets, null, 2), 'utf8')
}
async function getSecret(id) { return secrets[id] ? decryptText(secrets[id], await getCryptoKey()) : '' }
const maskKey = (k) => (!k ? '' : k.length <= 8 ? '••••' : `${k.slice(0, 3)}••••${k.slice(-4)}`)

async function loadData() {
  await ensureDirs()
  const readJson = async (f, def) => { if (!existsSync(f)) return def; try { return JSON.parse(await readFile(f, 'utf8')) } catch { return def } }
  providers = await readJson(PROVIDERS_FILE, [])
  secrets = await readJson(SECRETS_FILE, {})
  // ★ 角色迁移：旧版对象 {id:{...}} → 新版数组 [{id,...}]
  const rawRoles = await readJson(ROLES_FILE, null)
  if (Array.isArray(rawRoles)) roles = rawRoles
  else if (rawRoles && typeof rawRoles === 'object') roles = DEFAULT_ROLES.map((d) => ({ ...d, ...(rawRoles[d.id] || {}) }))
  else roles = DEFAULT_ROLES.map((r) => ({ ...r }))
  for (const r of roles) { r.enabled = r.enabled !== false; r.skills = r.skills || []; if (!r.color) r.color = '#888' }
  rebuildRoleMeta()
  skills = await readJson(SKILLS_FILE, [])
  sessions = await readJson(SESSIONS_FILE, [])
  stats = { ...{ calls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cost: 0, toolCalls: 0, byRole: {}, byModel: {}, updatedAt: 0 }, ...(await readJson(STATS_FILE, {})) }
  plugins = await readJson(PLUGINS_FILE, [])
  settings = { ...settings, ...(await readJson(SETTINGS_FILE, {})) }
  // ★ 更新源默认保留：老配置/分享包里为空时自动填官方仓库（避免每次更新后被清空）
  if (!settings.updateRepo) settings.updateRepo = 'AceTaffer/Open-Agent-Team'
  if (!settings.updateBranch) settings.updateBranch = 'main'
  // ★ 工作区初始化：至少保留默认 workspace，激活目录不存在时回退
  if (!Array.isArray(settings.workspaces) || !settings.workspaces.length) settings.workspaces = [WORKSPACE_DIR]
  if (!settings.activeWorkspace || !existsSync(settings.activeWorkspace)) settings.activeWorkspace = WORKSPACE_DIR
  for (const p of providers) p.models = normalizeModels(p.models)
  await loadVault()
  await loadRoleChats()
  await loadCustomPresets()
  await loadJsPlugins()
  await loadSchedules()
  await loadLocalVoices()
  devices = await readJson(DEVICES_FILE, [])
  if (!Array.isArray(devices)) devices = []
}
const saveProviders = async () => { await writeFile(PROVIDERS_FILE, JSON.stringify(providers, null, 2), 'utf8'); bumpRev('providers') }
const saveRoles = async () => { await writeFile(ROLES_FILE, JSON.stringify(roles, null, 2), 'utf8'); bumpRev('roles') }
const saveSkills = async () => { await writeFile(SKILLS_FILE, JSON.stringify(skills, null, 2), 'utf8'); bumpRev('skills') }
const saveSessions = async () => { await writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8'); bumpRev('sessions') }
const savePlugins = async () => { await writeFile(PLUGINS_FILE, JSON.stringify(plugins, null, 2), 'utf8'); bumpRev('plugins') }
const saveSettings = async () => { await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8'); bumpRev('settings') }
const saveDevices = async () => { await writeFile(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf8'); bumpRev('devices') }

/* ═══════════════════════════════════════════════════════════════
 * 三.5 ★ 定时任务/心跳（借鉴 Paperclip「任务心跳」：无人值守，
 *   按间隔或每日定时自动给团队下达任务；失败 5 分钟后自愈重试，连续 3 次自动停用）
 * ═══════════════════════════════════════════════════════════════ */
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json')
let schedules = []
async function loadSchedules() {
  try { schedules = JSON.parse(await readFile(SCHEDULES_FILE, 'utf8')); if (!Array.isArray(schedules)) schedules = [] } catch { schedules = [] }
  for (const s of schedules) s.activeTaskId = '' // 重启后清理运行态（避免卡死判定）
}
const saveSchedules = () => writeFile(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf8')
function computeNextRun(s) {
  const now = Date.now()
  if (s.kind === 'daily' && /^\d{1,2}:\d{2}$/.test(String(s.at || ''))) {
    const [h, m] = String(s.at).split(':').map(Number)
    const d = new Date(); d.setHours(h, m, 0, 0)
    let t = d.getTime(); if (t <= now) t += 86400000
    return t
  }
  return now + Math.max(1, Number(s.intervalMinutes) || 60) * 60000
}
async function runSchedule(s) {
  const sess = s.sessionId ? sessions.find((x) => x.id === s.sessionId) : null
  const run = createTeamRun(s.task, sess?.id || '')
  s.activeTaskId = run.id
  s.lastRun = Date.now()
  await saveSchedules()
  bumpRev('tasks')
  dbg('schedule.run', { id: s.id, name: s.name })
  try { await runTeam(s.task, { session: sess || undefined, run }) } catch (e) { runEmit(run, { type: 'error', message: e?.message || String(e) }) }
  const done = [...run.buffer].reverse().find((e) => e.type === 'done')
  const ok = !!(done && !done.aborted && !done.budgetStopped)
  s.lastStatus = ok ? 'done' : (done?.aborted ? 'stopped' : 'failed')
  s.lastCost = Number(done?.cost || 0)
  if (ok || done?.aborted) {
    // 成功 / 用户手动终止：不视为失败，按原计划排下一次
    s.consecutiveFails = 0
    s.nextRun = computeNextRun(s)
  } else {
    // 失败自愈：5 分钟后重试；连续 3 次自动停用（避免无人值守时反复烧钱）
    s.consecutiveFails = (s.consecutiveFails || 0) + 1
    if (s.consecutiveFails >= 3) { s.enabled = false; s.nextRun = 0 }
    else s.nextRun = Date.now() + 5 * 60000
  }
  s.activeTaskId = ''
  await saveSchedules()
}
async function checkSchedules() {
  const now = Date.now()
  for (const s of schedules) {
    if (!s.enabled || s.activeTaskId) continue
    if (!s.nextRun || s.nextRun > now) continue
    runSchedule(s).catch(() => {})
  }
}
let schedTimer = null
function startScheduleTicker() {
  if (schedTimer) return
  schedTimer = setInterval(() => { checkSchedules().catch(() => {}) }, 30000)
}

/* ═══════════════════════════════════════════════════════════════
 * 四、调试事件环形缓冲（开发者面板）
 * ═══════════════════════════════════════════════════════════════ */
const debugEvents = []
function dbg(type, data) {
  debugEvents.unshift({ t: Date.now(), type, data })
  if (debugEvents.length > 300) debugEvents.pop()
}

/* ═══════════════════════════════════════════════════════════════
 * 五、余额适配器
 * ═══════════════════════════════════════════════════════════════ */
const joinUrl = (base, sub) => `${String(base || '').replace(/\/+$/, '')}/${String(sub).replace(/^\/+/, '')}`
async function authHeaders(p) { const k = await getSecret(p.id); return k ? { Authorization: `Bearer ${k}` } : {} }
async function queryBalance(provider) {
  const tpl = TEMPLATES[provider.template] || {}
  const adapter = provider.balance || tpl.balance || 'probe'
  const base = provider.baseUrl || tpl.baseUrl || ''
  const headers = await authHeaders(provider)
  if (adapter === 'none') return { ok: true, kind: 'none', note: '本地部署，无需余额' }
  try {
    if (adapter === 'deepseek') {
      const r = await fetch(joinUrl(base, 'user/balance'), { headers })
      const j = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, kind: 'balance', note: `HTTP ${r.status}` }
      const info = j?.balance_infos?.[0]
      return { ok: true, kind: 'balance', amount: info ? Number(info.total_balance) : null, currency: info?.currency || 'CNY', note: j?.is_available === false ? '账户余额不可用' : '正常' }
    }
    if (adapter === 'openrouter') {
      const r = await fetch(joinUrl(base, 'credits'), { headers })
      const j = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, kind: 'balance', note: `HTTP ${r.status}` }
      const d = j?.data || {}
      return { ok: true, kind: 'balance', amount: Number(d.total_credits || 0) - Number(d.total_usage || 0), currency: 'USD', note: `已用 $${Number(d.total_usage || 0).toFixed(2)}` }
    }
    if (adapter === 'moonshot') {
      const r = await fetch(joinUrl(base, 'users/me/balance'), { headers })
      const j = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, kind: 'balance', note: `HTTP ${r.status}` }
      const d = j?.data || {}
      return { ok: true, kind: 'balance', amount: Number(d.available_balance ?? d.cash_balance ?? 0), currency: 'CNY', note: '正常' }
    }
    if (adapter === 'opencode_go') {
      const r = await fetch(joinUrl(base, 'usage'), { headers: { ...headers, 'x-opencode-session': `oat-${crypto.randomUUID()}`, 'x-opencode-client': 'open-agent-team' } })
      const j = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, kind: 'subscription', note: `HTTP ${r.status}（可能未订阅或无权限）` }
      // ★ 订阅窗口：{usage:{rolling:{percent,resetsAt}, weekly:{...}, monthly:{...}}}
      const u = j?.usage || j
      const labelMap = { rolling: '滚动(5h)', weekly: '每周', monthly: '月度' }
      const windows = []
      for (const k of ['rolling', 'weekly', 'monthly']) {
        const w = u?.[k]
        if (w) windows.push({ label: labelMap[k], usedPercent: w.percent ?? w.usedPercent ?? null, resetsAt: w.resetsAt || null, status: w.status || '' })
      }
      if (windows.length) return { ok: true, kind: 'subscription', windows, note: '订阅额度' }
      if (Array.isArray(j?.windows)) return { ok: true, kind: 'subscription', windows: j.windows.map((w) => ({ label: w.label || w.window || '窗口', usedPercent: w.usedPercent ?? w.percent ?? null, resetsAt: w.resetAt || w.resetsAt || null })), note: '订阅额度' }
      return { ok: true, kind: 'quota', note: `已返回额度数据：${JSON.stringify(j).slice(0, 160)}` }
    }
    const r = await fetch(joinUrl(base, 'models'), { headers })
    if (!r.ok) return { ok: false, kind: 'probe', note: `HTTP ${r.status}` }
    const j = await r.json().catch(() => null)
    const count = Array.isArray(j?.data) ? j.data.length : null
    return { ok: true, kind: 'probe', note: count != null ? `连通正常（${count} 个模型，无余额接口）` : '连通正常（无余额接口）' }
  } catch (e) { return { ok: false, kind: 'probe', note: `连接失败：${e?.message || e}` } }
}

/* ═══════════════════════════════════════════════════════════════
 * 六、LLM 调用（带用量统计）
 * ═══════════════════════════════════════════════════════════════ */
async function chatComplete(provider, model, messages, opts = {}) {
  const { stream = false, temperature = 0.7, onDelta = null, onUsage = null, onReasoning = null, sessionId = null } = opts
  const base = provider.baseUrl || TEMPLATES[provider.template]?.baseUrl || ''
  const key = await getSecret(provider.id)
  const headers = { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }
  // ★ OpenCode Go 自 2026-09 起强制要求 x-opencode-session（会话路由/缓存亲和）
  if (/opencode\.ai\/zen/.test(base)) {
    headers['x-opencode-session'] = sessionId || `oat-${crypto.randomUUID()}`
    headers['x-opencode-client'] = 'open-agent-team'
  }
  // ★ 推理强度（deepseek-v4 系列支持 reasoning_effort：none/low/high/max；'default' 时不发送）
  const effort = opts.reasoningEffort != null ? opts.reasoningEffort : settings.reasoningEffort
  const withEffort = effort && effort !== 'default'
  const withJson = !!opts.jsonMode && !stream // ★ JSON 输出模式（用于计划修复等结构化任务）
  const makeBody = (withUsage, useEffort, useJson) => {
    const b = { model, messages, temperature, stream }
    if (withUsage) b.stream_options = { include_usage: true }
    if (useEffort) b.reasoning_effort = effort
    if (useJson) b.response_format = { type: 'json_object' }
    return JSON.stringify(b)
  }
  const t0 = Date.now()
  // ★ 上游无数据超时（30 秒）：避免接口繁忙时请求无限挂死（此前 DeepSeek 官方接口曾整段卡住）
  const IDLE_MS = 30000
  const idleMsg = () => `上游「${provider.name} / ${model}」${IDLE_MS / 1000} 秒无响应，已自动中断（接口可能繁忙或网络异常，请重试或切换模型/厂商）`
  const ac = new AbortController()
  let idleTimer = null
  const bump = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(() => ac.abort(), IDLE_MS) }
  const disarm = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null } }
  const fetchT = async (url, init) => {
    bump()
    try { return await fetch(url, { ...init, signal: ac.signal }) }
    catch (e) { disarm(); if (ac.signal.aborted) throw new Error(idleMsg()); throw e }
  }
  const readT = async (reader) => {
    // ★ 注意：这里不 bump —— 只有真正解析出内容/思考时才重置倒计时，
    //   避免上游只发心跳/空角色事件时"看起来有数据"却永远不出字
    try { return await reader.read() }
    catch (e) { if (ac.signal.aborted) throw new Error(idleMsg()); throw e }
  }
  let r = await fetchT(joinUrl(base, 'chat/completions'), { method: 'POST', headers, body: makeBody(stream, withEffort, withJson) })
  // ★ 瞬时限流/过载（429/5xx）：等待后自动重试（最多 2 次）
  for (let attempt = 0; !r.ok && [429, 500, 502, 503, 504].includes(r.status) && attempt < 2; attempt++) {
    dbg('llm.retry', { provider: provider.name, model, status: r.status, attempt: attempt + 1 })
    await new Promise((res) => setTimeout(res, [5000, 20000][attempt]))
    r = await fetchT(joinUrl(base, 'chat/completions'), { method: 'POST', headers, body: makeBody(stream, withEffort, withJson) })
  }
  // ★ 某些中转不支持 stream_options / reasoning_effort / response_format，遇 400/422 时逐项去掉重试
  if (!r.ok && (r.status === 400 || r.status === 422) && stream) {
    r = await fetchT(joinUrl(base, 'chat/completions'), { method: 'POST', headers, body: makeBody(false, withEffort, withJson) })
  }
  if (!r.ok && (r.status === 400 || r.status === 422) && withEffort) {
    r = await fetchT(joinUrl(base, 'chat/completions'), { method: 'POST', headers, body: makeBody(false, false, withJson) })
  }
  if (!r.ok && (r.status === 400 || r.status === 422) && withJson) {
    r = await fetchT(joinUrl(base, 'chat/completions'), { method: 'POST', headers, body: makeBody(false, false, false) })
  }
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    dbg('llm.error', { provider: provider.name, model, status: r.status, ms: Date.now() - t0 })
    throw new Error(`HTTP ${r.status}：${text.slice(0, 400)}`)
  }
  if (!stream) {
    let j
    try { j = await r.json() } catch (e) { disarm(); if (ac.signal.aborted) throw new Error(idleMsg()); throw e }
    disarm()
    if (j?.usage && onUsage) onUsage(j.usage)
    dbg('llm.done', { provider: provider.name, model, ms: Date.now() - t0, usage: j?.usage })
    return j?.choices?.[0]?.message?.content || ''
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = '', full = '', usage = null, thinkChars = 0
  while (true) {
    const { done, value } = await readT(reader)
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop() || ''
    for (const line of lines) {
      const s = line.trim()
      if (!s.startsWith('data:')) continue
      const data = s.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const j = JSON.parse(data)
        const d = j?.choices?.[0]?.delta
        const delta = d?.content
        if (delta) { full += delta; bump(); if (onDelta) onDelta(delta) }
        // ★ 推理模型（deepseek-reasoner 等）思考过程单独回调，不混入正文
        const think = d?.reasoning_content || d?.reasoning
        if (think) {
          bump()
          thinkChars += think.length
          if (onReasoning) onReasoning(think)
          // ★ 安全阀：只思考不产出，超过约 2 万 token 等价字符就中止（由调用方关闭思考重试），避免烧掉整段输出预算
          if (!full && thinkChars > 80000) { dbg('llm.abort_think_only', { provider: provider.name, model, thinkChars }); try { await reader.cancel() } catch { /* ignore */ } disarm(); return full }
        }
        if (j?.usage) usage = j.usage
      } catch { /* ignore */ }
    }
  }
  disarm()
  if (usage && onUsage) onUsage(usage)
  dbg('llm.done', { provider: provider.name, model, ms: Date.now() - t0, usage })
  return full
}

/* ═══════════════════════════════════════════════════════════════
 * 七、角色提示词（支持自定义覆盖）
 * ═══════════════════════════════════════════════════════════════ */
// ★ ROLE_META 已改为由 roles 数组动态重建（见角色区顶部 rebuildRoleMeta）
const BASE_TOOL_PROTOCOL = `
【工具协议】你可以在回复末尾附加一个或多个工具块（普通文本写在工具块外）：
\`\`\`tool
{"tool":"write_file","path":"相对路径","content":"完整文件内容"}
\`\`\`
\`\`\`tool
{"tool":"read_file","path":"相对路径"}   或   {"tool":"list_files","path":"."}
\`\`\`
\`\`\`tool
{"tool":"run_command","command":"命令行","timeoutMs":30000}
\`\`\`
\`\`\`tool
{"tool":"web_search","query":"搜索关键词","count":5}
\`\`\`
\`\`\`tool
{"tool":"web_fetch","url":"https://...","maxChars":6000}
\`\`\`
\`\`\`tool
{"tool":"kb_search","query":"在本项目文档/知识库里检索的问题或关键词","count":4}
\`\`\`
（kb_search 在工作区的本地知识库索引里检索 md/txt/PDF 等文档，返回命中的文件路径与原文片段）
\`\`\`tool
{"tool":"generate_speech","text":"要配音的文案","out":"audio/vo01.mp3","voice":"Cherry"}
\`\`\`
（TTS 配音；返回音频时长。out/voice 可省略。声音后端为 VoiceStudio 时，voice 传 profile_id 或音色名）
\`\`\`tool
{"tool":"clone_voice","name":"我的声音","sample":"uploads/voice-ref.wav","refText":"可选：样本对应的文字","language":"Auto"}
\`\`\`
（本地声音引擎少样本克隆音色；list:true 查看已有音色。克隆成功后把返回的 profile_id 传给 generate_speech 的 voice）
\`\`\`tool
{"tool":"generate_music","style":"calm","dur":30,"out":"audio/bgm.mp3"}
\`\`\`
（配乐：优先选用工作区 bgm/ 目录音乐（可 pick:"文件名"）；否则用 ffmpeg 合成无版权的氛围垫乐。style: calm/warm/tense/uplift）
\`\`\`tool
{"tool":"media_probe","path":"shots/shot01.mp4","loudness":true}
\`\`\`
（媒体探测：时长/分辨率/帧率/音视频轨/响度，质检用）
\`\`\`tool
{"tool":"make_subtitles","project":"video-project/project.json"}
\`\`\`
（按 project.json 文案与实测配音时长生成 SRT 字幕）
\`\`\`tool
{"tool":"compose_video","project":"video-project/project.json","out":"video-project/cut/final.mp4"}
\`\`\`
（合成成片：归一化镜头→转场拼接→配音+BGM 混音→烧录字幕；缺镜头的场景自动黑场占位）
【图生视频 / 批量生成】generate_video 支持：image（关键帧路径，走图生视频；被拒自动回退文生视频）、out（输出到工程目录而非 artifacts）、shots:[{prompt,image,name,out}]（多镜批量，默认 2 路并发）、aspect（"9:16"/"16:9"）。
\`\`\`tool
{"tool":"ask_role","role":"角色id（如 planner/coder）","question":"想与对方商量/确认的问题"}
\`\`\`
\`\`\`tool
{"tool":"ask_user","questions":[{"question":"想请用户确认的问题","options":["选项A","选项B"]}]}
\`\`\`
（ask_user 会暂停任务等待用户回答，用户答复会作为工具结果返回；需求不明确时应主动提问）
\`\`\`tool
{"tool":"generate_image","prompt":"英文出图提示词","name":"可选文件名","out":"可选：同时保存到工作区此路径，如 video-project/keyframes/k01.png"}
\`\`\`
（generate_image 默认保存到全局 artifacts/；短视频工程请用 out 把关键帧存到 video-project/keyframes/ 下）
\`\`\`tool
{"tool":"generate_video","prompt":"英文视频提示词","name":"可选英文文件名（MP4，自动保存到工作区 artifacts/）"}
\`\`\`
工具在沙箱 workspace/ 内执行（联网工具除外），结果下一轮以【工具结果】发给你。
【运行环境】本软件运行在 Windows（run_command 通过 cmd 执行）：列目录用 dir、读文件用 type、搜索用 findstr；读取与列目录请优先用 read_file / list_files 工具，禁止使用 cat / ls / grep / head / tail 等 Linux 命令。
【JSON 转义】工具块必须是严格合法的 JSON：字符串里的双引号写成 \\"，Windows 路径的反斜杠写成 \\\\（如 "E:\\\\project\\\\a.txt"）；解析失败的工具块不会被执行。`
function pluginToolDoc() {
  if (!plugins.length) return ''
  const lines = plugins.map((p) => `- ${p.name}：${p.description || '外部 API'}　调用示例：{"tool":"http_call","plugin":"${p.name}","args":{${(p.params || []).map((x) => `"${x}":"..."`).join(',')}}}`)
  return `\n【外部 API 插件】可以用 http_call 调用以下自定义接口：\n${lines.join('\n')}`
}
function vaultToolDoc() {
  if (!vault.length) return ''
  const lines = vault.map((v) => `- ${v.name}${v.note ? `（${v.note}）` : ''}：${(v.method || 'GET')} ${(v.baseUrl || '').replace(/\{\{\s*key\s*\}\}/g, '{{key}}')}${(v.baseUrl || '').includes('{{') ? '（URL 中 {{xxx}} 由参数填入）' : ''}`)
  return `\n【凭据保险箱 API】可用 vault_call 调用用户已保存的接口（密钥自动携带，不用你操心）：\n${lines.join('\n')}\n调用示例：{"tool":"vault_call","vault":"服务名称","args":{"参数名":"值"}}`
}
function skillTextFor(role) {
  // ★ 角色绑定的技能预设（Agent Skills）会追加到系统提示词
  return (role.skills || []).map((sid) => skills.find((s) => s.id === sid)).filter(Boolean).map((s) => `【技能：${s.name}】\n${s.prompt}`).join('\n\n')
}
function withSkillsAndTools(role, base) {
  // ★ 协作规则：队友之间直接沟通立即回复，只有重大/无法判断的事项才交给用户
  const collabRule = '【协作规则】需要队友的信息、确认或配合时，直接用 ask_role 联系对方（对方会立即自动回复），不要停下来等用户转达；只有涉及重大决策、需求冲突或信息不足以判断时才用 ask_user 请用户裁决。'
  // ★ 上下文复用：优先使用系统附带的记忆/档案/快照，避免反复读取项目文件（省 token、快、准）
  const reuseRule = '【上下文复用】你的对话历史中包含长期记忆；消息中可能附有「工作区快照」「团队会话档案」。请优先依据这些内容判断当前进度与产物，不要惯性重复 list_files/read_file 全量翻查；仅在确需文件细节时按需读取个别文件。做完事情后请用一两句总结「我做了什么、产物在哪」，便于之后回忆与交接。'
  return [base, skillTextFor(role), collabRule, reuseRule, BASE_TOOL_PROTOCOL + pluginToolDoc() + vaultToolDoc() + jsToolDoc()].filter(Boolean).join('\n\n')
}
function chatSystemPrompt(root = getActiveRoot()) {
  // ★ 单智能体对话：允许直接操作工作区（写文件/跑命令），避免只返回文本
  return `你是 Open Agent Team 的单智能体助手，直接为用户服务。当前工作区目录：${root}
【重要】涉及代码或文件的任务，不要只把代码贴在回复里：必须用 write_file 把完整文件写入工作区（需要时修改已有文件），并用 run_command 运行验证，最后用简洁的话告诉用户文件路径与使用方法。
${BASE_TOOL_PROTOCOL}${pluginToolDoc()}${vaultToolDoc()}${jsToolDoc()}`
}
function defaultPromptFor(role) {
  const id = role.id
  if (id === 'planner') return '你是【策划】。负责需求拆解、技术策略与执行步骤设计，输出结构清晰可落地的方案。不要写代码。'
  if (id === 'artist') return '你是【美术】。负责视觉方案与游戏素材：需要出图时用 generate_image 工具直接生成 PNG（或单独输出 IMAGE_PROMPT: <英文画面描述> 供画板生成），并把素材路径汇总给程序使用。'
  if (id === 'coder') return '你是【程序】。负责编写可运行的代码与文件，并在需要时运行验证。'
  if (id === 'tester') return '你是【测试】。负责运行程序、验证结果、复现问题并报告（含命令与输出摘要）。'
  return `你是【${role.label}】。${role.desc || ''}`
}
function roleSystemPrompt(role) {
  return withSkillsAndTools(role, (role.systemPrompt || '').trim() || defaultPromptFor(role))
}
function leaderSystemPrompt(role) {
  const others = roles.filter((r) => r.enabled !== false && r.id !== role.id).map((r) => `"${r.id}"（${r.label}：${r.desc || ''}）`).join('、')
  const persona = (role.systemPrompt || '').trim() || `你是【${role.label}】，团队的统筹者。`
  // ★ 推荐协作流：策划先出方针 → 程序/美术执行 → 测试验证（角色存在时才建议）
  const flowTips = []
  if (roles.some((r) => r.enabled !== false && r.id === 'planner')) flowTips.push('第一步先派 "planner"（策划）拆解实施方针')
  if (roles.some((r) => r.enabled !== false && r.id === 'tester')) flowTips.push('最后派 "tester"（测试）验证产物')
  const flowText = flowTips.length ? `\n推荐协作流：${flowTips.join('；')}。` : ''
  // ★ 规划规则永远附加（即使用户给队长写了自定义提示词，也必须遵守 JSON 计划格式，否则整个任务无法启动）
  const rules = `【规划规则】你只负责规划与汇总，不要执行任务本身、不要写代码或文件。
【上下文复用】规划前先阅读消息中附带的「工作区快照 / 团队会话档案 / 你的记忆」，据此判断项目当前进度，避免重复翻查文件；仅当信息不足时再读取个别文件。
规划阶段可用的工具：web_search/web_fetch（调研题材背景）、ask_user（向用户提问澄清需求，会暂停等待用户回答）、ask_role（与队员商量）。
【必须】凡是需求存在不明确之处（如题材细节、画风、运行形式、玩法、交付物、素材规格等），你必须先调用 ask_user 逐项向用户提问（每题给出 2~4 个合理选项 + 允许自填），拿到用户答复后才能排出最终计划；禁止自行假设答案代替用户选择。用户已明确的信息才可跳过提问。
收到用户任务后，用 2~4 行说明分工思路，然后在最后输出一个 JSON 计划（\`\`\`json 代码块）：
{"summary":"一句话概括目标","steps":[{"agent":"角色id","title":"步骤标题","instruction":"给该角色智能体的具体指令（含明确产出要求）"}]}
可用角色 id 只能取以下之一：${others}${flowText}
要求：步骤 2~5 个、按依赖顺序、每个步骤有明确产出；除该 JSON 代码块外不要再输出其它规划格式。`
  return [persona, rules, skillTextFor(role)].filter(Boolean).join('\n\n')
}

/* ═══════════════════════════════════════════════════════════════
 * 八、工具执行
 * ═══════════════════════════════════════════════════════════════ */
// ★ 安全审计修复：扩充危险命令黑名单（阻止递归删除/卷影删除/批处理强删等破坏性操作）
const BLOCKED_CMD = [
  /\bformat\b/i, /\bshutdown\b/i, /\brestart-computer\b/i, /\bdiskpart\b/i, /\bmkfs\b/i, /\bdd\s+if=/i,
  /\brmdir\b.*\/s\b/i, /\brd\b.*\/s\b/i, /\bdel\b.*\/[fsq]\b/i, /remove-item\b.*-recurse/i, /remove-item\b.*-force/i,
  /\breg\s+delete\b/i, /\bnet\s+user\b/i, /\bvssadmin\b.*\bdelete\b/i, /\bcipher\s+\/w/i, /\bwbadmin\b.*\bdelete\b/i,
]
function resolveInWorkspace(p, root = getActiveRoot(), allowOutside = false) {
  const abs = path.resolve(root, p || '.')
  const r = path.resolve(root) // ★ 统一规范化（避免正/反斜杠混用导致误判越界）
  if (!allowOutside && abs !== r && !abs.startsWith(r + path.sep)) throw new Error('路径越界（只允许当前工作区内；需要读外部文件请把权限切到「受限」或「完全」）')
  return abs
}
function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
}
async function toolWebSearch({ query, count = 5 }) {
  const n = Math.min(Math.max(Number(count) || 5, 1), 10)
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }
  const engines = []

  // ① DuckDuckGo
  engines.push(async () => {
    const html = await (await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: UA })).text()
    const out = []
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    let m
    while ((m = re.exec(html)) !== null && out.length < n) {
      const url = decodeURIComponent(m[1].replace(/^\/l\/\?uddg=/, '').split('&')[0])
      out.push(`- ${stripHtml(m[2])}\n  ${url}`)
    }
    if (!out.length) throw new Error('无结果')
    return { name: 'DuckDuckGo', text: out.join('\n') }
  })

  // ② Bing
  engines.push(async () => {
    const html = await (await fetch(`https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${n + 5}&mkt=zh-CN`, { headers: UA })).text()
    const out = []
    const re = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/g
    let m
    while ((m = re.exec(html)) !== null && out.length < n) {
      const url = m[1]
      if (url.includes('bing.com') || url.includes('microsoft.com')) continue
      out.push(`- ${stripHtml(m[2])}\n  ${url}\n  ${stripHtml(m[3] || '').slice(0, 180)}`)
    }
    if (!out.length) throw new Error('无结果')
    return { name: 'Bing', text: out.join('\n') }
  })

  // ③ 百度（国内网络兜底）
  engines.push(async () => {
    const html = await (await fetch(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${n}`, { headers: UA })).text()
    const out = []
    const re = /<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    let m
    while ((m = re.exec(html)) !== null && out.length < n) {
      const title = stripHtml(m[2])
      if (!title || title.length < 3) continue
      out.push(`- ${title}\n  ${stripHtml(m[1])}`)
    }
    if (!out.length) throw new Error('无结果')
    return { name: '百度', text: out.join('\n') }
  })

  // ④ 搜狗
  engines.push(async () => {
    const html = await (await fetch(`https://www.sogou.com/web?query=${encodeURIComponent(query)}`, { headers: UA })).text()
    const out = []
    const re = /<h3[^>]*class="vr-title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    let m
    while ((m = re.exec(html)) !== null && out.length < n) {
      let url = m[1]
      if (url.startsWith('/')) url = 'https://www.sogou.com' + url
      out.push(`- ${stripHtml(m[2])}\n  ${url}`)
    }
    if (!out.length) throw new Error('无结果')
    return { name: '搜狗', text: out.join('\n') }
  })

  const errs = []
  for (const eng of engines) {
    try { const r = await eng(); dbg('web_search', { engine: r.name, query }); return `搜索「${query}」（${r.name}）：\n${r.text}` } catch (e) { errs.push(e.message) }
  }
  return `联网搜索失败（DuckDuckGo / Bing / 百度 / 搜狗 均不可用）：${errs.join(' | ')}`
}
async function toolWebFetch({ url, maxChars = 6000 }) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' })
    const text = stripHtml(await r.text())
    return `抓取 ${url}（HTTP ${r.status}）：\n${text.slice(0, Math.min(Number(maxChars) || 6000, 20000))}`
  } catch (e) { return `抓取失败：${e.message}` }
}
async function toolHttpCall({ plugin, args = {} }) {
  const p = plugins.find((x) => x.name === plugin || x.id === plugin)
  if (!p) return `没有找到名为「${plugin}」的插件，请先在「插件」页添加。`
  const sub = (s) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => encodeURIComponent(args[k] ?? ''))
  const subRaw = (s) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(args[k] ?? ''))
  try {
    const url = sub(p.url)
    const headers = {}
    for (const [k, v] of Object.entries(p.headers || {})) headers[k] = subRaw(v)
    let body = null
    if ((p.method || 'GET').toUpperCase() !== 'GET' && p.body) {
      body = subRaw(p.body)
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json'
    }
    const r = await fetch(url, { method: (p.method || 'GET').toUpperCase(), headers, body })
    const text = await r.text()
    dbg('plugin.call', { plugin: p.name, status: r.status })
    return `插件「${p.name}」返回 HTTP ${r.status}：\n${text.slice(0, 6000)}`
  } catch (e) { return `插件「${p.name}」调用失败：${e.message}` }
}
// ★ 凭据保险箱 API 调用：密钥自动附带（默认 Authorization: Bearer，可自定义认证头或 URL 里用 {{key}}）
async function toolVaultCall({ vault: key, args = {}, method, body: rawBody }) {
  const v = vault.find((x) => x.name === key || x.id === key)
  if (!v) return `保险箱中没有名为「${key}」的 API，请先在「API 仓库 → 凭据保险箱」保存，或核对名称。`
  let secret = ''
  try { secret = decryptText(v.keyCipher, await vaultGetKey()) || '' } catch { /* ignore */ }
  const enc = (s) => encodeURIComponent(String(s ?? ''))
  const sub = (s, encode = true) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k === 'key' ? (encode ? enc(secret) : secret) : (encode ? enc(args[k] ?? '') : String(args[k] ?? ''))))
  try {
    const url = sub(v.baseUrl || '')
    if (!url) return '该保险箱条目没有填写接口地址。'
    const m = String(method || v.method || 'GET').toUpperCase()
    const headers = {}
    if (secret) {
      const auth = String(v.authHeader || '').trim() || 'Authorization: Bearer {{key}}'
      const idx = auth.indexOf(':')
      if (idx > 0) headers[auth.slice(0, idx).trim()] = sub(auth.slice(idx + 1).trim(), false)
      else headers.Authorization = `Bearer ${secret}`
    }
    let payload = null
    if (m !== 'GET' && m !== 'HEAD') {
      payload = rawBody != null ? String(rawBody) : JSON.stringify(args)
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json'
    }
    const r = await fetch(url, { method: m, headers, body: payload })
    const text = await r.text()
    dbg('vault.call', { name: v.name, status: r.status })
    return `保险箱「${v.name}」返回 HTTP ${r.status}：\n${text.slice(0, 6000)}`
  } catch (e) { return `保险箱「${v.name}」调用失败：${e.message}` }
}
async function toolRunExe({ path: exePath, args = [], cwd = '', timeoutMs = 120000 }) {
  if (!settings.exeEnabled) return '本地程序调用未启用（请到「调试」页开启「允许调用本地程序」）。'
  const norm = path.resolve(exePath)
  const allowed = (settings.exeAllowlist || []).some((a) => path.resolve(a).toLowerCase() === norm.toLowerCase())
  if (!allowed) return `路径不在白名单：${norm}\n请先在「调试」页把该程序加入白名单。`
  if (!existsSync(norm)) return `程序不存在：${norm}`
  try {
    const workdir = cwd ? path.resolve(cwd) : path.dirname(norm)
    // ★ 安全审计修复：改用 execFile（不经过 shell、参数按数组传递），
    //   杜绝通过参数内嵌引号（如 x" & calc & "）实现命令注入
    const argArr = (Array.isArray(args) ? args : []).map((a) => String(a))
    const { stdout, stderr } = await execFileAsync(norm, argArr, { cwd: workdir, timeout: Math.min(Number(timeoutMs) || 120000, 300000), maxBuffer: 4 * 1024 * 1024, windowsHide: true })
    dbg('exe.run', { path: norm, args: argArr })
    return `$ ${path.basename(norm)} ${argArr.join(' ')}\n${(stdout || '') + (stderr ? '\n[stderr]\n' + stderr : '')}`.slice(0, 8000) || '（无输出）'
  } catch (e) { return `程序执行失败：${e.message}` }
}
function extractToolCalls(text) {
  const calls = []
  const re = /```tool\s*([\s\S]*?)```/g
  let m
  while ((m = re.exec(text)) !== null) {
    try { const j = JSON.parse(m[1].trim()); if (j && j.tool) calls.push(j) } catch { /* ignore */ }
  }
  // ★ 兼容部分模型自创的伪标签（如 deepseek-chat 的 <ask_user>…</ask_user>）：
  // 转成真实提问，任务会暂停等待用户回答，而不是只把问题当普通文字
  if (!calls.length) {
    const am = text.match(/<ask_user>([\s\S]*?)<\/ask_user>/i)
    if (am && am[1].trim()) calls.push({ tool: 'ask_user', questions: [{ question: am[1].trim().slice(0, 2000) }] })
  }
  return calls
}
async function runTool(call, opts = {}) {
  // ★ root 参数：单智能体会话可指定自己的会话工作区（缺省用全局当前工作区）
  const root = opts.root && existsSync(opts.root) ? opts.root : getActiveRoot()
  try {
    dbg('tool.call', { tool: call.tool, detail: call.path || call.command || call.query || call.plugin || '', root })
    statsAdd({ toolCalls: 1 })
    // ★ OAT JS 插件工具优先分发
    const jt = jsTools.get(call.tool)
    if (jt) {
      const out = await jt.run(call.args || call, { workspace: root, log: (m) => dbg('jsplugin.log', { plugin: jt.plugin, message: String(m) }) })
      return (typeof out === 'string' ? out : JSON.stringify(out)).slice(0, 8000)
    }
    if (call.tool === 'write_file') { const abs = resolveInWorkspace(call.path, root, false); await mkdir(path.dirname(abs), { recursive: true }); await writeFile(abs, String(call.content ?? ''), 'utf8'); return `已写入 ${call.path}（${Buffer.byteLength(String(call.content ?? ''))} 字节）` }
    if (call.tool === 'read_file') { const t = await readFile(resolveInWorkspace(call.path, root, opts.allowOutside), 'utf8'); return t.length > 8000 ? t.slice(0, 8000) + '\n…（截断）' : t }
    if (call.tool === 'list_files') { const es = await readdir(resolveInWorkspace(call.path || '.', root, opts.allowOutside), { withFileTypes: true }); return es.map((e) => (e.isDirectory() ? `[目录] ${e.name}` : `[文件] ${e.name}`)).join('\n') || '(空)' }
    if (call.tool === 'run_command') {
      const cmd = String(call.command || '')
      if (BLOCKED_CMD.some((re) => re.test(cmd))) return `已拒绝执行（命中安全黑名单）：${cmd}`
      // ★ Windows 环境：模型常误用 Linux 命令，直接给出可执行的替代方案（避免"结果像丢了"）
      const first = cmd.trim().split(/\s+/)[0].replace(/^.*[\\/]/, '').toLowerCase()
      const unixHint = { cat: '读取文件请直接用 read_file 工具（或 Windows 命令 type）', ls: '列目录请直接用 list_files 工具（或 Windows 命令 dir）', grep: '搜索文本可用 Windows 命令 findstr，或先 read_file 再分析', head: '可用 read_file 工具读取（超长内容会截断）', tail: '可用 read_file 工具读取（超长内容会截断）', pwd: '可用 list_files 工具查看当前工作区，或 Windows 命令 cd', rm: '删除文件请说明原因并征得用户同意，或使用 Windows 命令 del' }[first]
      if (unixHint) return `未执行：${first} 是 Linux 命令，Windows 环境不可用。${unixHint}。`
      const { stdout, stderr } = await execAsync(cmd, { cwd: root, timeout: Math.min(Number(call.timeoutMs) || 30000, 120000), maxBuffer: 4 * 1024 * 1024, windowsHide: true })
      return (`$ ${cmd}\n${stdout || ''}${stderr ? '\n[stderr]\n' + stderr : ''}`).slice(0, 8000) || `$ ${cmd}\n(无输出)`
    }
    if (call.tool === 'web_search') return await toolWebSearch(call)
    if (call.tool === 'web_fetch') return await toolWebFetch(call)
    // ★ 本地知识库检索（RAG）：在项目文档里查相关内容
    if (call.tool === 'kb_search') {
      const q = String(call.query || '').trim()
      if (!q) return '缺少 query（要检索的问题/关键词）'
      const res = await kbSearch(root, q, Math.min(8, Number(call.count) || 4))
      if (!res.length) return '（知识库未命中：可换个关键词，或在设置页点「重建索引」；也可能是工作区暂无文档）'
      return res.map((r, i) => `${i + 1}. 《${r.path}》（相关度 ${r.score}）\n${r.excerpt}`).join('\n\n')
    }
    if (call.tool === 'http_call') return await toolHttpCall(call)
    if (call.tool === 'vault_call') return await toolVaultCall(call)
    if (call.tool === 'run_exe') return await toolRunExe(call)
    // ★ 媒体工具链（短视频流水线）
    if (call.tool === 'media_probe') {
      const p = String(call.path || call.file || '').trim()
      if (!p) return '缺少 path（要探测的媒体文件，相对工作区）'
      const abs = resolveInWorkspace(p, root)
      if (!existsSync(abs)) return `文件不存在：${p}`
      const info = await probeMedia(abs, { loudness: call.loudness !== false })
      return JSON.stringify(info, null, 2)
    }
    if (call.tool === 'generate_speech') return await generateSpeech(call, { root })
    if (call.tool === 'clone_voice') return await toolCloneVoice(call, { root })
    if (call.tool === 'generate_music') return await generateMusic(call, { root })
    if (call.tool === 'make_subtitles') return await makeSubtitles(call, { root })
    if (call.tool === 'compose_video') return await composeVideo(call, { root }, opts.onProgress)
    if (call.tool === 'generate_image') {
      const target = resolveArtTarget(call)
      if (!target) return '未找到可用的出图模型：请先在「画板」选择出图模型（会自动记住），或在调用里指定 providerId/model。'
      const urls = await generateImage(target.provider, target.model, String(call.prompt || ''), call.name)
      return `已生成图片（PNG，保存在当前工作区 artifacts/，可用相对路径引用）：\n${urls.join('\n')}`
    }
    return `未知工具：${call.tool}`
  } catch (e) { return `工具执行失败：${e?.message || e}` }
}

/* ═══════════════════════════════════════════════════════════════
 * 8.5 ★ 会话权限（查看/修改/受限/完全）与步骤确认
 * ═══════════════════════════════════════════════════════════════ */
const PERMISSIONS = ['view', 'modify', 'limited', 'full']
const READ_TOOLS = new Set(['read_file', 'list_files', 'web_search', 'web_fetch', 'kb_search', 'media_probe'])
const WRITE_TOOLS = new Set(['write_file', 'generate_speech', 'generate_music', 'make_subtitles', 'compose_video', 'clone_voice'])
const EXEC_TOOLS = new Set(['run_command', 'run_exe'])
function toolCategory(call) {
  if (READ_TOOLS.has(call.tool)) return 'read'
  if (WRITE_TOOLS.has(call.tool)) return 'write'
  if (EXEC_TOOLS.has(call.tool)) return 'exec'
  return 'other' // http_call / JS 插件工具等
}
function permissionCheck(perm, cat) {
  if (perm === 'full') return { allow: true, confirm: false } // 完全权限：减少确认、允许敏感操作
  if (perm === 'view') return cat === 'read' ? { allow: true, confirm: false } : { allow: false, confirm: false, reason: '当前会话权限为「查看」，仅允许读取查看（如需操作请切换到更高权限）' }
  if (perm === 'modify') return cat === 'read' ? { allow: true, confirm: false } : { allow: true, confirm: true }
  if (perm === 'limited') return cat === 'read' ? { allow: true, confirm: false } : { allow: true, confirm: true }
  return { allow: true, confirm: true }
}
function toolDetailOf(call) { return call.path || call.command || call.query || call.plugin || call.url || call.question || call.role || '' }
// ★ 工具调用次数限制：0=无限（默认）、-1=禁止、N=最多 N 次；角色可单独覆盖
function effectiveToolLimit(role, ctxKey) {
  const rv = role && role.toolLimit !== '' && role.toolLimit != null ? Number(role.toolLimit) : null
  if (rv != null && Number.isFinite(rv)) return Math.max(-1, Math.trunc(rv))
  const g = settings.toolLimits ? settings.toolLimits[ctxKey] : 0
  return Number.isFinite(Number(g)) ? Number(g) : 0
}
// ★ 权限申请：工具被权限拦截时向用户弹卡片申请（允许一次 / 本任务全部允许 / 拒绝）
const pendingPermReqs = new Map()
function waitPermReq(id, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pendingPermReqs.delete(id); resolve('deny') }, timeoutMs)
    pendingPermReqs.set(id, (d) => { clearTimeout(timer); pendingPermReqs.delete(id); resolve(d) })
  })
}

// ★ 角色 → 可用的对话 API/模型（自动跳过出图/实时等非对话模型，大模型优先兜底）
function resolveRoleTarget(role) {
  const provider = providers.find((p) => p.id === role.providerId) || providers[0]
  if (!provider) return null
  const isNonChat = (m) => (m?.tags || []).some((t) => ['出图', '视频', '语音', '嵌入', '重排'].includes(t))
  const badId = /realtime|audio|tts|asr|omni|image|video|voice|embedding|rerank/i
  const score = (m) => {
    let s = 0
    if (/max/i.test(m.id)) s += 3
    else if (/plus/i.test(m.id)) s += 2
    if (/^qwen|^deepseek/i.test(m.id)) s += 1
    if (/flash|mini|nano|tiny|lite|preview|exp/i.test(m.id)) s -= 2
    return s
  }
  const cands = (provider.models || []).filter((m) => !isNonChat(m) && !badId.test(m.id)).sort((a, b) => score(b) - score(a))
  const fallback = cands[0]?.id || provider.models?.[0]?.id
  const chosen = provider.models?.find((m) => m.id === role.model)
  const model = (role.model && !(chosen && isNonChat(chosen)) ? role.model : null) || fallback
  if (!model) return null
  if (model !== role.model) dbg('role.fallback_model', { role: role.id, from: role.model, to: model })
  return { provider, model }
}

// ★ 角色间协作：询问另一个角色并拿到它的专业意见
async function askRoleImpl(call, ctx = {}) {
  const role = findRole(call.role || call.agent)
  if (!role) return `未找到角色「${call.role}」，可用角色：${roles.map((r) => `${r.id}（${r.label}）`).join('、')}`
  const target = resolveRoleTarget(role)
  if (!target) return `角色「${role.label}」没有可用的对话模型`
  const caller = ctx.agentId ? findRole(ctx.agentId) : null
  const question = String(call.question || call.query || '').slice(0, 2000)
  try {
    const answer = await chatComplete(target.provider, target.model, [
      { role: 'system', content: roleSystemPrompt(role) },
      ...roleChatHistory(role.id, 60, 6000),
      { role: 'user', content: `${ctx.task ? `【总任务】${ctx.task}\n` : ''}【来自队友${caller ? `「${caller.label}」` : ''}的协作询问】${question}\n请用简体中文直接给出你的专业意见，简洁明确（不要调用工具、不要执行任务本身）。` },
    ], {
      stream: false, temperature: 0.4,
      onUsage: (u) => { const cost = calcCost(getPrice(target.provider, target.model), u); statsAdd({ role: role.id, model: target.model, usage: u, cost: cost || 0 }); ctx.reportUsage?.(role.id, target.provider, target.model, u) },
    })
    // ★ 被询问方留痕：之后与用户单独对话时能记得这次协作（两边同步的关键）
    roleChatAppend(role.id, 'user', `${caller ? `【队友「${caller.label}」的协作询问】` : '【队友的协作询问】'}${question}`)
    roleChatAppend(role.id, 'assistant', answer || '')
    return `【${role.label} 的回复】\n${answer || '（对方没有给出内容）'}`
  } catch (e) { return `询问「${role.label}」失败：${e.message}` }
}

// ★ 用户提问（队长规划阶段使用）：AI 提问 → 暂停等待用户作答
const pendingQuestions = new Map()
function waitAnswer(id, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pendingQuestions.delete(id); resolve(null) }, timeoutMs)
    pendingQuestions.set(id, (answer) => { clearTimeout(timer); pendingQuestions.delete(id); resolve(answer) })
  })
}
async function toolAskUser(call, onQuestion) {
  const id = crypto.randomUUID()
  const questions = (Array.isArray(call.questions) && call.questions.length ? call.questions : [{ question: call.question || '请补充你的需求与偏好' }]).slice(0, 6)
  onQuestion({ id, questions })
  const answer = await waitAnswer(id)
  return answer == null ? '（用户暂未回答，已超时）请基于合理默认值继续。' : `用户答复如下：\n${answer}`
}

// ★ 团队任务中途指令：用户可对单个角色（或全体 *）追加指令
const teamSteers = new Map()

// ★ 出图目标：优先 画板保存的选择 → 指定参数 → 第一个带出图模型的 API
function resolveArtTarget(call = {}) {
  const hasImg = (p) => (p.models || []).some((m) => (m.tags || []).includes('出图'))
  const provider = providers.find((p) => p.id === call.providerId) || providers.find((p) => p.id === settings.artProvider && hasImg(p)) || providers.find(hasImg)
  if (!provider) return null
  const imgModels = (provider.models || []).filter((m) => (m.tags || []).includes('出图'))
  const model = call.model || (provider.id === settings.artProvider ? settings.artModel : '') || imgModels[0]?.id
  return model ? { provider, model } : null
}

// ★ 步骤确认：AI 请求 → 用户在界面选择「允许一次 / 本会话全部允许 / 拒绝」
const pendingConfirms = new Map()
function waitConfirm(id, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pendingConfirms.delete(id); resolve('deny') }, timeoutMs)
    pendingConfirms.set(id, (decision) => { clearTimeout(timer); pendingConfirms.delete(id); resolve(decision) })
  })
}
async function runToolGuarded(call, ctx = {}) {
  // ctx: { root, permission, session, autoState, onConfirm, onImage, onQuestion, reportUsage, task }
  // ★ 向用户提问 / 角色间协作询问：只读操作，不占工作区权限
  if (call.tool === 'ask_user') return await toolAskUser(call, ctx.onQuestion)
  if (call.tool === 'ask_role') {
    // 兼容模型把「问用户」写成 ask_role role=user 的情况
    if (/^(user|用户|玩家)$/i.test(String(call.role || '')) && typeof ctx.onQuestion === 'function') return await toolAskUser({ question: call.question || call.query }, ctx.onQuestion)
    // ★ 广播协作询问事件（界面上可见 谁→谁 的交流）
    const to = findRole(call.role || call.agent)
    const info = { from: ctx.agentId || '', to: to?.id || String(call.role || ''), question: String(call.question || call.query || '').slice(0, 1000) }
    ctx.onAsk?.(info)
    const ans = await askRoleImpl(call, ctx)
    ctx.onAskDone?.({ ...info, answer: String(ans).slice(0, 1200) })
    return ans
  }
  const perm = ctx.autoState?.permGranted ? 'full' : (PERMISSIONS.includes(ctx.permission) ? ctx.permission : 'modify')
  const cat = toolCategory(call)
  const chk = permissionCheck(perm, cat)
  if (!chk.allow) {
    // ★ 主动申请权限：弹卡片让用户点选（允许一次 / 本任务全部允许 / 拒绝）
    if (typeof ctx.onPermRequest === 'function') {
      const decision = await ctx.onPermRequest({ tool: call.tool, category: cat, reason: chk.reason })
      if (decision === 'deny') return `⛔ ${chk.reason}（用户拒绝了本次授权；请不要反复重试同一操作，改为向用户说明情况）`
      if (decision === 'all') { ctx.autoState.permGranted = true }
      return await runToolGuarded(call, { ...ctx, permission: 'full', onPermRequest: undefined, autoState: ctx.autoState || {} })
    }
    return `⛔ ${chk.reason}`
  }
  const autoApprove = ctx.autoState?.approvedAll || ctx.session?.autoApprove
  if (chk.confirm && !autoApprove && typeof ctx.onConfirm === 'function') {
    const id = crypto.randomUUID()
    ctx.onConfirm({ id, tool: call.tool, category: cat, detail: toolDetailOf(call), preview: call.content ? String(call.content).slice(0, 600) : (call.command || call.prompt || '') })
    const decision = await waitConfirm(id)
    if (decision === 'deny') return '⛔ 用户拒绝了该操作，请换个方式或先询问用户。'
    if (decision === 'all') {
      if (ctx.autoState) ctx.autoState.approvedAll = true
      if (ctx.session) { ctx.session.autoApprove = true; saveSessions().catch(() => {}) }
    }
  }
  // ★ 视频：支持批量多镜、图生视频（image 关键帧）、指定输出路径（out）、进度上报
  if (call.tool === 'generate_video') {
    const target = resolveVideoTarget(call)
    if (!target) return '未找到可用的视频模型：请先在「视频」页选择视频模型（会自动记住），或在调用里指定 providerId/model。'
    const jobs = Array.isArray(call.shots) && call.shots.length ? call.shots.slice(0, 8) : [{ prompt: call.prompt, name: call.name, image: call.image, out: call.out }]
    if (!jobs.some((j) => String(j.prompt || '').trim())) return '缺少 prompt（视频提示词）。'
    const vroot = ctx.root && existsSync(ctx.root) ? ctx.root : getActiveRoot()
    const aspect = call.aspect || (call.size === '720*1280' ? '9:16' : '')
    const conc = Math.max(1, Math.min(3, Number(call.concurrency) || 2))
    const results = new Array(jobs.length).fill(null)
    let finished = 0
    const runOne = async (job, idx) => {
      const prompt = String(job.prompt || '').trim()
      if (!prompt) { results[idx] = { skip: true }; finished++; return }
      const isI2V = !!job.image
      const name = job.name || (call.out ? '' : `shot${String(idx + 1).padStart(2, '0')}`)
      try {
        ctx.onProgress?.({ phase: `镜头 ${idx + 1}/${jobs.length}`, detail: `${isI2V ? '图生视频' : '文生视频'}：${prompt.slice(0, 50)}`, pct: Math.round(finished / jobs.length * 100) })
        ctx.onImage?.({ phase: 'start', kind: 'video', prompt, name })
        const urls = await generateVideo(target.provider, target.model, prompt, name, {
          image: job.image || '',
          out: job.out || call.outDir ? (job.out || `${String(call.outDir).replace(/\/$/, '')}/${String(job.name || `shot${idx + 1}`)}.mp4`) : '',
          root: vroot, aspect, size: call.size,
        })
        const relPath = urls[1] || urls[0]
        if (!job.out && !call.outDir) await recordArt(urls.slice(0, 1), { prompt, model: target.model, provider: target.provider.name, providerId: target.provider.id, role: ctx.agentId || 'chat', kind: 'video' })
        ctx.onImage?.({ phase: 'done', kind: 'video', prompt, ok: true })
        results[idx] = { ok: true, path: relPath, prompt }
      } catch (e) {
        ctx.onImage?.({ phase: 'done', kind: 'video', prompt, ok: false })
        results[idx] = { ok: false, error: e.message, prompt }
      }
      finished++
      ctx.onProgress?.({ phase: `镜头 ${idx + 1}/${jobs.length}`, detail: results[idx]?.ok ? `完成：${results[idx].path}` : `失败：${results[idx]?.error || ''}`, pct: Math.round(finished / jobs.length * 100) })
    }
    // 小型并发池（默认 2 路）
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(conc, jobs.length) }, async () => {
      while (cursor < jobs.length) { const idx = cursor++; await runOne(jobs[idx], idx) }
    }))
    const okList = results.filter((r) => r && r.ok)
    const failList = results.map((r, i) => ({ r, i })).filter((x) => x.r && !x.r.ok)
    const lines = okList.map((r) => `- ${r.path}`).join('\n') || '（无）'
    const failLines = failList.map((x) => `- 第 ${x.i + 1} 镜失败：${x.r.error}`).join('\n')
    return `视频生成完成：成功 ${okList.length}/${jobs.length}\n${lines}${failLines ? `\n失败：\n${failLines}` : ''}\n（请把 shot 路径登记到 project.json 对应场景；失败镜头应调整提示词重试）`
  }
  // ★ 出图：生成 → 交由用户审核（保留/重画/删除）→ 通过后才返回给 AI 使用
  if (call.tool === 'generate_image') {
    const target = resolveArtTarget(call)
    if (!target) return '未找到可用的出图模型：请先在「画板」选择出图模型（会自动记住），或在调用里指定 providerId/model。'
    let prompt = String(call.prompt || '').trim()
    if (!prompt) return '缺少 prompt（出图提示词）。'
    let name = call.name ? String(call.name) : ''
    for (let round = 0; round < 4; round++) {
      if (ctx.run && !(await waitWhilePaused(ctx.run, ctx.agentId || '*'))) return '⛔ 任务已终止。'
      try {
        ctx.onImage?.({ phase: 'start', prompt, name })
        const urls = await generateImage(target.provider, target.model, prompt, name)
        await recordArt(urls, { prompt, model: target.model, provider: target.provider.name, providerId: target.provider.id, role: ctx.agentId || 'chat', keep: true })
        ctx.onImage?.({ phase: 'done', prompt, ok: true })
        // ★ out 参数：把生成的图片同时保存到工作区指定路径（短视频工程的关键帧等需要放在会话工作区内）
        let outRel = ''
        if (call.out && urls.length) {
          try {
            const targetAbs = resolveInWorkspace(String(call.out), ctx.root)
            await mkdir(path.dirname(targetAbs), { recursive: true })
            const srcAbs = path.join(getArtifactDir(), path.basename(artRelOf(urls[0])))
            await copyFile(srcAbs, targetAbs)
            outRel = String(call.out).replace(/\\/g, '/')
          } catch { /* ignore */ }
        }
        const auto = ctx.autoState?.approvedAll || ctx.session?.autoApprove
        if (auto || typeof ctx.onImageReview !== 'function') return outRel ? `已生成图片并保存到 ${outRel}（PNG，工作区相对路径，可直接登记到 project.json）\n（预览：${urls.join('\n')}）` : `已生成图片（PNG，保存在当前工作区 artifacts/，可用相对路径引用）：\n${urls.join('\n')}`
        const id = crypto.randomUUID()
        ctx.onImageReview({ id, urls, prompt })
        const decision = await waitReview(id)
        if (!decision || decision.action === 'keep') return `已生成图片（用户已确认保留，PNG 在工作区 artifacts/）：\n${urls.join('\n')}`
        if (decision.action === 'delete') {
          await deleteArtFiles(urls.map((u) => path.basename(artRelOf(u))), true)
          return '用户认为这张图片不符合需要并已删除。请调整提示词/构图/画风后重新生成，或先用 ask_user 向用户确认想要的画面。'
        }
        if (decision.action === 'regen') {
          if (decision.prompt && String(decision.prompt).trim()) prompt = String(decision.prompt).trim()
          name = ''
          continue
        }
        return `已生成图片（PNG，保存在工作区 artifacts/）：\n${urls.join('\n')}`
      } catch (e) {
        ctx.onImage?.({ phase: 'done', prompt, ok: false })
        return `图片生成失败：${e.message}`
      }
    }
    return '该图多次未通过用户审核，已停止生成。请先与用户确认画面需求再继续。'
  }
  const allowOutside = perm === 'limited' || perm === 'full'
  return await runTool(call, { root: ctx.root, allowOutside, onProgress: typeof ctx.onProgress === 'function' ? ctx.onProgress : undefined })
}
function normalizePlan(j) {
  // ★ 兼容多种模型输出格式：steps/plan.steps/数组、字段别名 agent/role/who 等
  if (!j) return null
  if (Array.isArray(j)) j = { summary: '', steps: j }
  if (typeof j !== 'object') return null
  const raw = j.steps || j.plan?.steps || j.tasks || j['步骤']
  if (!Array.isArray(raw)) return null
  const steps = raw.map((s) => {
    if (!s || typeof s !== 'object') return null
    const agent = s.agent || s.role || s.who || s.id || s.角色
    const title = s.title || s.name || s.task || s.标题 || '步骤'
    const instruction = s.instruction || s.detail || s.desc || s.description || s.content || s.说明 || s.title || ''
    if (!agent || !instruction) return null
    const matched = findRole(agent) // ★ 把「程序/测试」这类中文角色名映射回角色 id
    return { agent: matched ? matched.id : String(agent), title: String(title), instruction: String(instruction) }
  }).filter(Boolean).slice(0, 6)
  if (!steps.length) return null
  return { summary: String(j.summary || j.概要 || ''), steps }
}
function extractPlan(text) {
  if (!text || typeof text !== 'string') return null
  const cands = []
  // 1) 所有 fenced 代码块（json 优先，但不限语言）
  const fenceJson = /```json\s*([\s\S]*?)```/gi
  let m
  while ((m = fenceJson.exec(text)) !== null) cands.push(m[1])
  const fenceAny = /```[a-z]*\s*([\s\S]*?)```/gi
  while ((m = fenceAny.exec(text)) !== null) cands.push(m[1])
  // 2) 从每个 "steps" 关键词向前找到 JSON 对象起点，括号配对截取（避免被前后文字干扰）
  let at = -1
  while ((at = text.indexOf('"steps"', at + 1)) !== -1) {
    const s = text.lastIndexOf('{', at)
    if (s < 0) continue
    let depth = 0, end = -1
    for (let p = s; p < text.length; p++) {
      if (text[p] === '{') depth++
      else if (text[p] === '}') { depth--; if (depth === 0) { end = p; break } }
    }
    if (end > at) cands.push(text.slice(s, end + 1))
  }
  // 3) 整段就是一个 JSON
  cands.push(text.trim())
  // 4) 裸步骤数组（没有 steps 字段）：[{...},{...}]
  const arrRe = /\[\s*\{[\s\S]*?"agent"[\s\S]*?\}\s*\]/g
  let am
  while ((am = arrRe.exec(text)) !== null) cands.push(am[0])
  for (const c of cands) {
    try { const plan = normalizePlan(JSON.parse(c.trim())); if (plan) return plan } catch { /* next */ }
  }
  return null
}

/* ═══════════════════════════════════════════════════════════════
 * 九、GitHub 集成（纯 REST，无需 git）
 * ═══════════════════════════════════════════════════════════════ */
const GH_API = 'https://api.github.com'
async function gh(pathname, opts = {}) {
  const token = await getSecret('github')
  if (!token) throw new Error('尚未配置 GitHub Token')
  const r = await fetch(`${GH_API}${pathname}`, {
    method: opts.method || 'GET',
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ai-workstation', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: 'follow',
  })
  const isJson = (r.headers.get('content-type') || '').includes('json')
  const data = isJson ? await r.json().catch(() => null) : null
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}：${data?.message || (await r.text().catch(() => '')).slice(0, 200)}`)
  return data
}
async function ghStatus() {
  const token = await getSecret('github')
  if (!token) return { ok: true, hasToken: false, login: '' }
  try {
    const me = await gh('/user')
    settings.githubLogin = me.login
    await saveSettings()
    return { ok: true, hasToken: true, login: me.login }
  } catch (e) { return { ok: true, hasToken: true, login: settings.githubLogin || '', error: e.message } }
}
async function ghClone(repo, dir) {
  const token = await getSecret('github')
  const m = String(repo).match(/(?:github\.com\/)?([^/\s]+)\/([^/\s#]+?)(?:\.git)?$/)
  if (!m) throw new Error('仓库格式应为 owner/name 或 GitHub 链接')
  const [, owner, name] = m
  const target = resolveInWorkspace(dir || name)
  if (existsSync(target)) throw new Error(`目录已存在：${dir || name}`)
  const r = await fetch(`${GH_API}/repos/${owner}/${name}/tarball`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ai-workstation' }, redirect: 'follow' })
  if (!r.ok) throw new Error(`下载失败 HTTP ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  await mkdir(target, { recursive: true })
  const tmp = path.join(WORKSPACE_DIR, `.tmp-${Date.now()}.tar.gz`)
  await writeFile(tmp, buf)
  try { await execAsync(`tar -xzf "${tmp}" -C "${target}" --strip-components 1`, { timeout: 120000, windowsHide: true }) }
  finally { await rm(tmp, { force: true }) }
  dbg('github.clone', { repo: `${owner}/${name}`, target })
  return { dir: path.relative(WORKSPACE_DIR, target).replace(/\\/g, '/'), files: (await readdir(target)).length }
}
async function ghPublish({ dir, repoName, isPrivate = true, message = 'Update from AI Workstation' }) {
  const me = (await gh('/user')).login
  const localDir = resolveInWorkspace(dir)
  if (!existsSync(localDir)) throw new Error(`目录不存在：${dir}`)
  const name = repoName || path.basename(localDir)
  // 1) 确保仓库存在
  let repo
  try { repo = await gh(`/repos/${me}/${name}`) } catch { repo = await gh('/user/repos', { method: 'POST', body: { name, private: isPrivate, auto_init: false } }) }
  const branch = repo.default_branch || 'main'
  // 2) 收集文件（跳过依赖/大文件）
  const files = []
  async function walk(d, rel) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (['node_modules', '.git'].includes(e.name)) continue
      const abs = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(abs, r)
      else {
        const st = await (await import('node:fs/promises')).stat(abs)
        if (st.size > 5 * 1024 * 1024) continue
        files.push({ path: r, abs })
        if (files.length > 400) return
      }
    }
  }
  await walk(localDir, '')
  if (!files.length) throw new Error('目录为空，没有可上传的文件')
  // 3) 取基础 tree（已有分支时）
  let baseTree, parents = []
  try {
    const ref = await gh(`/repos/${me}/${name}/git/ref/heads/${branch}`)
    const commit = await gh(`/repos/${me}/${name}/git/commits/${ref.object.sha}`)
    baseTree = commit.tree.sha
    parents = [ref.object.sha]
  } catch { /* 空仓库：无基础 */ }
  // 4) 上传 blobs + tree + commit + ref
  const entries = []
  for (const f of files) {
    const content = (await readFile(f.abs)).toString('base64')
    const blob = await gh(`/repos/${me}/${name}/git/blobs`, { method: 'POST', body: { content, encoding: 'base64' } })
    entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha })
  }
  const treeBody = { tree: entries }
  if (baseTree) treeBody.base_tree = baseTree
  const tree = await gh(`/repos/${me}/${name}/git/trees`, { method: 'POST', body: treeBody })
  const commit = await gh(`/repos/${me}/${name}/git/commits`, { method: 'POST', body: { message, tree: tree.sha, parents } })
  if (parents.length) await gh(`/repos/${me}/${name}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } })
  else await gh(`/repos/${me}/${name}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } })
  dbg('github.publish', { repo: `${me}/${name}`, files: files.length })
  return { repo: `${me}/${name}`, url: repo.html_url, files: files.length, commit: commit.sha.slice(0, 7), branch }
}

/* ═══════════════════════════════════════════════════════════════
 * 十、HTTP 工具
 * ═══════════════════════════════════════════════════════════════ */
function sendJson(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)) }
// ★ 安全审计修复：请求体大小上限（默认 64MB），避免超大请求造成内存耗尽
const MAX_BODY = 64 * 1024 * 1024
async function readBody(req) {
  const cs = []
  let total = 0
  for await (const c of req) {
    total += c.length
    if (total > MAX_BODY) { const e = new Error('请求体过大'); e.statusCode = 413; throw e }
    cs.push(c)
  }
  if (!cs.length) return {}
  try { return JSON.parse(Buffer.concat(cs).toString('utf8')) } catch { return {} }
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' }
async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  const file = path.join(WEB_DIR, rel)
  // ★ 安全审计修复：用 path.relative 做目录边界判定（避免前缀比较被同前缀兄弟目录绕过）
  const relCheck = path.relative(WEB_DIR, file)
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck) || !existsSync(file)) { res.writeHead(404); res.end('Not Found'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  res.end(await readFile(file))
}

/* ═══════════════════════════════════════════════════════════════
 * 10.5 ★ 团队运行注册中心：暂停 / 恢复 / 终止 / 断线自动暂停 / 重连回放
 * ═══════════════════════════════════════════════════════════════ */
const teamRuns = new Map() // taskId → run
function createTeamRun(task, sessionId) {
  const run = {
    id: crypto.randomUUID(), task, sessionId: sessionId || '', startedAt: Date.now(),
    listeners: new Set(), buffer: [], paused: false, pausedAgents: new Set(), pausedReasons: new Set(),
    resumeWaiters: [], abort: false, finished: false,
  }
  teamRuns.set(run.id, run)
  return run
}
function runEmit(run, event) {
  try {
    if (!run) return
    run.buffer.push(event)
    if (run.buffer.length > 600) run.buffer.splice(0, run.buffer.length - 600)
    for (const fn of run.listeners) { try { fn(event) } catch { /* ignore */ } }
    // ★ TAT：任务事件落盘（跳过 delta/reasoning 大流量），断线/重启后仍可回放
    if (run.id && !['delta', 'reasoning'].includes(event.type)) {
      appendFile(path.join(TASKS_DIR, `${run.id}.events.jsonl`), JSON.stringify(event) + '\n').catch(() => {})
    }
  } catch { /* ignore */ }
}
function notifyRun(run) { run.resumeWaiters.splice(0).forEach((f) => { try { f() } catch { /* ignore */ } }) }
async function waitWhilePaused(run, agent = '*') {
  if (!run) return true
  while (!run.abort && (run.paused || run.pausedAgents.has(agent) || run.pausedAgents.has('*'))) {
    await new Promise((resolve) => run.resumeWaiters.push(resolve))
  }
  return !run.abort
}

/* ★ 出图人工审核：每张图由用户判断 保留 / 重画 / 删除 */
const pendingReviews = new Map()
function waitReview(id, timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pendingReviews.delete(id); resolve({ action: 'keep' }) }, timeoutMs)
    pendingReviews.set(id, (d) => { clearTimeout(timer); pendingReviews.delete(id); resolve(d) })
  })
}

/* ★ 出图成果元数据（画廊管理 / 重画 用） */
const ART_META_FILE = path.join(DATA_DIR, 'artifacts.json')
async function readArtMeta() { try { return JSON.parse(await readFile(ART_META_FILE, 'utf8')) } catch { return [] } }
const artRelOf = (u) => decodeURIComponent(String(u).replace('/api/artifact?path=', ''))
async function recordArt(urls, meta = {}) {
  const files = new Set(urls.map((u) => path.basename(artRelOf(u))))
  const list = (await readArtMeta()).filter((x) => !files.has(x.file))
  for (const u of urls) {
    const rel = artRelOf(u)
    list.unshift({ url: u, path: rel, file: path.basename(rel), root: getActiveRoot(), kind: 'image', ...meta, t: Date.now() })
  }
  await writeFile(ART_META_FILE, JSON.stringify(list.slice(0, 1000), null, 2), 'utf8')
  bumpRev('art')
}
async function deleteArtFiles(files, deleteFileToo) {
  const list = await readArtMeta()
  const keep = []
  let removed = 0, fileErr = 0
  for (const it of list) {
    if (files.includes(it.file)) {
      removed++
      if (deleteFileToo) {
        // ★ 依据记录时的项目根目录定位真实文件（不同工作区的 artifacts 都支持）
        const root = it.root && existsSync(it.root) ? it.root : getActiveRoot()
        try { await rm(path.join(root, 'artifacts', it.file), { force: true }) } catch { fileErr++ }
      }
    } else keep.push(it)
  }
  await writeFile(ART_META_FILE, JSON.stringify(keep, null, 2), 'utf8')
  return { removed, fileErr }
}

/* ★ GitHub 下载助手：Windows 上用 PowerShell（系统证书库，避免 UNABLE_TO_VERIFY_LEAF_SIGNATURE），其余平台用 fetch */
// ★ raw.githubusercontent.com 在部分网络（如国内）会超时：自动改走 api.github.com 匿名读取（公开仓库可用）
function rawToApiUrl(u) {
  const m = String(u).match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+?)(\?.*)?$/)
  if (!m) return null
  return `https://api.github.com/repos/${m[1]}/${m[2]}/contents/${m[4]}?ref=${encodeURIComponent(m[3])}`
}
async function ghFetchTextViaApi(u) {
  const api = rawToApiUrl(u)
  if (!api) throw new Error('无法转换为 GitHub API 地址')
  const r = await fetch(api, { headers: { 'User-Agent': 'open-agent-team', Accept: 'application/vnd.github.raw' }, signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`GitHub API HTTP ${r.status}`)
  return await r.text()
}
async function ghGetText(u) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (Invoke-WebRequest -Uri '${u}' -UseBasicParsing -Headers @{'User-Agent'='open-agent-team'}).Content"`, { timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true })
      return stdout
    }
    const r = await fetch(u, { headers: { 'User-Agent': 'open-agent-team' }, signal: AbortSignal.timeout(20000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.text()
  } catch (e) {
    dbg('update.raw_fail', { url: u, error: e.message })
    return await ghFetchTextViaApi(u)
  }
}
async function ghDownload(u, file) {
  try {
    if (process.platform === 'win32') {
      await execAsync(`powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${u}' -OutFile '${file}' -UseBasicParsing -Headers @{'User-Agent'='open-agent-team'}"`, { timeout: 60000, windowsHide: true })
      return
    }
    const r = await fetch(u, { headers: { 'User-Agent': 'open-agent-team' }, redirect: 'follow', signal: AbortSignal.timeout(60000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    await writeFile(file, Buffer.from(await r.arrayBuffer()))
    return
  } catch (e) {
    dbg('update.raw_download_fail', { url: u, error: e.message })
    const api = rawToApiUrl(u)
    if (!api) throw e
    const r = await fetch(api, { headers: { 'User-Agent': 'open-agent-team', Accept: 'application/vnd.github.raw' }, signal: AbortSignal.timeout(60000) })
    if (!r.ok) throw new Error(`GitHub API HTTP ${r.status}`)
    await writeFile(file, Buffer.from(await r.arrayBuffer()))
  }
}

/* ═══════════════════════════════════════════════════════════════
 * 10.5b ★ 角色对话记忆（单独对话与队友协作询问都会留痕；
 *   被询问的角色之后能记得自己收到过谁的问询、回复过什么）
 * ═══════════════════════════════════════════════════════════════ */
const ROLE_CHATS_FILE = path.join(DATA_DIR, 'role-chats.json')
let roleChats = {}
async function loadRoleChats() { try { roleChats = JSON.parse(await readFile(ROLE_CHATS_FILE, 'utf8')) } catch { roleChats = {} } }
const saveRoleChats = () => writeFile(ROLE_CHATS_FILE, JSON.stringify(roleChats, null, 2), 'utf8').catch(() => {})
// ★ 角色记忆：默认返回完整历史（按字符预算裁剪）。只在超预算时才从头部大块裁剪，
//   平时保持"只追加"，让【系统提示 + 历史】成为稳定前缀 → 上游 prompt cache 更容易命中（少花钱、少等待）
function roleChatHistory(roleId, maxMsgs = 200, maxChars = 14000) {
  const arr = (roleChats[roleId] || []).slice(-maxMsgs)
  const out = []
  let total = 0
  for (let i = arr.length - 1; i >= 0; i--) {
    const content = String(arr[i].content || '').slice(0, 4000)
    total += content.length
    out.unshift({ role: arr[i].role === 'assistant' ? 'assistant' : 'user', content })
    if (total > maxChars) break
  }
  return out
}
function roleChatAppend(roleId, role, content) {
  if (!roleId || !content || !String(content).trim()) return
  const arr = roleChats[roleId] || (roleChats[roleId] = [])
  arr.push({ role, content: String(content).slice(0, 4000), t: Date.now() })
  while (arr.length > 200) arr.shift() // ★ 保留更多历史，避免"做完就忘"
  saveRoleChats()
}
// ★ 工作区快照（项目档案）：把文件树的"现状"直接喂给 AI，避免每次都反复 list_files/read_file
const digestCache = new Map()
async function projectDigest(root, maxEntries = 60) {
  try {
    const hit = digestCache.get(root)
    if (hit && Date.now() - hit.at < 15000) return hit.text
    const lines = []
    const walk = async (dir, prefix, depth) => {
      if (lines.length >= maxEntries || depth > 2) return
      const es = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const e of es) {
        if (lines.length >= maxEntries) break
        if (['node_modules', '.git', 'uploads'].includes(e.name) || e.name.startsWith('.')) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          const n = (await readdir(p).catch(() => [])).length
          lines.push(`${prefix}${e.name}/  (${n} 项)`)
          await walk(p, prefix + e.name + '/', depth + 1)
        } else {
          const st = await stat(p).catch(() => null)
          lines.push(`${prefix}${e.name}  (${st ? Math.round(st.size / 1024) + 'KB' : '?'})`)
        }
      }
    }
    await walk(root, '', 0)
    const text = `【工作区快照（自动生成，请直接据此行动，避免重复 list_files/read_file 全量翻查）】\n目录：${root}\n${lines.join('\n') || '(空目录)'}`
    digestCache.set(root, { at: Date.now(), text })
    return text
  } catch { return '' }
}
// ★ 团队会话档案：让角色单独对话时也能"记得"本项目的任务/步骤/产物/协作历史
function sessionArchive(sess, maxChars = 6000) {
  if (!sess) return ''
  const out = []
  for (const m of sess.messages || []) {
    if (m.kind === 'team-task') out.push(`【任务】${String(m.content || '').slice(0, 200)}`)
    else if (m.kind === 'team-plan') out.push(`【计划】${m.summary || ''} → ${(m.steps || []).map((s) => `${s.agent}:${s.title}`).join('；')}`)
    else if (m.kind === 'team-step') out.push(`【${m.agent}·${m.title || ''}】${String(m.content || '').replace(/```tool[\s\S]*?```/g, '').replace(/\s+/g, ' ').slice(-500)}`)
    else if (m.kind === 'team-final') out.push(`【队长汇总】${String(m.content || '').replace(/\s+/g, ' ').slice(-800)}`)
    else if (m.kind === 'team-meta') out.push(`【状态】${m.content || ''}`)
    else if (m.kind === 'role-chat' && m.side === 'user') out.push(`【用户】${String(m.content || '').slice(0, 200)}`)
    else if (m.kind === 'team-ask') out.push(`【协作】${m.from} → ${m.to}：${String(m.question || '').slice(0, 120)}`)
    else if (m.kind === 'team-ask-done') out.push(`【协作回复】${m.to} → ${m.from}：${String(m.answer || '').slice(0, 120)}`)
  }
  let text = out.join('\n')
  if (text.length > maxChars) text = text.slice(-maxChars) // 保尾部（最新状态）
  return text ? `【本项目团队会话档案（回忆依据：已完成的任务/步骤/产物/协作；无需再去翻文件确认）】\n${text}` : ''
}

/* ═══════════════════════════════════════════════════════════════
 * 10.5d ★ .oat 常驻项目档案（借鉴 hindsight「项目记忆」思路的极简实现）：
 *   团队任务收尾时把「任务/步骤/产物线索/状态/汇总节选」追加进 工作区/.oat/PROJECT.md；
 *   之后的角色对话与团队步骤自动注入档案摘要 → 新会话不翻文件也能了解项目历史
 * ═══════════════════════════════════════════════════════════════ */
const projMemCache = new Map() // root -> { at, text }
async function readProjectMemory(root) {
  try {
    const hit = projMemCache.get(root)
    if (hit && Date.now() - hit.at < 15000) return hit.text
    let text = ''
    try { text = await readFile(path.join(root, '.oat', 'PROJECT.md'), 'utf8') } catch { text = '' }
    projMemCache.set(root, { at: Date.now(), text })
    return text
  } catch { return '' }
}
const PROJ_MEM_MAX = 30 * 1024 // 档案上限 ~30KB，超出时裁掉最旧日志
async function appendProjectMemory(root, info) {
  if (!root) return 0
  const dir = path.join(root, '.oat')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'PROJECT.md')
  let text = ((await readProjectMemory(root)) || '').trimEnd()
  if (!text) {
    text = `# 项目档案（.oat/PROJECT.md · Open Agent Team 自动维护）\n\n> 团队任务收尾会自动追加任务日志；角色对话与团队执行会自动读取本档案。\n> 本档案属于项目本身，可随项目一起复制/迁移/版本管理。\n\n## 项目概览\n- 工作区：${root}\n- 建档时间：${new Date().toLocaleString('zh-CN', { hour12: false })}\n\n## 任务日志`
  }
  const stamp = new Date().toLocaleString('zh-CN', { hour12: false })
  const stepLine = (info.plan?.steps || []).map((s) => `${roleById(s.agent)?.label || s.agent}:${s.title}`).join('；')
  const blob = `${info.task || ''}\n${info.finalText || ''}\n${(info.results || []).map((r) => r.result || '').join('\n')}`
  const exts = 'html|htm|js|mjs|cjs|ts|tsx|md|txt|json|css|scss|py|bat|ps1|sh|yml|yaml|xml|csproj|sln|zip|png|jpg|jpeg|gif|webp|svg|mp4|mp3|wav|csv|xlsx|docx|pdf|db|sqlite'
  const found = [...new Set((blob.match(new RegExp(`[\\w\\u4e00-\\u9fa5./\\\\-]+\\.(?:${exts})\\b`, 'gi')) || []).map((s) => s.replace(/^[.\\/]+/, '').trim()).filter((s) => s && s.length < 120))].slice(0, 24)
  const entry = `\n### [${stamp}] ${String(info.task || '').replace(/\s+/g, ' ').slice(0, 160)}\n- 状态：${info.status} · 费用 ¥${Number(info.cost || 0).toFixed(6)} · 工具 ${info.toolCalls || 0} 次${info.sessionId ? ` · 会话 ${String(info.sessionId).slice(0, 8)}` : ''}\n- 步骤：${stepLine || '（无）'}\n- 产物线索：${found.length ? found.join('；') : '（未含明确文件名）'}\n- 汇总节选：${String(info.finalText || '（无汇总）').replace(/```tool[\s\S]*?```/g, '').replace(/\s+/g, ' ').slice(0, 600)}\n`
  text += entry
  if (text.length > PROJ_MEM_MAX) {
    const headMark = '\n## 任务日志'
    const idx = text.indexOf(headMark)
    if (idx > 0) {
      const head = text.slice(0, idx + headMark.length)
      let logs = text.slice(idx + headMark.length)
      while (head.length + logs.length > PROJ_MEM_MAX && logs.length > 4000) {
        const next = logs.indexOf('\n### [', 1)
        if (next < 0) break
        logs = logs.slice(next)
      }
      text = head + logs
    }
  }
  await writeFile(file, text, 'utf8')
  projMemCache.delete(root) // 失效缓存
  return found.length
}
// ★ 注入用摘要：取档案尾部（最新任务最关键）；无档案返回空串，零开销
async function projectMemoryDigest(root, maxChars = 1800) {
  const t = (await readProjectMemory(root) || '').trim()
  if (!t) return ''
  return `【.oat 常驻项目档案（任务历史/产物线索；直接据此回答与行动，无需翻文件）】\n${t.slice(-maxChars)}`
}

/* ═══════════════════════════════════════════════════════════════
 * 10.5e ★ 本地知识库（RAG）：零依赖 BM25 检索
 *   · 索引工作区文档（md/txt 等文本 + PDF 尽力抽取），存 工作区/.oat/index.json（随项目迁移）
 *   · 分词 = 拉丁词 + CJK 二元组；中文无需外部分词库
 *   · 角色对话 / 团队步骤自动检索注入；AI 也可用 kb_search 工具主动查询
 * ═══════════════════════════════════════════════════════════════ */
const KB_EXTS = new Set(['.md', '.markdown', '.mdx', '.txt', '.text', '.json', '.csv', '.tsv', '.yml', '.yaml', '.html', '.htm', '.xml', '.js', '.mjs', '.cjs', '.ts', '.py', '.java', '.kt', '.cs', '.go', '.rs', '.sh', '.bat', '.ps1', '.cmd', '.css', '.sql', '.ini', '.conf', '.log'])
const KB_MAX_FILE = 1.5 * 1024 * 1024 // 单文件上限 1.5MB
const KB_MAX_FILES = 600               // 单工作区文件上限
const KB_STALE_MS = 30 * 60 * 1000     // 索引超过 30 分钟视为陈旧（自动重建）
const kbCache = new Map()              // root -> { at, idx }
const kbLastTry = new Map()            // root -> 上次自动重建尝试时间（防抖）

// 分词：拉丁词 + CJK 二元组（"机器学习" → 机器/器学/学习）
function kbTokenize(text) {
  const s = String(text || '').toLowerCase()
  const tokens = []
  const latin = s.match(/[a-z0-9_]{2,}/g)
  if (latin) tokens.push(...latin)
  const cjk = s.match(/[\u4e00-\u9fff]+/g) || []
  for (const run of cjk) {
    if (run.length === 1) { tokens.push(run); continue }
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2))
  }
  return tokens
}
// PDF 文本抽取（尽力而为）：解析 FlateDecode 流中的 Tj/TJ 文本操作符；扫描版/加密 PDF 不支持
function decodePdfLiteral(s) {
  return String(s).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (all, g) => {
    if (/^[0-7]+$/.test(g)) return String.fromCharCode(parseInt(g, 8))
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[g] || g
  })
}
function extractPdfText(buf) {
  try {
    const raw = buf.toString('latin1')
    const out = []
    const streamRe = /stream\r?\n([\s\S]*?)endstream/g
    let m
    while ((m = streamRe.exec(raw))) {
      let data = Buffer.from(m[1], 'latin1')
      if (data.length > 2 && data[0] === 0x78) { try { data = zlib.inflateSync(data) } catch { continue } }
      const s = data.toString('latin1')
      if (!/BT|Tj|TJ/.test(s)) continue
      const texts = []
      let t
      const tjRe = /\(((?:\\.|[^\\()])*)\)\s*Tj/g
      while ((t = tjRe.exec(s))) texts.push(decodePdfLiteral(t[1]))
      const arrRe = /\[((?:[^\][]|\\.)*)\]\s*TJ/g
      while ((t = arrRe.exec(s))) {
        const inner = t[1]
        const sre = /\(((?:\\.|[^\\()])*)\)/g
        let u
        while ((u = sre.exec(inner))) texts.push(decodePdfLiteral(u[1]))
      }
      if (texts.length) out.push(texts.join(' '))
    }
    return out.join('\n')
  } catch { return '' }
}
// 分块：按行聚合成 ~700 字符的块
function kbChunk(text, size = 700) {
  const lines = String(text).split(/\r?\n/)
  const chunks = []
  let cur = ''
  for (const line of lines) {
    if (cur && cur.length + line.length + 1 > size) { chunks.push(cur); cur = '' }
    cur += (cur ? '\n' : '') + line
    while (cur.length > size * 1.8) { chunks.push(cur.slice(0, size)); cur = cur.slice(size) }
  }
  if (cur.trim()) chunks.push(cur)
  return chunks.filter((c) => c.trim()).slice(0, 400)
}
async function kbLoad(root) {
  const hit = kbCache.get(root)
  if (hit && Date.now() - hit.at < 20000) return hit.idx
  try {
    const idx = JSON.parse(await readFile(path.join(root, '.oat', 'index.json'), 'utf8'))
    kbCache.set(root, { at: Date.now(), idx })
    return idx
  } catch { kbCache.set(root, { at: Date.now(), idx: null }); return null }
}
// 重建索引（增量：mtime+size 未变的文件复用旧分块）
async function kbBuild(root) {
  const dir = path.join(root, '.oat')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'index.json')
  let old = null
  try { old = JSON.parse(await readFile(file, 'utf8')) } catch { old = null }
  const oldMap = new Map(((old && old.files) || []).map((f) => [f.path, f]))
  const files = []
  const walk = async (d, rel, depth) => {
    if (files.length >= KB_MAX_FILES || depth > 6) return
    const es = await readdir(d, { withFileTypes: true }).catch(() => [])
    for (const e of es) {
      if (files.length >= KB_MAX_FILES) break
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '.git') continue
      const p = path.join(d, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { await walk(p, r, depth + 1); continue }
      const ext = path.extname(e.name).toLowerCase()
      if (ext !== '.pdf' && !KB_EXTS.has(ext)) continue
      const st = await stat(p).catch(() => null)
      if (!st || st.size > KB_MAX_FILE) continue
      const prev = oldMap.get(r)
      if (prev && prev.mtime === st.mtimeMs && prev.size === st.size && Array.isArray(prev.chunks)) { files.push(prev); continue }
      let text = ''
      try { text = ext === '.pdf' ? extractPdfText(await readFile(p)) : await readFile(p, 'utf8') } catch { continue }
      text = text.replace(/\u0000/g, '')
      if (!text.trim()) continue
      files.push({ path: r, mtime: st.mtimeMs, size: st.size, chunks: kbChunk(text) })
    }
  }
  await walk(root, '', 0)
  const idx = { builtAt: Date.now(), root, files }
  const chunkCount = files.reduce((n, f) => n + (f.chunks?.length || 0), 0)
  await writeFile(file, JSON.stringify(idx), 'utf8')
  kbCache.delete(root)
  dbg('kb.build', { root, files: files.length, chunks: chunkCount })
  return { files: files.length, chunks: chunkCount, builtAt: idx.builtAt }
}
// 自动刷新（防抖 5 分钟；索引缺失或超过 30 分钟陈旧时后台重建）
async function kbMaybeRefresh(root) {
  const now = Date.now()
  if (now - (kbLastTry.get(root) || 0) < 5 * 60 * 1000) return
  kbLastTry.set(root, now)
  const idx = await kbLoad(root)
  if (!idx || !idx.builtAt || now - idx.builtAt > KB_STALE_MS) await kbBuild(root).catch(() => {})
}
// BM25 风格检索（对 ≤几千块的工作区毫秒级）
async function kbSearch(root, query, limit = 4) {
  const idx = await kbLoad(root)
  if (!idx || !idx.files || !idx.files.length) return []
  const qTokens = [...new Set(kbTokenize(query))]
  if (!qTokens.length) return []
  const scored = []
  let total = 0
  const df = new Map()
  for (const f of idx.files) {
    for (const text of f.chunks || []) {
      total++
      const lower = text.toLowerCase()
      let hit = 0
      for (const tk of qTokens) {
        const c = lower.split(tk).length - 1
        if (c > 0) { hit++; df.set(tk, (df.get(tk) || 0) + 1) }
      }
      if (hit > 0) scored.push({ path: f.path, text, lower, hit })
    }
  }
  if (!scored.length) return []
  for (const c of scored) {
    let s = 0
    for (const tk of qTokens) {
      const n = c.lower.split(tk).length - 1
      if (!n) continue
      const idf = Math.log(1 + total / (1 + (df.get(tk) || 1)))
      s += (n / (1 + Math.min(2, c.text.length / 900))) * idf
    }
    c.s = s + (c.hit > 1 ? 0.35 : 0)
  }
  scored.sort((a, b) => b.s - a.s)
  const out = []
  const perFile = new Map()
  for (const c of scored) {
    const n = perFile.get(c.path) || 0
    if (n >= 2) continue
    perFile.set(c.path, n + 1)
    out.push({ path: c.path, excerpt: c.text.replace(/\s+/g, ' ').slice(0, 400), score: Number(c.s.toFixed(3)) })
    if (out.length >= limit) break
  }
  return out
}
// 检索注入摘要（角色对话 / 团队步骤共用；可在设置里关闭）
async function kbDigest(root, query, maxChars = 1300) {
  try {
    if (settings.kbAuto === false) return ''
    const q = String(query || '').trim()
    if (q.length < 4) return ''
    const res = await kbSearch(root, q, 4)
    if (!res.length) return ''
    let body = res.map((r, i) => `${i + 1}. 《${r.path}》（相关度 ${r.score}）：${r.excerpt.slice(0, 300)}`).join('\n')
    if (body.length > maxChars) body = body.slice(0, maxChars) + '…'
    return `【本地知识库检索（.oat 索引，命中最相关 ${res.length} 段；引用时请给出文件路径）】\n${body}`
  } catch { return '' }
}

/* ═══════════════════════════════════════════════════════════════
 * 10.5c ★ 自定义团队预设（用户保存自己的角色配置，可套用/删除）
 * ═══════════════════════════════════════════════════════════════ */
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json')
let customPresets = {}
async function loadCustomPresets() { try { customPresets = JSON.parse(await readFile(PRESETS_FILE, 'utf8')) } catch { customPresets = {} } }
const saveCustomPresets = () => writeFile(PRESETS_FILE, JSON.stringify(customPresets, null, 2), 'utf8').catch(() => {})

/* ═══════════════════════════════════════════════════════════════
 * 10.6 ★ 凭据保险箱（本地加密保存非 AI 类 API；查看需密码）
 * ═══════════════════════════════════════════════════════════════ */
const VAULT_FILE = path.join(DATA_DIR, 'vault.json')
const VAULT_PASS_FILE = path.join(DATA_DIR, 'vault-pass.json')
let vault = []
async function loadVault() { try { vault = JSON.parse(await readFile(VAULT_FILE, 'utf8')) } catch { vault = [] } }
const saveVault = () => writeFile(VAULT_FILE, JSON.stringify(vault, null, 2), 'utf8')
async function getVaultPass() { try { return JSON.parse(await readFile(VAULT_PASS_FILE, 'utf8')) } catch { return null } }
function vaultHash(password, salt) { return crypto.scryptSync(String(password), salt, 32).toString('hex') }
function guessVaultNote(name, baseUrl) {
  const s = `${name || ''} ${baseUrl || ''}`.toLowerCase()
  const rules = [
    [/matting|segment|抠图/, '图像抠图服务'],
    [/ocr|文字识别/, '文字识别（OCR）'],
    [/tts|voice|speech|语音/, '语音合成 / 语音服务'],
    [/translat|翻译/, '翻译接口'],
    [/weather|天气/, '天气数据接口'],
    [/map|地图|geo/, '地图 / 地理数据接口'],
    [/image|图像|图片/, '图像处理接口'],
    [/video|视频/, '视频处理接口'],
    [/search|搜索/, '搜索接口'],
    [/sms|短信/, '短信服务'],
    [/pay|支付/, '支付接口'],
  ]
  for (const [re, label] of rules) if (re.test(s)) return label
  try { const host = new URL(baseUrl).hostname; if (host) return `${host} 接口` } catch { /* ignore */ }
  return '自定义 API'
}
let vaultKeyBuf = null
async function vaultGetKey() { if (!vaultKeyBuf) vaultKeyBuf = await getCryptoKey(); return vaultKeyBuf }

/* ═══════════════════════════════════════════════════════════════
 * 10.7 ★ 视频生成（百炼 wan 系列等，异步任务）
 * ═══════════════════════════════════════════════════════════════ */
function resolveVideoTarget(call = {}) {
  const hasVideo = (p) => (p.models || []).some((m) => (m.tags || []).includes('视频'))
  const provider = providers.find((p) => p.id === call.providerId) || providers.find((p) => p.id === settings.videoProvider && hasVideo(p)) || providers.find(hasVideo)
  if (!provider) return null
  const models = (provider.models || []).filter((m) => (m.tags || []).includes('视频'))
  const ids = new Set(models.map((m) => m.id))
  // ★ 只认带「视频」标签的模型：settings/call 里若指定了非视频模型（如聊天模型），自动退回第一个视频模型
  const model = (call.model && ids.has(call.model) ? call.model : '') ||
    (provider.id === settings.videoProvider && settings.videoModel && ids.has(settings.videoModel) ? settings.videoModel : '') ||
    models[0]?.id
  return model ? { provider, model } : null
}
/* ═══════════════════════════════════════════════════════════════
 * 10.9 ★ 媒体工具链（短视频流水线核心）
 *   · ffmpeg：复用 tools/ffmpeg.exe；缺失时首次使用自动下载并校验 sha256
 *   · 探测：直接用 ffmpeg -i 解析（无需 ffprobe）
 *   · project.json：短视频工程的单一事实源（meta + scenes[]）
 * ═══════════════════════════════════════════════════════════════ */
const FFMPEG_EXE = path.join(__dirname, 'tools', 'ffmpeg.exe')
const XFADE_DUR = 0.4 // 镜头间转场时长（秒）
function ffmpegReady() { return existsSync(FFMPEG_EXE) }
async function ensureFfmpeg() {
  if (ffmpegReady()) return FFMPEG_EXE
  // ★ 手机端（Android 内嵌引擎）：不提供 ffmpeg，媒体探测/合成请回电脑端执行
  if (process.platform === 'android') throw new Error('手机端暂不内置 ffmpeg：媒体探测/视频合成请在电脑端执行（本地模式可正常聊天、任务与文件操作）')
  // ★ 首次使用：官方镜像下载 essentials 构建（附 .sha256 校验；如需手动安装：把 ffmpeg.exe 放入 tools/ 即可）
  await mkdir(path.join(__dirname, 'tools'), { recursive: true })
  const zipUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
  const shaUrl = zipUrl + '.sha256'
  const expect = (await (await fetch(shaUrl, { signal: AbortSignal.timeout(30000) })).text()).trim().split(/\s+/)[0].toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(expect)) throw new Error('ffmpeg 校验值获取失败：请手动下载 ffmpeg.exe 放入 tools/ 目录')
  const buf = Buffer.from(await (await fetch(zipUrl, { signal: AbortSignal.timeout(900000) })).arrayBuffer())
  const got = crypto.createHash('sha256').update(buf).digest('hex')
  if (got !== expect) throw new Error('ffmpeg 下载校验失败（sha256 不一致），已放弃安装')
  const zip = path.join(__dirname, 'tools', '_ffmpeg_dl.zip')
  const outDir = path.join(__dirname, 'tools', '_ffmpeg_x')
  await writeFile(zip, buf)
  await execAsync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip}' -DestinationPath '${outDir}' -Force"`, { timeout: 600000, windowsHide: true })
  let found = ''
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.name.toLowerCase() === 'ffmpeg.exe') found = p
    }
  }
  await walk(outDir)
  if (!found) throw new Error('解压后未找到 ffmpeg.exe')
  await copyFile(found, FFMPEG_EXE)
  await rm(zip, { force: true }).catch(() => {})
  await rm(outDir, { recursive: true, force: true }).catch(() => {})
  return FFMPEG_EXE
}
async function runFfmpeg(args, timeoutMs = 900000, cwd = undefined) {
  const exe = await ensureFfmpeg()
  try {
    const { stdout, stderr } = await execFileAsync(exe, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true, cwd })
    return { stdout, stderr }
  } catch (e) {
    const tail = String((e && e.stderr) || e.message || '').split('\n').filter(Boolean).slice(-6).join('\n')
    throw new Error(`ffmpeg 失败：${tail || '未知错误'}`)
  }
}
// 媒体探测（时长/分辨率/帧率/音视频轨；loudness=true 时附带响度测量）
async function probeMedia(abs, opts = {}) {
  const exe = await ensureFfmpeg()
  let out = ''
  try { await execFileAsync(exe, ['-hide_banner', '-i', abs], { timeout: 30000, windowsHide: true }) } catch (e) { out = String((e && e.stderr) || '') }
  const lines = out.split('\n')
  const durM = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  const duration = durM ? (+durM[1]) * 3600 + (+durM[2]) * 60 + parseFloat(durM[3]) : 0
  const vLine = lines.find((l) => /Stream #.*Video:/.test(l)) || ''
  const aLine = lines.find((l) => /Stream #.*Audio:/.test(l)) || ''
  const res = vLine.match(/(\d{2,5})x(\d{2,5})/)
  const fps = vLine.match(/([\d.]+)\s*fps/)
  const st = await stat(abs).catch(() => null)
  const info = {
    duration: Number(duration.toFixed(3)),
    width: res ? Number(res[1]) : 0, height: res ? Number(res[2]) : 0,
    fps: fps ? Number(fps[1]) : 0,
    hasVideo: !!vLine, hasAudio: !!aLine,
    videoCodec: (vLine.match(/Video:\s*([\w-]+)/) || [])[1] || '',
    audioCodec: (aLine.match(/Audio:\s*([\w-]+)/) || [])[1] || '',
    size: st ? st.size : 0,
  }
  if (opts.loudness) {
    try {
      let lout = ''
      try {
        const r = await execFileAsync(exe, ['-hide_banner', '-i', abs, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { timeout: 120000, windowsHide: true })
        lout = r.stderr
      } catch (e2) { lout = String((e2 && e2.stderr) || '') }
      const m = lout.match(/\{[\s\S]*?\}\s*$/)
      if (m) { const j = JSON.parse(m[0]); info.loudness = { input_i: Number(j.input_i), input_tp: Number(j.input_tp), target: -16 } }
    } catch { /* ignore */ }
  }
  // ★ 亮度采样（黑屏检测）：2fps 抽帧 YAVG 平均值；avgY < 22 视为疑似黑屏
  if (opts.brightness !== false && info.hasVideo) {
    try {
      let bout = ''
      try {
        const r = await execFileAsync(exe, ['-hide_banner', '-i', abs, '-vf', 'fps=2,signalstats,metadata=print', '-f', 'null', '-'], { timeout: 120000, windowsHide: true })
        bout = r.stderr
      } catch (e3) { bout = String((e3 && e3.stderr) || '') }
      const vals = (bout.match(/YAVG=([\d.]+)/g) || []).map((x) => parseFloat(x.split('=')[1]))
      if (vals.length) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length
        info.avgY = Number(avg.toFixed(1))
        info.black = avg < 22
      }
    } catch { /* ignore */ }
  }
  return info
}
async function downloadTo(url, abs) { const r = await fetch(url); if (!r.ok) throw new Error(`下载失败 HTTP ${r.status}`); await writeFile(abs, Buffer.from(await r.arrayBuffer())) }
// ★ 媒体文件路径容错解析：project.json 字段可能是「工程内相对」或「工作区相对」（带 video-project/ 前缀），两者都兼容
function resolveMediaFile(root, projDir, rel) {
  const r = String(rel || '').replace(/\\/g, '/').trim()
  if (!r) return ''
  const cands = []
  if (projDir) cands.push(path.posix.join(projDir, r))
  cands.push(r)
  cands.push('artifacts/' + path.posix.basename(r))
  for (const c of cands) { try { const a = resolveInWorkspace(c, root); if (existsSync(a)) return a } catch { /* ignore */ } }
  const g = path.join(getArtifactDir(), path.posix.basename(r))
  if (existsSync(g)) return g
  return ''
}
// 短视频工程：读取 project.json（默认 video-project/project.json）
async function loadVideoProject(root, rel) {
  const p = String(rel || 'video-project/project.json').replace(/\\/g, '/')
  const abs = resolveInWorkspace(p, root)
  const j = JSON.parse(await readFile(abs, 'utf8'))
  j._dir = path.posix.dirname(p)
  j._file = p
  return j
}
// 时间线规划：场景时长 = max(声明时长, 配音时长+0.4)；转场重叠 0.4s；配音在镜头出现后 0.25s 起
async function planTimeline(root, proj) {
  const scenes = Array.isArray(proj.scenes) ? proj.scenes : []
  const out = []
  let videoStart = 0
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i]
    const voiceRel = sc.voice ? String(sc.voice).replace(/\\/g, '/') : ''
    let vd = 0
    if (voiceRel) {
      const vAbs = resolveMediaFile(root, proj._dir, voiceRel)
      if (vAbs) vd = (await probeMedia(vAbs).catch(() => ({ duration: 0 }))).duration
    }
    const dur = Math.max(1, Math.max(Number(sc.dur) || 5, vd ? vd + 0.4 : 0))
    out.push({ i, sc, dur: Number(dur.toFixed(3)), videoStart: Number(videoStart.toFixed(3)), voiceRel, voiceDur: vd, voiceStart: voiceRel ? Number((videoStart + 0.25).toFixed(3)) : 0 })
    videoStart += dur - (i < scenes.length - 1 ? XFADE_DUR : 0)
  }
  return { scenes: out, total: Number(videoStart.toFixed(3)), xfade: scenes.length > 1 ? XFADE_DUR : 0 }
}
function srtTime(sec) {
  const s = Math.max(0, sec); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = Math.floor(s % 60); const ms = Math.round((s - Math.floor(s)) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
// 生成 ASS 字幕（PlayRes 与成片一致 → 字号/边距可控；比 SRT+force_style 更稳定）
function buildAss(proj, tl) {
  const meta = proj.meta || {}
  const W = Number(meta.width) || (meta.aspect === '16:9' ? 1280 : 1080)
  const H = Number(meta.height) || (meta.aspect === '16:9' ? 720 : 1920)
  const fontSize = Math.max(18, Math.round(H * 0.030))
  const marginV = Math.round(H * 0.055)
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Microsoft YaHei,${fontSize},&H00FFFFFF,&H00FFFFFF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,60,60,${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
  const t = (sec) => { const s = Math.max(0, sec); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60; return `${h}:${String(m).padStart(2, '0')}:${ss.toFixed(2).padStart(5, '0')}` }
  const lines = []
  for (const it of tl.scenes) {
    const text = String(it.sc.subtitleText || it.sc.narration || '').trim()
    if (!text) continue
    const start = it.videoStart + 0.1
    const end = Math.max(start + 1.2, it.videoStart + it.dur - (it.i < tl.scenes.length - 1 ? XFADE_DUR : 0.2))
    lines.push(`Dialogue: 0,${t(start)},${t(end)},Default,,0,0,0,,${wrapCJK(text).join('\\N')}`)
  }
  return lines.length ? head + lines.join('\n') + '\n' : ''
}
function wrapCJK(text, maxLen = 16) {
  const s = String(text || '').trim()
  if (!s) return ['（无文案）']
  const out = []; let cur = ''
  for (const ch of s) { cur += ch; if (cur.length >= maxLen || /[。！？!?]/.test(ch)) { out.push(cur); cur = '' } }
  if (cur) out.push(cur)
  return out.slice(0, 2) // 每条字幕最多两行
}
async function buildSrt(root, proj, tl) {
  const parts = []
  let n = 0
  for (const t of tl.scenes) {
    const sc = t.sc
    const text = String(sc.subtitleText || sc.narration || '').trim()
    if (!text) continue
    n++
    const start = t.videoStart + 0.1
    const end = Math.max(start + 1.2, t.videoStart + t.dur - (t.i < tl.scenes.length - 1 ? XFADE_DUR : 0.2))
    parts.push(`${n}\n${srtTime(start)} --> ${srtTime(end)}\n${wrapCJK(text).join('\n')}\n`)
  }
  return parts.join('\n')
}
/* ★ Qwen-TTS 本地引擎（licyk Qwen TTS WebUI 的 REST API：/qwenapi/v1，默认 127.0.0.1:7860）
 *   预设音色(custom-voice) / 音色设计(voice-design) / 音色克隆(voice-clone，几秒参考音频即可)
 *   说明：模型首次使用自动下载（ModelScope）；仅电脑端接入，手机端不部署 */
function qwenUrl() { return String((settings.qwenTts && settings.qwenTts.url) || 'http://127.0.0.1:7860').replace(/\/+$/, '') }
async function qwenGet(path, timeoutMs = 8000) {
  const r = await fetch(qwenUrl() + path, { signal: AbortSignal.timeout(timeoutMs) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return await r.json().catch(() => null)
}
async function qwenHealth() {
  try { const j = await qwenGet('/qwenapi/v1/models', 2500); return { ok: true, models: (j && j.models) || [] } } catch { return { ok: false, models: [] } }
}
async function qwenSpeakers() {
  try { const j = await qwenGet('/qwenapi/v1/speakers', 6000); return (j && (j.speakers || j.data || j.voices)) || [] } catch { return [] }
}
// ★ 用 node:http 直连本地 WebUI（避免 fetch/undici 的 300 秒 bodyTimeout 把"冷启动下载模型"的长请求掐断）
function httpJsonPostSync(urlStr, bodyObj, timeoutMs = 1800000) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(urlStr) } catch (e) { reject(e); return }
    const payload = Buffer.from(JSON.stringify(bodyObj))
    const req = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length }, timeout: 0,
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let j = null; try { j = JSON.parse(text) } catch { /* ignore */ }
        if (res.statusCode >= 200 && res.statusCode < 300 && j) resolve(j)
        else reject(new Error(j && (j.detail || j.message) ? String(j.detail || j.message).slice(0, 220) : `HTTP ${res.statusCode} ${text.slice(0, 120)}`))
      })
    })
    const killer = setTimeout(() => { try { req.destroy(new Error(`等待超时（${Math.round((timeoutMs || 0) / 1000)}s）`)) } catch { /* ignore */ } }, timeoutMs || 1800000)
    req.on('error', (e) => { clearTimeout(killer); reject(e) })
    req.on('close', () => clearTimeout(killer))
    req.end(payload)
  })
}
async function qwenPost(path, body, timeoutMs = 1800000) {
  return await httpJsonPostSync(qwenUrl() + path, body, timeoutMs)
}
/* ★ VoiceStudio 本地声音引擎（OpenAI 兼容 TTS：POST /v1/audio/speech；克隆：POST /api/profiles；默认 127.0.0.1:3900） */
const VOICES_FILE = path.join(DATA_DIR, 'voices.json')
let localVoices = [] // OAT 侧克隆记录 [{id,name,engine,sample,createdAt}]
async function loadLocalVoices() { try { localVoices = JSON.parse(await readFile(VOICES_FILE, 'utf8')); if (!Array.isArray(localVoices)) localVoices = [] } catch { localVoices = [] } }
const saveLocalVoices = () => writeFile(VOICES_FILE, JSON.stringify(localVoices, null, 2), 'utf8').catch(() => {})
function vsUrl() { return String((settings.voiceStudio && settings.voiceStudio.url) || 'http://127.0.0.1:3900').replace(/\/+$/, '') }
async function vsHealth(timeoutMs = 2500) {
  try {
    const r = await fetch(vsUrl() + '/.well-known/voicestudio-speech', { signal: AbortSignal.timeout(timeoutMs) })
    if (r.ok) { const j = await r.json().catch(() => null); return { ok: true, protocol: (j && j.protocol) || 'voicestudio.speech.v1' } }
  } catch { /* ignore */ }
  try { const r2 = await fetch(vsUrl() + '/v1/models', { signal: AbortSignal.timeout(timeoutMs) }); if (r2.ok) return { ok: true } } catch { /* ignore */ }
  return { ok: false }
}
async function vsListVoices() {
  const r = await fetch(vsUrl() + '/v1/audio/voices', { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json().catch(() => null)
  const arr = Array.isArray(j) ? j : ((j && (j.data || j.voices)) || [])
  return arr.map((v) => ({ id: String(v.id || v.profile_id || ''), name: String(v.name || v.label || v.id || '') })).filter((v) => v.id)
}
// 允许用「音色名」或 profile_id；未命中则原样传递（'default' 为引擎默认音色）
async function vsResolveVoice(v) {
  const raw = String(v || '').trim()
  if (!raw || raw === 'default') return 'default'
  try { const list = await vsListVoices(); const hit = list.find((x) => x.id === raw) || list.find((x) => x.name === raw); if (hit) return hit.id } catch { /* ignore */ }
  return raw
}
// 克隆音色：参考音频 → VoiceStudio 音色档案（少样本克隆）
async function toolCloneVoice(call, ctx) {
  // ★ Qwen-TTS 分支：登记本地音色档案（参考音频 + 可选参考文本），合成时走 voice-clone
  if (settings.voiceBackend === 'qwen') {
    const qh = await qwenHealth()
    if (call.list || call.action === 'list') {
      const mine = localVoices.filter((v) => v.engine === 'qwen')
      let extra = ''
      if (qh.ok) {
        const sp = await qwenSpeakers()
        const spText = Array.isArray(sp) && sp.length ? sp.slice(0, 40).map((x) => (typeof x === 'string' ? x : (x.name || x.id || ''))).filter(Boolean).join('、') : '（无）'
        extra = `\nWebUI 预设音色（custom-voice 可直接把 voice 传音色名）：${spText}\nWebUI 可用模型：${(qh.models || []).map((m) => m.name).join('；')}`
      } else extra = `\n（Qwen TTS WebUI 未连接：${qwenUrl()} —— 启动后可用预设音色；克隆登记不需要它在线）`
      return `已登记的克隆音色（Qwen-TTS）：\n${mine.map((v) => `- ${v.name}｜voice:"${v.name}"（参考：${v.refAudio}）`).join('\n') || '（无）'}${extra}`
    }
    const sample = String(call.sample || call.path || '').trim()
    if (!sample) return '缺少 sample（参考音频路径，工作区内；建议 10 秒 ~ 2 分钟的干净人声，wav/mp3 均可）'
    const abs = resolveInWorkspace(sample, ctx.root)
    if (!existsSync(abs)) return `参考音频不存在：${sample}`
    const name = String(call.name || 'OAT克隆音色').slice(0, 30)
    localVoices.unshift({ id: crypto.randomUUID(), name, engine: 'qwen', refAudio: abs, refText: String(call.refText || ''), model: String(call.model || settings.qwenModel || 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'), createdAt: Date.now() })
    while (localVoices.length > 200) localVoices.pop()
    await saveLocalVoices()
    return `已登记克隆音色「${name}」（Qwen-TTS，参考音频：${sample}${call.refText ? '，含参考文本' : '，无参考文本→x-vector 模式'}）\n之后 generate_speech 时把 voice 设为 "${name}" 即可用该音色（首次合成会自动下载模型：0.6B 约 1~2GB，仅一次）。`
  }
  const h = await vsHealth()
  if (!h.ok) return `本地声音引擎（VoiceStudio）未运行：请先启动 VoiceStudio（默认 ${vsUrl()}），或在 设置 → 媒体引擎 中修改地址。`
  if (call.list || call.action === 'list') {
    try {
      const list = await vsListVoices()
      const mine = localVoices.filter((v) => v.engine === 'voicestudio')
      return `VoiceStudio 音色（共 ${list.length}）：\n${list.map((v) => `- ${v.name}｜voice:"${v.id}"`).join('\n') || '（无）'}${mine.length ? `\n本机通过 OAT 克隆的记录：\n${mine.slice(0, 20).map((v) => `- ${v.name}｜voice:"${v.id}"（${new Date(v.createdAt).toLocaleString('zh-CN', { hour12: false })}）`).join('\n')}` : ''}`
    } catch (e) { return `读取音色列表失败：${e.message}` }
  }
  const sample = String(call.sample || call.path || '').trim()
  if (!sample) return '缺少 sample（参考音频路径，工作区内；建议 10 秒 ~ 2 分钟的干净人声，wav/mp3 均可）'
  const abs = resolveInWorkspace(sample, ctx.root)
  if (!existsSync(abs)) return `参考音频不存在：${sample}`
  const name = String(call.name || 'OAT克隆音色').slice(0, 30)
  try {
    const form = new FormData()
    form.append('name', name)
    form.append('kind', 'clone')
    form.append('ref_text', String(call.refText || ''))
    form.append('language', String(call.language || 'Auto'))
    form.append('ref_audio', new Blob([await readFile(abs)]), path.basename(abs))
    const r = await fetch(vsUrl() + '/api/profiles', { method: 'POST', body: form, signal: AbortSignal.timeout(600000) })
    const j = await r.json().catch(() => null)
    if (!r.ok) return `克隆失败：HTTP ${r.status} ${JSON.stringify(j).slice(0, 220)}`
    const id = (j && (j.id || j.profile_id || (j.profile && j.profile.id))) || ''
    if (!id) return `克隆接口未返回 profile_id：${JSON.stringify(j).slice(0, 220)}`
    localVoices.unshift({ id, name, engine: 'voicestudio', sample, createdAt: Date.now() })
    while (localVoices.length > 200) localVoices.pop()
    await saveLocalVoices()
    return `已克隆音色「${name}」→ voice:"${id}"\n之后调用 generate_speech 时把 voice 设为 "${id}"（或音色名「${name}」）即可用该音色配音。`
  } catch (e) { return `克隆调用失败：${e.message}` }
}
// 云端 TTS（百炼 qwen-tts / OpenAI 兼容 /audio/speech）
async function generateSpeech(call, ctx) {
  const text = String(call.text || '').trim()
  if (!text) return '缺少 text（要配音的文案）'
  const dir = path.posix.dirname(String(call.out || `audio/vo-${Date.now()}.mp3`).replace(/\\/g, '/'))
  const out = String(call.out || `audio/vo-${Date.now()}.mp3`).replace(/\\/g, '/')
  const abs = resolveInWorkspace(out, ctx.root)
  await mkdir(path.dirname(abs), { recursive: true })
  const backend = ['voicestudio', 'qwen'].includes(settings.voiceBackend) ? settings.voiceBackend : 'cloud'
  if (backend === 'qwen') {
    // ★ 本地 Qwen-TTS（licyk WebUI）：已登记音色→克隆合成；否则→预设音色合成
    const h = await qwenHealth()
    if (!h.ok) return `本地 Qwen-TTS 未连接：请先启动 Qwen TTS WebUI（双击整合包里的 启动.bat，默认 ${qwenUrl()}），或在 设置 → 媒体引擎 修改地址后重试。`
    const text2 = String(text).slice(0, 4000)
    const voiceRaw = String(call.voice || settings.qwenVoice || '').trim()
    const language = String(call.language || settings.qwenLanguage || 'auto')
    const prof = voiceRaw ? localVoices.find((v) => v.engine === 'qwen' && (v.id === voiceRaw || v.name === voiceRaw)) : null
    try {
      let j = null
      if (prof) {
        const refAbs = prof.refAudio && existsSync(prof.refAudio) ? prof.refAudio : ''
        if (!refAbs) return `音色「${prof.name}」的参考音频不存在：${prof.refAudio}（请重新用 clone_voice 登记）`
        const b64 = (await readFile(refAbs)).toString('base64')
        j = await qwenPost('/qwenapi/v1/voice-clone', {
          model_name: call.model || prof.model || settings.qwenModel || 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
          text: text2,
          ...(language && language !== 'auto' ? { language } : {}),
          ref_audio_base64: b64,
          ...(prof.refText ? { ref_text: prof.refText } : {}),
        })
      } else {
        const speakers = await qwenSpeakers()
        const sp = voiceRaw || settings.qwenSpeaker || (Array.isArray(speakers) && speakers.length ? (typeof speakers[0] === 'string' ? speakers[0] : (speakers[0].id || speakers[0].name)) : '')
        j = await qwenPost('/qwenapi/v1/custom-voice', {
          model_name: call.model || settings.qwenModelCV || 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
          text: text2,
          ...(sp ? { speaker: String(sp) } : {}),
          ...(language && language !== 'auto' ? { language } : {}),
          ...(call.instruct ? { instruct: String(call.instruct) } : {}),
        })
      }
      const b64out = (j && j.audio_files_base64 && j.audio_files_base64[0]) || ''
      if (!b64out) return `Qwen-TTS 未返回音频：${JSON.stringify(j).slice(0, 200)}`
      const buf = Buffer.from(b64out, 'base64')
      const isWav = buf.slice(0, 4).toString('ascii') === 'RIFF'
      let outRel = String(call.out || `audio/vo-${Date.now()}${isWav ? '.wav' : '.mp3'}`).replace(/\\/g, '/')
      if (isWav && /\.mp3$/i.test(outRel)) outRel = outRel.replace(/\.mp3$/i, '.wav')
      const abs2 = resolveInWorkspace(outRel, ctx.root)
      await mkdir(path.dirname(abs2), { recursive: true })
      await writeFile(abs2, buf)
      const info = await probeMedia(abs2).catch(() => ({ duration: 0, hasAudio: false }))
      return `已生成本地配音：${outRel}（${info.duration}s${info.hasAudio ? '，含音轨' : ''}；引擎 Qwen-TTS${prof ? `（克隆音色「${prof.name}」）` : `（预设音色 ${voiceRaw || '默认'}）`}）\n请把路径登记到 project.json 对应场景的 voice 字段。`
    } catch (e) { return `Qwen-TTS 调用失败：${e.message}` }
  }
  if (backend === 'voicestudio') {
    // ★ 本地引擎：OpenAI 兼容 TTS（VoiceStudio 默认 127.0.0.1:3900；音色可用 profile_id 或音色名）
    const h = await vsHealth()
    if (!h.ok) return `本地声音引擎（VoiceStudio）未运行：请先启动 VoiceStudio（默认 ${vsUrl()}），或在 设置 → 媒体引擎 中修改地址后重试。`
    const voiceRaw = String(call.voice || settings.vsVoice || 'default')
    try {
      const voice = await vsResolveVoice(voiceRaw)
      const r = await fetch(vsUrl() + '/v1/audio/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.vsModel || 'omnivoice', input: String(text).slice(0, 4000), voice, response_format: out.endsWith('.wav') ? 'wav' : 'mp3' }),
        signal: AbortSignal.timeout(900000),
      })
      if (!r.ok) return `VoiceStudio 合成失败：HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 220)}`
      await writeFile(abs, Buffer.from(await r.arrayBuffer()))
    } catch (e) { return `VoiceStudio 调用失败：${e.message}` }
    const info = await probeMedia(abs).catch(() => ({ duration: 0, hasAudio: false }))
    return `已生成本地配音：${out}（${info.duration}s${info.hasAudio ? '，含音轨' : ''}；引擎 VoiceStudio，音色 ${voiceRaw}）\n请把路径登记到 project.json 对应场景的 voice 字段。`
  }
  const provider = providers.find((p) => p.id === settings.ttsProviderId) || providers.find((p) => (p.baseUrl || '').includes('dashscope')) || providers.find((p) => /api\.openai\.com|openai/i.test(p.baseUrl || ''))
  if (!provider) return '未找到可用的 TTS 提供方：请在 API 仓库添加「百炼」或 OpenAI 兼容接口，并在 设置 → 媒体引擎 中指定。'
  const key = await getSecret(provider.id)
  const isDash = (provider.baseUrl || '').includes('dashscope')
  const model = settings.ttsModel || (isDash ? 'qwen-tts' : 'tts-1')
  const voice = String(call.voice || settings.ttsVoice || (isDash ? 'Cherry' : 'alloy'))
  try {
    if (isDash) {
      const root = provider.baseUrl.replace(/\/compatible-mode\/v1\/?$/, '')
      // ★ qwen-tts 系列：input.text + input.voice（旧形状 messages 会报 Field required: input.text，这里做兼容回退）
      const shapes = [
        { input: { text: String(text).slice(0, 3000), voice }, parameters: {} },
        { input: { text: String(text).slice(0, 3000) }, parameters: { voice } },
        { input: { messages: [{ role: 'user', content: [{ text: String(text).slice(0, 3000) }] }] }, parameters: { voice } },
      ]
      let j = null; let ok = false
      for (const sh of shapes) {
        const r = await fetch(joinUrl(root, 'api/v1/services/aigc/multimodal-generation/generation'), {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, ...sh }),
        })
        j = await r.json().catch(() => null)
        if (r.ok && !j?.code) { ok = true; break }
        // 仅当错误与请求形状/音色相关时换下一种形状，其他错误直接返回
        if (!/text|voice|required|InvalidParameter/i.test(String(j?.code || '') + String(j?.message || ''))) break
      }
      if (!ok) return `TTS 失败：${j?.message || j?.code || '未知错误'}`
      const url = j?.output?.audio?.url || j?.output?.audio_url || j?.output?.audio?.data
      if (!url) return `TTS 未返回音频地址：${JSON.stringify(j).slice(0, 300)}`
      if (String(url).startsWith('data:')) {
        const b64 = String(url).split(',')[1] || ''
        await writeFile(abs, Buffer.from(b64, 'base64'))
      } else await downloadTo(url, abs)
    } else {
      const r = await fetch(joinUrl(provider.baseUrl, 'audio/speech'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, input: String(text).slice(0, 3000), voice, response_format: out.endsWith('.wav') ? 'wav' : 'mp3' }),
      })
      if (!r.ok) return `TTS 失败：HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`
      await writeFile(abs, Buffer.from(await r.arrayBuffer()))
    }
  } catch (e) { return `TTS 调用失败：${e.message}` }
  const info = await probeMedia(abs).catch(() => ({ duration: 0, hasAudio: false }))
  return `已生成配音：${out}（${info.duration}s${info.hasAudio ? '，含音轨' : ''}）\n请把路径登记到 project.json 对应场景的 voice 字段（相对 video-project 目录）。`
}
// 配乐：优先用户 bgm/ 目录，其次 ffmpeg 合成氛围垫乐（CC0，自生成）
async function generateMusic(call, ctx) {
  const dur = Math.max(3, Math.min(300, Number(call.dur) || 30))
  const style = String(call.style || 'calm').toLowerCase()
  const out = String(call.out || `audio/bgm-${Date.now()}.mp3`).replace(/\\/g, '/')
  const abs = resolveInWorkspace(out, ctx.root)
  await mkdir(path.dirname(abs), { recursive: true })
  const bgmDir = path.join(ctx.root, 'bgm')
  const files = (await readdir(bgmDir).catch(() => [])).filter((f) => /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(f))
  const jsonList = files.map((f) => `bgm/${f}`).join('、') || '（空）'
  if (call.list) return `工作区 bgm/ 目录下的音乐：${jsonList}`
  const pickName = call.pick ? files.find((f) => f.includes(String(call.pick))) : (call.useLibrary !== false && files.length ? files[0] : '')
  if (pickName) {
    await copyFile(path.join(bgmDir, pickName), abs)
    const info = await probeMedia(abs).catch(() => ({ duration: 0 }))
    return `已选用本机音乐：bgm/${pickName} → ${out}（${info.duration}s）`
  }
  // 合成氛围垫乐（各风格 = 不同和声组合 + 慢速起伏 + 低通 + 回声；无版权负担）
  const freqs = { calm: [196, 247, 294], warm: [220, 277, 330], tense: [110, 131, 165], uplift: [262, 330, 392] }[style] || [196, 247, 294]
  const expr = freqs.map((f, k) => `${(0.20 - k * 0.04).toFixed(2)}*sin(2*PI*${f}*t)`).join('+')
  const aev = `aevalsrc=${expr}:s=44100:d=${dur}`
  await runFfmpeg([
    '-y', '-f', 'lavfi', '-i', aev,
    '-af', `tremolo=f=0.12:d=0.35,lowpass=f=1400,aecho=0.7:0.5:140|280:0.3|0.18,afade=t=in:st=0:d=1.5,afade=t=out:st=${(dur - 2.5).toFixed(2)}:d=2.5`,
    '-c:a', 'libmp3lame', '-b:a', '160k', abs,
  ], 120000)
  const info = await probeMedia(abs).catch(() => ({ duration: 0 }))
  return `已合成氛围配乐（风格 ${style}）：${out}（${info.duration}s，CC0 自生成）\n提示：你也可以把喜欢的音乐放到工作区 bgm/ 目录，然后 pick:"文件名" 直接选用。`
}
// 字幕生成：按 project.json + 实测配音时长
async function makeSubtitles(call, ctx) {
  let proj
  try { proj = await loadVideoProject(ctx.root, call.project) } catch { return '未找到 project.json：请先由编剧创建视频工程文件（video-project/project.json）' }
  const tl = await planTimeline(ctx.root, proj)
  const srt = await buildSrt(ctx.root, proj, tl)
  if (!srt.trim()) return '工程内没有任何文案（scenes[].narration 为空），无需字幕'
  const srtRel = String(call.out || `${proj._dir}/subs/final.srt`).replace(/\\/g, '/')
  const srtAbs = resolveInWorkspace(srtRel, ctx.root)
  await mkdir(path.dirname(srtAbs), { recursive: true })
  await writeFile(srtAbs, srt, 'utf8')
  // ★ 同时生成 ASS（字号/边距按画幅精确控制，合成时优先使用）
  const ass = buildAss(proj, tl)
  const assRel = srtRel.replace(/\.srt$/i, '.ass')
  if (ass) { await writeFile(resolveInWorkspace(assRel, ctx.root), ass, 'utf8') }
  const count = (srt.match(/-->/g) || []).length
  return `已生成字幕：${assRel}（ASS，用于烧录）+ ${srtRel}（SRT，便于查看），共 ${count} 条，时间轴与配音时长对齐`
}
// 合成成片：归一化 → 转场拼接 → 混音（配音+BGM）→ 烧字幕输出
async function composeVideo(call, ctx, onProgress) {
  let proj
  try { proj = await loadVideoProject(ctx.root, call.project) } catch { return '未找到 project.json：请先准备视频工程文件' }
  await ensureFfmpeg()
  const dirAbs = resolveInWorkspace(proj._dir, ctx.root)
  const workAbs = path.join(dirAbs, 'work')
  await mkdir(workAbs, { recursive: true })
  const tl = await planTimeline(ctx.root, proj)
  if (!tl.scenes.length) return '工程 scenes 为空'
  const meta = proj.meta || {}
  const isV = meta.aspect === '16:9'
  const W = Number(meta.width) || (isV ? 1280 : 1080)
  const H = Number(meta.height) || (isV ? 720 : 1920)
  const fps = Number(meta.fps) || 30
  const dirAbsEarly = resolveInWorkspace(proj._dir, ctx.root)
  const toCmdEarly = (abs) => path.relative(dirAbsEarly, abs).replace(/\\/g, '/') // 以工程目录为 cwd 的相对路径
  onProgress?.('归一化镜头', `0/${tl.scenes.length}`, 5)
  // A. 归一化每个镜头（缺失镜头自动用黑场占位并在结果中明确警告）
  const missingShots = []
  for (const t of tl.scenes) {
    const shotRel = t.sc.shot ? String(t.sc.shot).replace(/\\/g, '/') : ''
    const outRel = `work/n${t.i}.mp4`
    const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps},format=yuv420p`
    const shotAbs = shotRel ? resolveMediaFile(ctx.root, proj._dir, shotRel) : ''
    const srcArg = shotAbs ? toCmdEarly(shotAbs) : ''
    if (shotAbs) {
      await runFfmpeg(['-y', '-i', srcArg, '-t', String(t.dur), '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', outRel], 600000, dirAbs)
    } else {
      if (shotRel) missingShots.push(t.sc.id ?? t.i + 1)
      await runFfmpeg(['-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=${t.dur}:r=${fps}`, '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', outRel], 300000, dirAbs)
    }
    onProgress?.('归一化镜头', `${t.i + 1}/${tl.scenes.length}${shotAbs ? '' : '（缺镜头，黑场占位）'}`, 5 + Math.round((t.i + 1) / tl.scenes.length * 30))
  }
  // B. 转场拼接（xfade 链）
  onProgress?.('拼接与转场', '', 40)
  let acc = 'work/n0.mp4'
  let accDur = tl.scenes[0].dur
  for (let i = 1; i < tl.scenes.length; i++) {
    const offset = Math.max(0, accDur - XFADE_DUR)
    const outRel = `work/acc${i}.mp4`
    await runFfmpeg(['-y', '-i', acc, '-i', `work/n${i}.mp4`, '-filter_complex', `[0:v][1:v]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset.toFixed(3)}[v]`, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', outRel], 600000, dirAbs)
    acc = outRel
    accDur = accDur + tl.scenes[i].dur - XFADE_DUR
  }
  // C. 音轨：配音（按时间线延迟）+ BGM（循环/音量/淡入淡出）→ 混音
  onProgress?.('混音', '', 60)
  const total = Math.max(accDur, tl.total)
  const inputArgs = []
  const fParts = []
  const voLabels = []
  let idx = 0
  const missingVoices = []
  for (const t of tl.scenes) {
    if (!t.voiceRel) continue
    const vAbs = resolveMediaFile(ctx.root, proj._dir, t.voiceRel)
    if (!vAbs) { missingVoices.push(t.sc.id ?? t.i + 1); continue }
    inputArgs.push('-i', toCmdEarly(vAbs))
    const delay = Math.round(t.voiceStart * 1000)
    fParts.push(`[${idx}:a]adelay=${delay}|${delay},volume=1.0[v${idx}]`)
    voLabels.push(`[v${idx}]`)
    idx++
  }
  const bgmRel = meta.music && meta.music.file ? String(meta.music.file).replace(/\\/g, '/') : ''
  const bgmAbs = bgmRel ? resolveMediaFile(ctx.root, proj._dir, bgmRel) : ''
  let bgLabel = ''
  if (bgmAbs) {
    inputArgs.push('-stream_loop', '-1', '-i', toCmdEarly(bgmAbs))
    const vol = Number(meta.music?.volumeDb ?? -18)
    const fadeOutStart = Math.max(0, total - 2.5).toFixed(2)
    fParts.push(`[${idx}:a]volume=${vol}dB,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=2.5,atrim=0:${total.toFixed(3)}[bg]`)
    bgLabel = '[bg]'
    idx++
  }
  let mixRel = ''
  if (voLabels.length || bgLabel) {
    if (voLabels.length && bgLabel) {
      fParts.push(`${voLabels.join('')}amix=inputs=${voLabels.length}:normalize=0[vo]`)
      fParts.push('[vo][bg]amix=inputs=2:normalize=0,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11[a]')
    } else if (voLabels.length) {
      fParts.push(`${voLabels.join('')}amix=inputs=${voLabels.length}:normalize=0,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11[a]`)
    } else {
      fParts.push('[bg]alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11[a]')
    }
    mixRel = 'work/mix.m4a'
    await runFfmpeg(['-y', ...inputArgs, '-filter_complex', fParts.join(';'), '-map', '[a]', '-t', total.toFixed(3), '-c:a', 'aac', '-b:a', '192k', mixRel], 600000, dirAbs)
  }
  // D. 合并 + 旋转字幕 + 首尾淡入淡出
  onProgress?.('输出成片', '', 85)
  // ★ 字幕优先用 ASS（字号/边距按画幅精确控制）；没有 ASS 时退回 SRT + force_style
  const assAbs = resolveInWorkspace(`${proj._dir}/subs/final.ass`, ctx.root)
  const srtAbs = resolveInWorkspace(`${proj._dir}/subs/final.srt`, ctx.root)
  const useAss = existsSync(assAbs)
  const hasSub = useAss || existsSync(srtAbs)
  // ★ 所有 ffmpeg 参数路径都换算成「工程目录相对路径」（cwd=工程目录），避免路径重复拼接
  const toCmd = (abs) => path.relative(dirAbs, abs).replace(/\\/g, '/')
  const style = 'FontName=Microsoft YaHei,FontSize=10,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=8'
  const subFilter = hasSub ? (useAss ? `subtitles=${toCmd(assAbs)}` : `subtitles=${toCmd(srtAbs)}:force_style='${style}'`) + ',' : ''
  const vf = `${subFilter}fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, total - 0.6).toFixed(2)}:d=0.6`
  const outRel = String(call.out || `${proj._dir}/cut/final.mp4`).replace(/\\/g, '/')
  const outAbs = resolveInWorkspace(outRel, ctx.root)
  await mkdir(path.dirname(outAbs), { recursive: true })
  const dArgs = ['-y', '-i', acc, ...(mixRel ? ['-i', mixRel] : []), '-vf', vf, '-map', '0:v']
  if (mixRel) dArgs.push('-map', '1:a')
  dArgs.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), toCmd(outAbs))
  await runFfmpeg(dArgs, 1800000, dirAbs)
  const info = await probeMedia(outAbs, { loudness: true }).catch(() => ({}))
  onProgress?.('完成', outRel, 100)
  const warns = []
  if (missingShots.length) warns.push(`镜头文件缺失 ${missingShots.length} 个（已黑场占位）：镜 ${missingShots.join('、')} —— 必须返工补生成后重新合成`)
  if (missingVoices.length) warns.push(`配音文件缺失 ${missingVoices.length} 个：镜 ${missingVoices.join('、')}`)
  if (info.black) warns.push(`成片画面亮度过低（avgY=${info.avgY}），疑似黑屏，请检查镜头素材`)
  return `已合成成片：${outRel}
- 时长：${info.duration ?? '?'}s · 分辨率：${info.width ?? '?'}x${info.height ?? '?'} · 音轨：${info.hasAudio ? '有' : '无'}${info.loudness ? ` · 响度：${info.loudness.input_i} LUFS（目标 -16）` : ''}${info.avgY != null ? ` · 平均亮度：${info.avgY}` : ''}
- 规格：${tl.scenes.length} 个镜头，转场 ${XFADE_DUR}s${hasSub ? `，已烧录字幕（${useAss ? 'ASS' : 'SRT'}）` : '（无字幕文件）'}
${warns.length ? '★ 警告：\n- ' + warns.join('\n- ') + '\n' : ''}请用 media_probe 复核并交付质检。`
}
// 百炼视频：i2v 需要公网可访问的图片 → 走官方临时存储上传（getPolicy → OSS → oss://）
async function dashscopeUploadImage(provider, absPath, model) {
  const key = await getSecret(provider.id)
  const st = await stat(absPath); const fname = path.basename(absPath)
  const pj = await (await fetch(`https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}&file_name=${encodeURIComponent(fname)}&file_size=${st.size}`, { headers: { Authorization: `Bearer ${key}` } })).json()
  const d = pj && pj.data
  if (!d || !d.upload_host || !d.upload_dir) throw new Error(`临时上传凭证失败：${JSON.stringify(pj).slice(0, 200)}`)
  const form = new FormData()
  form.append('OSSAccessKeyId', d.oss_access_key_id)
  form.append('policy', d.policy)
  form.append('Signature', d.signature)
  form.append('key', `${d.upload_dir}/${fname}`)
  form.append('x-oss-object-acl', d.x_oss_object_acl || 'private')
  form.append('x-oss-forbid-overwrite', String(d.x_oss_forbid_overwrite ?? 'true'))
  form.append('success_action_status', '200')
  form.append('file', new Blob([await readFile(absPath)]), fname)
  const up = await fetch(d.upload_host, { method: 'POST', body: form })
  if (!up.ok) throw new Error(`图片上传失败 HTTP ${up.status}`)
  return `oss://${d.upload_dir}/${fname}`
}
async function generateVideo(provider, model, prompt, name, opts = {}) {
  const base = provider.baseUrl || ''
  const key = await getSecret(provider.id)
  const headers = { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }
  if (!base.includes('dashscope')) throw new Error('当前仅支持阿里云百炼（dashscope）的视频模型')
  const root = base.replace(/\/compatible-mode\/v1\/?$/, '')
  // ★ 图生视频：先上传关键帧拿 oss:// 引用；失败则回退文生视频。
  //   关键帧路径容错：工作区相对 → 输出目录相对 → artifacts/ 相对 → 全局 artifacts 目录
  let imgUrl = ''
  if (opts.image && opts.root) {
    const img = String(opts.image).replace(/\\/g, '/')
    const cands = [img]
    if (opts.out) cands.push(path.posix.join(path.posix.dirname(String(opts.out).replace(/\\/g, '/')), img))
    cands.push('artifacts/' + path.posix.basename(img))
    let imgAbs = ''
    for (const c of cands) { const a = resolveInWorkspace(c, opts.root); if (existsSync(a)) { imgAbs = a; break } }
    if (!imgAbs) {
      const g = path.join(getArtifactDir(), path.basename(img))
      if (existsSync(g)) imgAbs = g
    }
    if (!imgAbs) throw new Error(`图生视频的关键帧文件不存在：${opts.image}（请先用 generate_image 生成并带 out 参数保存到工作区内，如 out:"video-project/keyframes/k01.png"）`)
    try { imgUrl = await dashscopeUploadImage(provider, imgAbs, model) } catch (e) { dbg('video.upload_fail', { message: e.message }) }
  }
  const sizeMap = { '9:16': '720*1280', '16:9': '1280*720' }
  const size = opts.size || (opts.aspect && sizeMap[opts.aspect]) || '1280*720'
  // ★ 单次提交（可带/不带关键帧）+ 轮询；用 oss:// 时必须加 X-DashScope-OssResourceResolve 请求头
  const submitAndWait = async (useImage) => {
    const input = { prompt }
    if (useImage && imgUrl) input.img_url = imgUrl
    const reqHeaders = { ...headers, 'X-DashScope-Async': 'enable' }
    if (useImage && imgUrl && imgUrl.startsWith('oss://')) reqHeaders['X-DashScope-OssResourceResolve'] = 'enable'
    dbg('video.synth_submit', { model, useImage, hasImg: !!input.img_url, img: String(input.img_url || '').slice(0, 60), size })
    const r = await fetch(joinUrl(root, 'api/v1/services/aigc/video-generation/video-synthesis'), {
      method: 'POST', headers: reqHeaders,
      body: JSON.stringify({ model, input, parameters: { size } }),
    })
    const j = await r.json().catch(() => null)
    if (!r.ok || j?.code) throw new Error(`视频生成失败：${j?.message || `HTTP ${r.status}`}`)
    const taskId = j?.output?.task_id
    for (let i = 0; i < 240; i++) {
      await new Promise((s) => setTimeout(s, 3000))
      const qj = await (await fetch(joinUrl(root, `api/v1/tasks/${taskId}`), { headers: { Authorization: `Bearer ${key}` } })).json().catch(() => null)
      const st = qj?.output?.task_status
      if (st === 'SUCCEEDED') return { url: qj?.output?.video_url || (qj?.output?.results || [])[0]?.url, taskId }
      if (st === 'FAILED') throw new Error(qj?.output?.message || '任务失败')
    }
    throw new Error('视频生成超时')
  }
  let result
  try {
    result = await submitAndWait(!!imgUrl)
  } catch (e) {
    // ★ 图生视频失败（含被内容审核拒绝）自动回退文生视频（不带关键帧重新提交一次）
    if (imgUrl) {
      dbg('video.i2v_retry', { reason: e.message })
      result = await submitAndWait(false).catch((e2) => { throw new Error(`图生视频失败（${e.message}）；回退文生视频也失败（${e2.message}）`) })
    } else throw e
  }
  if (!result.url) throw new Error('未返回视频地址')
  // ★ 输出位置：优先 call/out 指定的工程路径（相对工作区），否则沿用 artifacts/
  let absOut, relOut
  if (opts.out) {
    relOut = String(opts.out).replace(/\\/g, '/')
    absOut = resolveInWorkspace(relOut, opts.root || getActiveRoot())
  } else {
    const fname = `${String(name || '').replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 40) || `video-${Date.now()}`}.mp4`
    absOut = path.join(getArtifactDir(), fname)
    relOut = 'artifacts/' + fname
  }
  if (opts.skipDownload) return [relOut, result.taskId, result.url]
  await mkdir(path.dirname(absOut), { recursive: true })
  await downloadTo(result.url, absOut)
  return [`/api/artifact?path=${encodeURIComponent(relOut)}`, relOut]
}

/* ═══════════════════════════════════════════════════════════════
 * 十一、多智能体团队（含成本统计）
 * ═══════════════════════════════════════════════════════════════ */
async function runTeam(task, opts = {}) {
  const run = opts.run || { id: crypto.randomUUID(), listeners: new Set(), buffer: [], paused: false, pausedAgents: new Set(), pausedReasons: new Set(), resumeWaiters: [], abort: false, finished: false }
  const send = (o) => runEmit(run, o)
  const taskId = run.id
  const startedAt = Date.now()
  // ★ 团队会话：工作区与权限跟随会话（没有会话时退回全局工作区）
  const sess = opts.session || null
  // ★ 协作询问写进会话历史（刷新后仍可见）
  const recordAsk = (info) => { if (!sess) return; sess.messages.push({ role: 'assistant', kind: 'team-ask', from: info.from, to: info.to, question: String(info.question || '').slice(0, 2000), t: Date.now() }); sess.updatedAt = Date.now(); saveSessions().catch(() => {}) }
  const recordAskDone = (info) => { if (!sess) return; sess.messages.push({ role: 'assistant', kind: 'team-ask-done', from: info.from, to: info.to, answer: String(info.answer || '').slice(0, 2000), t: Date.now() }); sess.updatedAt = Date.now(); saveSessions().catch(() => {}) }
  const root = sess?.workspace && existsSync(sess.workspace) ? sess.workspace : getActiveRoot()
  const permission = sess?.permission || settings.defaultPermission || 'modify'
  const autoState = { approvedAll: false }
  send({ type: 'session', taskId })
  // ★ 任务索引：先登记 running 状态（支持并发运行多个任务）
  const idxFile = path.join(TASKS_DIR, 'index.json')
  const readTaskIndex = async () => { try { return existsSync(idxFile) ? JSON.parse(await readFile(idxFile, 'utf8')) : [] } catch { return [] } }
  const writeTaskIndex = async (list) => { await writeFile(idxFile, JSON.stringify(list.slice(0, 200), null, 2), 'utf8'); bumpRev('tasks') }
  await writeTaskIndex([{ id: taskId, task, sessionId: sess?.id || '', summary: '', steps: 0, startedAt, status: 'running' }, ...(await readTaskIndex()).filter((x) => x.id !== taskId)])
  let totalCost = 0
  let taskToolCalls = 0
  let budgetStopped = false
  const roleUsage = {}
  const totalUsage = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0 }

  // ★ 暂停/终止检查点：暂停时挂起等待恢复；用户终止时返回 false
  const gate = async (agent) => {
    const ok = await waitWhilePaused(run, agent)
    if (!ok) send({ type: 'error', message: '任务已被用户终止' })
    return ok
  }

  // ★ 任务提前失败时也要落盘（否则历史里永远卡在 running）
  const failTask = async (message) => {
    send({ type: 'error', message })
    try {
      const entry = { id: taskId, task, sessionId: sess?.id || '', summary: message, steps: 0, startedAt, finishedAt: Date.now(), status: 'failed', cost: Number(totalCost.toFixed(6)), tokens: totalUsage.prompt_tokens + totalUsage.completion_tokens, cacheHitTokens: totalUsage.prompt_cache_hit_tokens, toolCalls: taskToolCalls }
      await writeTaskIndex([entry, ...(await readTaskIndex()).filter((x) => x.id !== taskId)])
    } catch { /* ignore */ }
  }

  // ★ 预算检查：角色预算（role.budgetCost）与任务总预算（settings.taskBudgetCost）
  const checkBudget = (agent) => {
    if (budgetStopped) return true
    const role = roleById(agent)
    const ru = roleUsage[agent] || {}
    if (role?.budgetCost > 0 && (ru.cost || 0) > role.budgetCost) {
      budgetStopped = true
      send({ type: 'limit', agent, message: `角色「${role.label}」预算 ¥${role.budgetCost} 已用完，已停止该角色` })
      return true
    }
    if (settings.taskBudgetCost > 0 && totalCost > settings.taskBudgetCost) {
      budgetStopped = true
      send({ type: 'limit', agent, message: `任务总预算 ¥${settings.taskBudgetCost} 已用完，任务已停止` })
      return true
    }
    return false
  }

  const trackUsage = (agent, provider, model) => (usage) => {
    const price = getPrice(provider, model)
    const cost = calcCost(price, usage)
    if (cost != null) totalCost += cost
    for (const k of Object.keys(totalUsage)) totalUsage[k] += usage?.[k] || 0
    const ru = (roleUsage[agent] ||= { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cost: 0 })
    ru.promptTokens += usage?.prompt_tokens || 0
    ru.completionTokens += usage?.completion_tokens || 0
    ru.cacheHitTokens += usage?.prompt_cache_hit_tokens || 0
    ru.cost = Number((ru.cost + (cost || 0)).toFixed(6))
    statsAdd({ role: agent, model, usage, cost: cost || 0 })
    send({ type: 'usage', agent, usage, cost, cacheHit: usage?.prompt_cache_hit_tokens || 0, contextLimit: getContextLimit(provider, model), totalCost: Number(totalCost.toFixed(6)) })
    checkBudget(agent)
  }
  const getRole = (r) => {
    const role = roleById(r) || roleById('planner') || roles[0]
    if (!role) throw new Error('还没有配置任何团队角色')
    const target = resolveRoleTarget(role)
    if (!target) throw new Error(`角色「${role.label}」没有可用的对话模型（请检查其 API 与模型配置）`)
    return { role, provider: target.provider, model: target.model }
  }
  // ★ 中途指令取出（agent 或 * 全体）；取出的同时记录到会话与复评清单
  const steersTaken = []
  const takeSteers = (agent) => {
    const list = teamSteers.get(taskId) || []
    const mine = list.filter((s) => s.agent === agent || s.agent === '*')
    if (mine.length) {
      teamSteers.set(taskId, list.filter((s) => !mine.includes(s)))
      for (const s of mine) {
        steersTaken.push({ agent, message: s.message })
        if (sess) sess.messages.push({ role: 'assistant', kind: 'team-steer', agent, content: s.message, t: Date.now() })
      }
    }
    return mine
  }

  // 1. 队长规划：允许调研（web_search/web_fetch）、向用户提问（ask_user）、与队员商量（ask_role）
  const leader = getRole('leader')
  const enabledOthers = roles.filter((r) => r.enabled !== false && r.id !== 'leader')
  send({ type: 'agent_start', agent: 'leader', label: leader.role.label, model: `${leader.provider.name} / ${leader.model}` })
  const leaderMsgs = [
    { role: 'system', content: leaderSystemPrompt(leader.role) },
    { role: 'user', content: `用户任务：${task}\n\n（当前工作区目录：${root}，所有文件读写与命令执行都在该目录内）\n规划阶段你可以：先调研（web_search/web_fetch 了解题材背景）、必要时用 ask_user 向用户提问确认需求（会暂停等待用户回答）、用 ask_role 与队员商量。信息足够后，只输出 JSON 分工计划，不要执行任务本身。` },
  ]
  let leaderText = '', leaderEmptyRetried = false
  try {
    for (let turn = 0; turn < 4; turn++) {
      if (!(await gate('leader'))) break
      leaderText = await chatComplete(leader.provider, leader.model, leaderMsgs, { stream: true, temperature: 0.4, reasoningEffort: leaderEmptyRetried ? 'none' : (sess?.effort || undefined), onDelta: (d) => send({ type: 'delta', agent: 'leader', text: d }), onReasoning: (r) => send({ type: 'reasoning', agent: 'leader', text: r }), onUsage: trackUsage('leader', leader.provider, leader.model) })
      if (!leaderText.trim()) {
        if (leaderEmptyRetried) break
        leaderEmptyRetried = true
        leaderMsgs.push({ role: 'user', content: '你上一轮没有输出正文（全部消耗在思考中）。请关闭思考，直接继续。' })
        continue
      }
      // ★ 工具优先于计划：如果这一轮里有 ask_user/ask_role/搜索，先执行完（等用户回答）再接受计划，
      // 避免"队长还在提问、其他成员已经开始干活"
      const calls = extractToolCalls(leaderText).filter((c) => ['web_search', 'web_fetch', 'ask_user', 'ask_role'].includes(c.tool))
      if (!calls.length) {
        if (extractPlan(leaderText)) break
        break
      }
      leaderMsgs.push({ role: 'assistant', content: leaderText })
      const outs = []
      for (const call of calls) {
        if (!(await gate('leader'))) break
        let r
        if (call.tool === 'ask_user') r = await toolAskUser(call, (q) => send({ type: 'question', ...q }))
        else if (call.tool === 'ask_role') r = await askRoleImpl(call, { task, reportUsage: (a, p, m, u) => trackUsage(a, p, m)(u) })
        else r = await runTool(call)
        taskToolCalls++
        send({ type: 'tool', agent: 'leader', call: call.tool, detail: call.query || call.url || call.question || call.role || '', result: String(r).slice(0, 1500) })
        outs.push(`【工具结果】${call.tool}\n${r}`)
      }
      leaderMsgs.push({ role: 'user', content: outs.join('\n\n') + '\n\n请根据以上信息继续；若信息已足够，输出最终 JSON 计划。' })
    }
  } catch (e) { await failTask(`队长调用失败：${e.message}`); return }
  let plan = extractPlan(leaderText)
  // ★ 计划解析失败时：先让队长把内容“修复”为 JSON，再不行则自动兜底为单步计划（避免整个任务失败）
  if (!plan) {
    send({ type: 'delta', agent: 'leader', text: '\n\n（队长输出格式未规范，正在自动整理为计划…）' })
    try {
      const ids = enabledOthers.map((r) => `"${r.id}"（${r.label}）`).join('、')
      const repaired = await chatComplete(leader.provider, leader.model, [
        { role: 'system', content: `你是 JSON 修复器。把用户的文本整理成一个执行计划，直接输出 JSON 对象（不要代码块以外的任何文字）：
{"summary":"一句话概括","steps":[{"agent":"角色id","title":"步骤标题","instruction":"给该角色的具体指令"}]}
可用角色 id 只能取：${ids}。` },
        { role: 'user', content: String(leaderText).slice(0, 12000) },
      ], { stream: false, temperature: 0.2, jsonMode: true, onUsage: trackUsage('leader', leader.provider, leader.model) })
      plan = extractPlan(repaired)
    } catch { /* ignore */ }
  }
  if (!plan) {
    const fb = enabledOthers.find((r) => r.id === 'coder' || r.id === 'programmer') || enabledOthers[0]
    if (!fb) { await failTask('队长没有输出可解析的计划 JSON，且没有启用的角色可用于兜底。'); return }
    plan = { summary: '队长未输出 JSON，已自动兜底为单步执行', steps: [{ agent: fb.id, title: '执行任务', instruction: task }] }
    send({ type: 'delta', agent: 'leader', text: `\n\n（已兜底：由「${fb.label}」单角色执行该任务）` })
  }
  send({ type: 'plan', summary: plan.summary, steps: plan.steps })
  // ★ 队长长期记忆：记住这次任务与规划（之后单独对话时不再"失忆"）
  try {
    roleChatAppend('leader', 'user', `【团队任务】${String(task).slice(0, 500)}`)
    roleChatAppend('leader', 'assistant', `【团队任务·我的规划】${plan.summary || ''}\n${plan.steps.map((s, i) => `${i + 1}. ${roleById(s.agent)?.label || s.agent}：${s.title}`).join('\n')}`)
  } catch { /* ignore */ }
  // ★ 增量保存：计划一出就写入会话（即使中途断开，历史里也能看到任务和计划）
  if (sess) {
    try {
      sess.messages.push({ role: 'user', kind: 'team-task', content: task, t: startedAt })
      sess.messages.push({ role: 'assistant', kind: 'team-plan', summary: plan.summary, steps: plan.steps, t: Date.now() })
      if (!sess.title) sess.title = task.slice(0, 40)
      sess.updatedAt = Date.now()
      await saveSessions()
    } catch { /* ignore */ }
  }

  // 2. 依次执行角色（工具轮次由「工具调用限制」设置决定：默认无限）
  const results = []
  let reworkCount = 0
  const STEP_FAIL_RE = /不通过|验证失败|未找到|不存在|MISSING|无法运行|无法加载/i
  for (let i = 0; i < plan.steps.length; i++) {
    if (budgetStopped || run.abort) break
    if (!(await gate('*'))) break
    const step = plan.steps[i]
    const wanted = findRole(step.agent)
    const roleId = wanted && wanted.enabled !== false ? wanted.id : (enabledOthers[0]?.id || roles[0]?.id)
    let agent
    try { agent = getRole(roleId) } catch (e) { await failTask(e.message); return }
    send({ type: 'step_start', index: i, agent: roleId, label: agent.role.label, title: step.title, model: `${agent.provider.name} / ${agent.model}` })
    const contextText = results.map((r) => `【${roleById(r.agent)?.label || r.agent}·${r.title}】\n${r.result.slice(0, 3000)}`).join('\n\n')
    // ★ 工作区快照：直接给出文件树现状，减少反复 list_files/read_file（省 token、省等待）
    const digest = await projectDigest(root, 50)
    // ★ .oat 常驻项目档案：注入项目历史（任务/产物线索），让每一步都带着项目记忆干活
    const projMem = await projectMemoryDigest(root)
    // ★ 本地知识库（RAG）：按本步骤内容检索项目文档并注入
    kbMaybeRefresh(root).catch(() => {})
    const kb = await kbDigest(root, `${task} ${step.title} ${step.instruction}`)
    const messages = [
      { role: 'system', content: roleSystemPrompt(agent.role) },
      { role: 'user', content: `总任务：${task}\n（当前工作区目录：${root}）\n\n${digest}${projMem ? '\n\n' + projMem : ''}${kb ? '\n\n' + kb : ''}\n\n本步骤（${step.title}）：${step.instruction}\n\n此前产出：\n${contextText || '（无）'}\n\n（提示：工作区快照已给出文件现状，请直接据此行动；确需细节时再按需读取个别文件，避免全量重复翻查；项目文档检索可用 kb_search 工具。）` },
    ]
    // ★ 工具调用限制：角色单独设置优先，否则用全局「团队任务」限制；0=无限
    const roleLimit = effectiveToolLimit(agent.role, 'team')
    const stepMaxTurns = roleLimit === -1 ? 1 : roleLimit > 0 ? Math.min(roleLimit + 3, 40) : 40
    let stepToolCalls = 0
    let limitHit = ''
    let stepText = '', turn = 0, emptyRetried = false
    try {
      while (turn < stepMaxTurns) {
        if (budgetStopped || run.abort) break
        if (!(await gate(roleId))) break
        turn++
        // ★ 用户中途指令：每轮开始前检查（可对单个角色下达）
        for (const s of takeSteers(roleId)) {
          send({ type: 'steer', agent: roleId, message: s.message })
          messages.push({ role: 'user', content: `【用户中途指令】${s.message}\n请遵循该指令调整你的工作并继续。` })
        }
        if (sess) saveSessions().catch(() => {})
        // ★ 空正文重试时关闭思考（reasoning_effort=none）：避免再次把全部输出预算烧在思考里
        // ★ 推理等级：优先用该团队会话的滑块设置（sess.effort）
        const effortOverride = emptyRetried ? 'none' : (sess?.effort || undefined)
        const turnText = await chatComplete(agent.provider, agent.model, messages, { stream: true, temperature: 0.4, reasoningEffort: effortOverride, onDelta: (d) => send({ type: 'delta', agent: roleId, text: d, turn }), onReasoning: (r) => send({ type: 'reasoning', agent: roleId, text: r, turn }), onUsage: trackUsage(roleId, agent.provider, agent.model) })
        stepText += turnText
        // ★ 推理模型可能把输出预算全耗在思考里（正文为空）：只重试一次，且关闭思考
        if (!turnText.trim() && !emptyRetried) {
          emptyRetried = true
          messages.push({ role: 'user', content: '你上一轮没有输出任何正文（全部消耗在内部思考中）。请关闭思考、立即给出简洁的最终答复；如需调用工具，直接输出工具块。' })
          continue
        }
        if (!turnText.trim()) break
        const calls = extractToolCalls(turnText)
        // ★ 工具块 JSON 解析失败检测（大文件未转义引号等）：提示模型重发，避免"以为写了其实没写"
        const blockCount = (turnText.match(/```tool\s*[\s\S]*?```/g) || []).length
        if (blockCount > calls.length) {
          messages.push({ role: 'assistant', content: turnText })
          messages.push({ role: 'user', content: `你上一条回复里有 ${blockCount - calls.length} 个工具块 JSON 解析失败（通常是内容太长、引号/换行未转义）。请重发这些操作：确保 JSON 严格合法；写大文件时可以拆成多个较小的 write_file（如 xxx_part1.js、xxx_part2.js）；发出后用 list_files 核对文件确实存在。` })
          continue
        }
        if (!calls.length) break
        messages.push({ role: 'assistant', content: turnText })
        const toolResults = []
        // ★ 工具次数限制：禁止 / 达到上限时停止执行，并明确告知模型与用户
        if (roleLimit === -1) {
          messages.push({ role: 'user', content: '工具调用已被用户设置为「禁止」。请直接用已有信息回答，不要再输出工具块。' })
          send({ type: 'notice', agent: roleId, text: `${agent.role.label} 的工具调用被设置为「禁止」，本轮仅文字输出。` })
          limitHit = 'off'
          break
        }
        if (roleLimit > 0 && stepToolCalls >= roleLimit) {
          messages.push({ role: 'user', content: `工具调用次数已达用户设置的上限（${roleLimit} 次）。请基于已有结果给出当前阶段结论，不要再调用工具。` })
          send({ type: 'notice', agent: roleId, text: `${agent.role.label} 的工具调用已达上限（${roleLimit} 次）：已完成部分已保留，可提高上限或发送中途指令让它继续。` })
          limitHit = 'limit'
          break
        }
        for (const call of calls) {
          if (!(await gate(roleId))) break
          if (roleLimit > 0 && stepToolCalls >= roleLimit) break
          stepToolCalls++
          // ★ 角色独立权限：该角色单独设置了权限则覆盖会话权限
          const rolePerm = PERMISSIONS.includes(agent.role.permission) ? agent.role.permission : permission
          const result = await runToolGuarded(call, {
            root, permission: rolePerm, session: sess, autoState, task, run, agentId: roleId,
            reportUsage: (a, p, m, u) => trackUsage(a, p, m)(u),
            onConfirm: (c) => send({ type: 'confirm', agent: roleId, confirm: c }),
            onImage: (info) => send({ type: 'image', agent: roleId, ...info }),
            onImageReview: (r) => send({ type: 'imagereview', agent: roleId, ...r }),
            onQuestion: (q) => send({ type: 'question', ...q }),
            onAsk: (info) => { recordAsk(info); send({ type: 'ask', ...info }) },
            onAskDone: (info) => { recordAskDone(info); send({ type: 'ask_done', ...info }) },
            onProgress: (info) => send({ type: 'tool_progress', agent: roleId, ...info }), // ★ 长任务进度（视频/合成）
            // ★ 权限不足时主动向用户申请（角色卡片会显示棕色感叹号）
            onPermRequest: async (info) => {
              const id = crypto.randomUUID()
              send({ type: 'permreq', agent: roleId, permreq: { id, ...info } })
              send({ type: 'role_status', agent: roleId, status: 'needs', sub: `等待授权：${call.tool}` })
              const d = await waitPermReq(id)
              send({ type: 'role_status', agent: roleId, status: 'acting', sub: '' })
              return d
            },
          })
          taskToolCalls++
          send({ type: 'tool', agent: roleId, call: call.tool, detail: call.path || call.command || call.query || call.plugin || call.url || call.path || '', result: result.slice(0, 1500) })
          toolResults.push(`【工具结果】${call.tool} ${call.path || call.command || call.query || call.plugin || call.url || ''}\n${result}`)
        }
        messages.push({ role: 'user', content: toolResults.join('\n\n') + '\n\n请根据工具结果继续（如已完成请给出最终答复，不要再调用工具）。' })
      }
      if (limitHit) stepText += `\n\n（已达到工具调用限制：${limitHit === 'off' ? '已禁用工具调用' : `上限 ${roleLimit} 次`}。可提高设置中的上限，或发送中途指令让该角色继续。）`
      results.push({ agent: roleId, title: step.title, result: stepText })
      send({ type: 'step_done', index: i, agent: roleId, title: step.title, result: stepText })
      // ★ 写入该角色的长期记忆：之后单独对话/被队友询问时，知道自己在这个任务里做了什么
      try { roleChatAppend(roleId, 'assistant', `【团队任务·我完成的步骤】${plan.summary ? `（任务：${String(plan.summary).slice(0, 80)}）` : ''}\n${step.title}\n${stepText.replace(/```tool[\s\S]*?```/g, '').slice(0, 1200)}`) } catch { /* ignore */ }
      // ★ 审核/测试判定不通过：自动安排「返工 → 复审」循环（最多 2 轮，避免无限循环）
      const isReviewer = roleId === 'tester' || roleId === 'editor' || /测试|校对|审核|质检/.test(agent.role.label || '')
      if (isReviewer && reworkCount < 2 && STEP_FAIL_RE.test(stepText) && plan.steps.length < 12) {
        const producer = [...plan.steps.slice(0, i + 1)].reverse().find((s) => s.agent !== roleId)?.agent
        if (producer) {
          reworkCount++
          plan.steps.push({ agent: producer, title: `根据${agent.role.label}反馈返工（第${reworkCount}轮）`, instruction: `上一环节（${agent.role.label}）提出了以下问题/返工要求：\n${stepText.slice(0, 2500)}\n\n请逐项修复/补写（务必真实写入文件，写完用 list_files 核对），完成后简要列出修改点；如对反馈有异议，先用 ask_role 与${agent.role.label}确认，不要等待用户转达。★证据门：每项修复必须附证据——文件路径 + read_file 读回的关键片段；如运行过命令，附命令原文与输出摘要。禁止只声称「已修复」。` })
          plan.steps.push({ agent: roleId, title: `复审返工结果（第${reworkCount}轮）`, instruction: `对上一轮返工结果逐项复审并给出结论：通过 / 仍需修改（逐条列出具体问题）。若仍有问题请在结论中明确写出「不通过」与问题清单，系统会再安排一轮返工；无问题则给出明确「通过」结论。` })
          send({ type: 'delta', agent: 'leader', text: `\n\n（检测到${agent.role.label}提出问题：已自动安排返工与复审，第 ${reworkCount} 轮）` })
        }
      }
    } catch (e) {
      send({ type: 'error', message: `${agent.role.label}执行失败：${e.message}` })
      results.push({ agent: roleId, title: step.title, result: `(失败：${e.message})` })
    }
    // ★ 增量保存：每完成一步立即写入会话
    if (sess) {
      try {
        const last = results[results.length - 1]
        sess.messages.push({ role: 'assistant', kind: 'team-step', agent: last.agent, title: last.title, content: last.result, t: Date.now() })
        sess.updatedAt = Date.now()
        await saveSessions()
      } catch { /* ignore */ }
    }
  }

  // 3. 队长汇总（★ 预算已停则不汇总；★ 汇总阶段带工具循环：队长可真实写报告文件）
  let finalText = ''
  if (!budgetStopped && !run.abort && (await gate('*'))) {
    // ★ 队长也要领取发给它的中途指令（* 也在这里清空）
    for (const s of takeSteers('leader')) send({ type: 'steer', agent: 'leader', message: s.message })
    send({ type: 'agent_start', agent: 'leader', label: leader.role.label, model: `${leader.provider.name} / ${leader.model}`, final: true })
    // ★ 队长独立权限：单独设置了权限则覆盖会话权限
    const leaderPerm = PERMISSIONS.includes(leader.role.permission) ? leader.role.permission : permission
    try {
      const ctxText = results.map((r) => `【${roleById(r.agent)?.label || r.agent}·${r.title}】\n${r.result.slice(0, 2500)}`).join('\n\n')
      const steerText = steersTaken.map((s) => `【${roleById(s.agent)?.label || s.agent}】${s.message}`).join('\n')
      const messages = [
        { role: 'system', content: `${roleSystemPrompt(leader.role)}\n\n【最终汇总要求】请对团队产出做汇总：完成了什么、产物在哪（workspace 文件名 / 图片素材路径）、遗留问题、下一步建议。若存在「用户中途指令记录」，必须逐条重新评估其对成果的影响并说明处理结果。简洁分点。\n如任务要求产出报告/文档等文件，你必须用 write_file 把内容真实写入工作区（不要只在回复里贴出全文），写完用 list_files 核对文件存在，并在汇总里给出文件名。` },
        { role: 'user', content: `总任务：${task}\n\n${steerText ? `用户中途指令记录（需重新评估）：\n${steerText}\n\n` : ''}团队产出：\n${ctxText}` },
      ]
      let turn = 0
      while (turn < 8) {
        if (budgetStopped || run.abort) break
        if (!(await gate('*'))) break
        turn++
        const text = await chatComplete(leader.provider, leader.model, messages, { stream: true, temperature: 0.4, reasoningEffort: sess?.effort || undefined, onDelta: (d) => send({ type: 'delta', agent: 'leader', text: d, final: true }), onReasoning: (r) => send({ type: 'reasoning', agent: 'leader', text: r, final: true }), onUsage: trackUsage('leader', leader.provider, leader.model) })
        if (!text.trim()) break
        finalText = text
        const calls = extractToolCalls(text)
        if (!calls.length) break
        messages.push({ role: 'assistant', content: text })
        const outs = []
        for (const call of calls) {
          if (!(await gate('*'))) break
          const result = await runToolGuarded(call, {
            root, permission: leaderPerm, session: sess, autoState, task, run, agentId: 'leader',
            reportUsage: (a, p, m, u) => trackUsage(a, p, m)(u),
            onConfirm: (c) => send({ type: 'confirm', agent: 'leader', confirm: c }),
            onImage: (info) => send({ type: 'image', agent: 'leader', ...info }),
            onImageReview: (r) => send({ type: 'imagereview', agent: 'leader', ...r }),
            onQuestion: (q) => send({ type: 'question', ...q }),
            onAsk: (info) => { recordAsk(info); send({ type: 'ask', ...info }) },
            onAskDone: (info) => { recordAskDone(info); send({ type: 'ask_done', ...info }) },
            onProgress: (info) => send({ type: 'tool_progress', agent: 'leader', ...info }),
            onPermRequest: async (info) => {
              const id = crypto.randomUUID()
              send({ type: 'permreq', agent: 'leader', permreq: { id, ...info } })
              send({ type: 'role_status', agent: 'leader', status: 'needs', sub: `等待授权：${call.tool}` })
              const d = await waitPermReq(id)
              send({ type: 'role_status', agent: 'leader', status: 'acting', sub: '' })
              return d
            },
          })
          taskToolCalls++
          send({ type: 'tool', agent: 'leader', call: call.tool, detail: call.path || call.command || call.query || call.plugin || call.url || '', result: result.slice(0, 1500) })
          outs.push(`【工具结果】${call.tool} ${call.path || call.command || call.query || call.plugin || call.url || ''}\n${result}`)
        }
        messages.push({ role: 'user', content: outs.join('\n\n') + '\n\n请继续：如成果已产出完毕，请给出最终汇总（不要再调用工具）。★汇总必须附证据：产物路径 + 关键读回/命令输出片段；无法验证的项明确标注「未验证」。' })
      }
    } catch (e) { send({ type: 'error', message: `队长汇总失败：${e.message}` }) }
  }

  // ★ 队长长期记忆：记住最终汇总（任务收尾后仍可回忆）
  try {
    if (finalText) roleChatAppend('leader', 'assistant', `【团队任务·最终汇总】${String(finalText).replace(/```tool[\s\S]*?```/g, '').slice(0, 1500)}`)
    roleChatAppend('leader', 'user', `【团队任务状态】${run.abort ? '已终止' : (budgetStopped ? '已停止' : '已完成')}（工具调用 ${taskToolCalls} 次，费用 ¥${Number(totalCost.toFixed(6))}）如需继续，请直接说明下一步。`)
  } catch { /* ignore */ }
  // ★ .oat 常驻项目档案：任务收尾时写入项目记忆（跨会话复用，角色对话/后续任务自动读取）
  try { await appendProjectMemory(root, { task, plan, results, finalText, status: run.abort ? '已终止' : (budgetStopped ? '已停止' : '已完成'), cost: totalCost, toolCalls: taskToolCalls, sessionId: sess?.id || '' }) } catch { /* ignore */ }
  // ★ Paperclip 要点①：自动续跑——会话设置 0-5 次；完成后自动以「继续」任务续跑，
  //   直到汇总里出现「【全部完成】」或次数用尽（续跑事件照常落盘，页面可用「接回任务」接入）
  try {
    if (!run.abort && !budgetStopped && sess && Number(sess.autoContinue) > 0) {
      sess.autoContinue = Math.max(0, Number(sess.autoContinue) - 1)
      await saveSessions()
      const contTask = `自动续跑（剩余 ${sess.autoContinue} 次）：请先检查上一轮任务是否已全部完成，然后二选一：\n- 若仍有未完成项：继续完成，更新产物并重新汇总（汇总附证据）。\n- 若已全部完成：在汇总开头明确写「【全部完成】」后即停，不再做实质性改动。\n\n原任务：${String(task).slice(0, 600)}\n上一轮汇总节选：${String(finalText || '').replace(/\s+/g, ' ').slice(-600) || '（无）'}`
      setTimeout(() => { startDetachedTeamRun(contTask, sess.id).catch(() => {}) }, 1500)
    }
  } catch { /* ignore */ }
  // 4. 记录到团队会话（★ 计划完成与每步完成时已增量保存，这里补最终记录）
  if (sess) {
    try {
      if (finalText) sess.messages.push({ role: 'assistant', kind: 'team-final', content: finalText, t: Date.now() })
      sess.messages.push({ role: 'assistant', kind: 'team-meta', content: `${run.abort ? '已终止' : (budgetStopped ? '已停止' : '已完成')} · 费用 ¥${Number(totalCost.toFixed(6))} · 工具调用 ${taskToolCalls}`, t: Date.now() })
      if (!sess.title) sess.title = task.slice(0, 40)
      sess.tokens = (sess.tokens || 0) + totalUsage.prompt_tokens + totalUsage.completion_tokens
      sess.cost = Number(((sess.cost || 0) + totalCost).toFixed(6))
      sess.updatedAt = Date.now()
      await saveSessions()
    } catch { /* ignore */ }
  }
  // 5. 落盘（含各角色用量/费用/工具调用统计）
  const stoppedNow = budgetStopped || run.abort
  const record = { id: taskId, task, sessionId: sess?.id || '', plan, results, finalText, startedAt, finishedAt: Date.now(), usage: totalUsage, cost: Number(totalCost.toFixed(6)), roleUsage, toolCalls: taskToolCalls, cacheHitTokens: totalUsage.prompt_cache_hit_tokens, budgetStopped, aborted: run.abort }
  try {
    await writeFile(path.join(TASKS_DIR, `${taskId}.json`), JSON.stringify(record, null, 2), 'utf8')
    const entry = { id: taskId, task, sessionId: sess?.id || '', summary: plan.summary, steps: plan.steps.length, startedAt, finishedAt: Date.now(), status: stoppedNow ? 'stopped' : 'done', cost: record.cost, tokens: totalUsage.prompt_tokens + totalUsage.completion_tokens, cacheHitTokens: totalUsage.prompt_cache_hit_tokens, toolCalls: taskToolCalls }
    await writeTaskIndex([entry, ...(await readTaskIndex()).filter((x) => x.id !== taskId)])
  } catch { /* ignore */ }
  send({ type: 'done', taskId, cost: Number(totalCost.toFixed(6)), usage: totalUsage, cacheHitTokens: totalUsage.prompt_cache_hit_tokens, toolCalls: taskToolCalls, budgetStopped, aborted: run.abort })
}

/* ★ Paperclip 要点①：脱离页面运行团队任务（供自动续跑使用；事件照常落盘/广播，页面可经「接回任务」接入） */
async function startDetachedTeamRun(task, sessionId) {
  const tsess = sessions.find((s) => s.id === sessionId)
  if (!tsess) return
  const run = createTeamRun(task, sessionId)
  bumpRev('tasks')
  try { await runTeam(task, { session: tsess, run }) } catch (e) { runEmit(run, { type: 'error', message: e?.message || String(e) }) }
  run.finished = true
  teamRuns.delete(run.id)
}

/* ═══════════════════════════════════════════════════════════════
 * 十二、图片生成
 * ═══════════════════════════════════════════════════════════════ */
async function downloadImage(url, name) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`下载图片失败 HTTP ${r.status}`)
  await writeFile(path.join(getArtifactDir(), name), Buffer.from(await r.arrayBuffer()))
  return `/api/artifact?path=${encodeURIComponent('artifacts/' + name)}`
}
async function generateImage(provider, model, prompt, name) {
  const base = provider.baseUrl || ''
  const key = await getSecret(provider.id)
  const headers = { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }
  const fname = (k) => `${String(name || '').replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 40) || `art-${Date.now()}`}${k ? '-' + (k + 1) : ''}.png`
  if (base.includes('dashscope')) {
    const root = base.replace(/\/compatible-mode\/v1\/?$/, '')
    // ★ qwen-image / z-image 系列走新版多模态同步接口（旧 text2image 会报 url error）
    if (/^(qwen-image|z-image)/i.test(model)) {
      const r = await fetch(joinUrl(root, 'api/v1/services/aigc/multimodal-generation/generation'), {
        method: 'POST', headers,
        body: JSON.stringify({ model, input: { messages: [{ role: 'user', content: [{ text: prompt }] }] }, parameters: { n: 1, prompt_extend: true } }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || j?.code) throw new Error(`百炼出图失败：${j?.message || `HTTP ${r.status}`}`)
      const urls = (j?.output?.choices || []).flatMap((c) => (c?.message?.content || []).map((x) => x?.image).filter(Boolean))
      if (!urls.length) throw new Error('百炼未返回图片')
      const local = []
      for (let k = 0; k < urls.length; k++) local.push(await downloadImage(urls[k], fname(k)))
      return local
    }
    const r = await fetch(joinUrl(root, 'api/v1/services/aigc/text2image/image-synthesis'), { method: 'POST', headers: { ...headers, 'X-DashScope-Async': 'enable' }, body: JSON.stringify({ model, input: { prompt }, parameters: { size: '1024*1024', n: 1 } }) })
    const j = await r.json().catch(() => null)
    if (!r.ok || j?.code) throw new Error(`百炼出图失败：${j?.message || `HTTP ${r.status}`}`)
    const taskId = j?.output?.task_id
    for (let i = 0; i < 40; i++) {
      await new Promise((s) => setTimeout(s, 2500))
      const qj = await (await fetch(joinUrl(root, `api/v1/tasks/${taskId}`), { headers: { Authorization: `Bearer ${key}` } })).json().catch(() => null)
      const st = qj?.output?.task_status
      if (st === 'SUCCEEDED') {
        const urls = (qj?.output?.results || []).map((x) => x.url).filter(Boolean)
        const local = []
        for (let k = 0; k < urls.length; k++) local.push(await downloadImage(urls[k], fname(k)))
        return local
      }
      if (st === 'FAILED') throw new Error(`百炼任务失败：${qj?.output?.message || '未知'}`)
    }
    throw new Error('百炼出图超时')
  }
  const r = await fetch(joinUrl(base, 'images/generations'), { method: 'POST', headers, body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }) })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`出图失败：${j?.error?.message || `HTTP ${r.status}`}`)
  const items = j?.data || j?.images || []
  const local = []
  for (let k = 0; k < items.length; k++) {
    const it = items[k]
    if (it?.url) local.push(await downloadImage(it.url, fname(k)))
    else if (it?.b64_json) {
      const file = path.join(getArtifactDir(), fname(k))
      await writeFile(file, Buffer.from(it.b64_json, 'base64'))
      local.push(`/api/artifact?path=${encodeURIComponent('artifacts/' + path.basename(file))}`)
    }
  }
  if (!local.length) throw new Error('接口未返回图片')
  return local
}

/* ═══════════════════════════════════════════════════════════════
 * 十三、路由
 * ═══════════════════════════════════════════════════════════════ */
async function handleApi(req, res, url) {
  const { pathname } = url
  const method = req.method
  dbg('http', { method, path: pathname })

  /* ═══ ★ TAT 手机互联：鉴权与公开端点 ═══ */
  const clientIp = req.socket.remoteAddress || ''
  const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1'
  // 健康检查（公开，用于手机端探测连通性）
  if (pathname === '/api/ping' && method === 'GET') return sendJson(res, 200, { ok: true, app: 'Open Agent Team', version: appVersion(), time: Date.now() })
  // 配对（公开，凭一次性配对码/PIN 换设备 token）
  if (pathname === '/api/pair' && method === 'POST') {
    // ★ 安全审计修复：失败次数限速（防 6 位配对码被暴力枚举）
    if (!pairAllowed(clientIp)) { audit(req, 'pair.rate_limited', {}); return sendJson(res, 200, { ok: false, error: '配对尝试次数过多，请 10 分钟后再试' }) }
    const b = await readBody(req)
    const code = String(b.code || '').trim()
    const pToken = String(b.pairToken || '').trim()
    let entryKey = null
    for (const [k, v] of pairCodes) { if ((code && k === code) || (pToken && v.token === pToken)) { entryKey = k; break } }
    if (!entryKey) { pairFail(clientIp); audit(req, 'pair.fail', { reason: 'invalid-code' }); return sendJson(res, 200, { ok: false, error: '配对码无效或已过期，请在电脑端重新生成' }) }
    const entry = pairCodes.get(entryKey)
    if (entry.expires < Date.now()) { pairCodes.delete(entryKey); pairFail(clientIp); return sendJson(res, 200, { ok: false, error: '配对码已过期' }) }
    pairCodes.delete(entryKey) // 一次性使用
    pairFails.delete(clientIp)
    const token = crypto.randomBytes(24).toString('hex')
    const dev = { id: crypto.randomUUID(), name: String(b.deviceName || '手机设备').slice(0, 30), tokenHash: sha256(token), perm: 'approve', revoked: false, createdAt: Date.now(), lastSeen: Date.now(), lastIp: clientIp }
    devices.push(dev); await saveDevices()
    audit(req, 'pair.ok', { device: dev.name })
    return sendJson(res, 200, { ok: true, token, device: { id: dev.id, name: dev.name, perm: dev.perm } })
  }
  // 其余 /api/* 需鉴权（本机回环免鉴权 = 桌面端自身）
  if (!isLoopback) {
    const h = req.headers.authorization || ''
    // ★ Bearer 头优先；SSE（EventSource 不支持自定义头）允许 ?token= 传参
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : (url.searchParams.get('token') || '')
    const dev = token ? devices.find((d) => d.tokenHash === sha256(token) && !d.revoked) : null
    if (!dev) { audit(req, 'auth.deny', { path: pathname }); return sendJson(res, 401, { ok: false, error: '未授权：请先在电脑端「手机连接」完成配对' }) }
    dev.lastSeen = Date.now(); dev.lastIp = clientIp
    saveDevices().catch(() => {})
    req.device = dev
    const CONFIG_RE = /^\/api\/(settings|roles|providers|plugins|jsplugins|skills|presets|vault|devices|update|github|workspaces|cleanup|debug|exe|restart|easytier)(\/|$)/
    if (dev.perm === 'read' && method !== 'GET') { audit(req, 'perm.deny', { path: pathname, perm: dev.perm }); return sendJson(res, 403, { ok: false, error: '当前设备为「只读」权限，禁止修改' }) }
    if (dev.perm !== 'config' && method !== 'GET' && CONFIG_RE.test(pathname)) { audit(req, 'perm.deny', { path: pathname, perm: dev.perm }); return sendJson(res, 403, { ok: false, error: '当前设备无权修改配置（可在电脑端「手机连接」中提升权限）' }) }
    if (method !== 'GET') audit(req, 'api', { path: pathname })
  }
  // 生成配对码（仅电脑端）
  if (pathname === '/api/pair/new' && method === 'GET') {
    if (!isLoopback && req.device?.perm !== 'config') return sendJson(res, 403, { ok: false, error: '仅电脑端可生成配对码' })
    const pc = genPairCode()
    return sendJson(res, 200, { ok: true, ...pc })
  }
  // 网络信息（局域网 IP 列表 / 监听状态 / 默认路由主 IP）
  if (pathname === '/api/net/info' && method === 'GET') {
    const ips = []
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
      for (const a of list || []) { if (a.internal) continue; ips.push({ iface: name, address: a.address, family: a.family }) }
    }
    // ★ 默认路由主 IP：发一个不发包的 UDP“连接”，操作系统会选出实际联网网卡的地址（手机扫码应使用它）
    let primary = ''
    try {
      primary = await new Promise((resolve) => {
        const s = dgram.createSocket('udp4')
        const done = (v) => { try { s.close() } catch { /* ignore */ } resolve(v) }
        s.connect(53, '223.5.5.5', () => done(s.address().address))
        setTimeout(() => done(''), 1500)
      })
    } catch { primary = '' }
    return sendJson(res, 200, { ok: true, port: PORT, lanListen: !!settings.lanListen, listeningAll: listenAll, ips, primary, version: appVersion() })
  }
  // 设备管理
  if (pathname === '/api/devices' && method === 'GET') return sendJson(res, 200, { ok: true, devices: devices.map((d) => ({ id: d.id, name: d.name, perm: d.perm, revoked: !!d.revoked, createdAt: d.createdAt, lastSeen: d.lastSeen, lastIp: d.lastIp })) })
  const mdev = pathname.match(/^\/api\/devices\/([^/]+)$/)
  if (mdev) {
    const d = devices.find((x) => x.id === mdev[1])
    if (!d) return sendJson(res, 404, { ok: false, error: '设备不存在' })
    if (method === 'PUT') {
      const b = await readBody(req)
      if (typeof b.name === 'string' && b.name.trim()) d.name = b.name.trim().slice(0, 30)
      if (DEVICE_PERMS.includes(b.perm)) d.perm = b.perm
      await saveDevices()
      return sendJson(res, 200, { ok: true })
    }
    if (method === 'DELETE') { devices = devices.filter((x) => x.id !== d.id); await saveDevices(); audit(req, 'device.revoke', { device: d.name }); return sendJson(res, 200, { ok: true }) }
  }
  // ★ EasyTier 异地组网（可选组件：官方下载 + 独立进程调用，LGPL-3.0）
  const ET_DIR = path.join(__dirname, 'tools', 'easytier')
  const ET_EXE = path.join(ET_DIR, 'easytier-core.exe')
  const etRunning = async () => { try { const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq easytier-core.exe" /NH', { windowsHide: true, timeout: 10000 }); return /easytier-core/i.test(stdout) } catch { return false } }
  if (pathname === '/api/easytier/status' && method === 'GET') return sendJson(res, 200, { ok: true, installed: existsSync(ET_EXE), running: await etRunning(), config: settings.easytier || {}, exePath: ET_EXE })
  if (pathname === '/api/easytier/download' && method === 'POST') {
    try {
      const rel = await (await fetch('https://api.github.com/repos/EasyTier/EasyTier/releases/latest', { headers: { 'User-Agent': 'open-agent-team', Accept: 'application/vnd.github+json' } })).json()
      const asset = (rel.assets || []).find((a) => /windows.*(x86_64|amd64)/i.test(a.name) && /\.zip$/i.test(a.name))
      if (!asset) return sendJson(res, 200, { ok: false, error: '未找到 Windows 安装包，请到 GitHub Releases 手动下载后放入 tools/easytier/\nhttps://github.com/EasyTier/EasyTier/releases' })
      await mkdir(ET_DIR, { recursive: true })
      const zip = path.join(ET_DIR, 'easytier.zip')
      await execAsync(`powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${asset.browser_download_url}' -OutFile '${zip}' -UseBasicParsing -Headers @{'User-Agent'='open-agent-team'}"`, { timeout: 600000, windowsHide: true })
      // ★ 安全审计修复：官方 Release 提供 sha256 摘要时校验下载完整性（防下载被篡改/损坏）
      if (typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')) {
        const buf = await readFile(zip)
        const got = crypto.createHash('sha256').update(buf).digest('hex')
        if (got !== asset.digest.slice(7).toLowerCase()) {
          try { await rm(zip, { force: true }) } catch { /* ignore */ }
          return sendJson(res, 200, { ok: false, error: '下载文件 sha256 校验失败，已删除（可能存在下载损坏或篡改风险），请重试或手动安装' })
        }
      }
      try { await execAsync(`tar -xf "${zip}" -C "${ET_DIR}"`, { timeout: 120000, windowsHide: true }) }
      catch { await execAsync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip}' -DestinationPath '${ET_DIR}' -Force"`, { timeout: 180000, windowsHide: true }) }
      const { stdout: found } = await execAsync(`cmd /c dir /s /b "${ET_DIR}\\easytier-core.exe"`, { windowsHide: true }).catch(() => ({ stdout: '' }))
      const exePath = found.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
      if (exePath && exePath.toLowerCase() !== ET_EXE.toLowerCase()) { try { await copyFile(exePath, ET_EXE) } catch { /* ignore */ } }
      if (!existsSync(ET_EXE)) return sendJson(res, 200, { ok: false, error: '解压后未找到 easytier-core.exe，请手动放入 tools/easytier/' })
      audit(req, 'easytier.download', { tag: rel.tag_name })
      return sendJson(res, 200, { ok: true, message: `EasyTier 已安装（${rel.tag_name}）` })
    } catch (e) { return sendJson(res, 200, { ok: false, error: '下载失败：' + e.message + '（可到官方 Releases 手动下载放入 tools/easytier/）' }) }
  }
  if (pathname === '/api/easytier/start' && method === 'POST') {
    if (!existsSync(ET_EXE)) return sendJson(res, 200, { ok: false, error: '尚未安装 EasyTier，请先「一键下载安装」或手动放入 tools/easytier/' })
    const cfg = settings.easytier || {}
    if (!cfg.networkName || !cfg.networkSecret) return sendJson(res, 200, { ok: false, error: '请先填写网络名称与密码（手机端需填写相同内容）' })
    if (await etRunning()) return sendJson(res, 200, { ok: true, running: true, message: 'EasyTier 已在运行' })
    const args = ['--network-name', cfg.networkName, '--network-secret', cfg.networkSecret, '-p', cfg.peerUrl || 'tcp://public.easytier.cn:11010']
    if (cfg.virtualIp) args.push('--ipv4', cfg.virtualIp)
    const psArgs = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(',')
    try {
      await execAsync(`powershell -NoProfile -Command "Start-Process -FilePath '${ET_EXE}' -ArgumentList @(${psArgs}) -WorkingDirectory '${ET_DIR}' -Verb RunAs"`, { timeout: 30000, windowsHide: true })
    } catch (e) { return sendJson(res, 200, { ok: false, error: '启动失败（可能取消了管理员授权）：' + e.message }) }
    await new Promise((r) => setTimeout(r, 3500))
    const running = await etRunning()
    audit(req, 'easytier.start', { running })
    return sendJson(res, 200, { ok: true, running, message: running ? 'EasyTier 已启动（P2P 组网中）' : '已请求启动：请在电脑上确认管理员授权（UAC 弹窗）后再次查看状态' })
  }
  if (pathname === '/api/easytier/stop' && method === 'POST') {
    await execAsync('taskkill /IM easytier-core.exe /F', { windowsHide: true }).catch(() => {})
    audit(req, 'easytier.stop', {})
    return sendJson(res, 200, { ok: true, running: await etRunning() })
  }
  // 统一事件流（任何数据变更广播 rev；手机端增量同步）
  if (pathname === '/api/stream' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const write = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`) } catch { /* ignore */ } }
    write({ type: 'hello', app: 'Open Agent Team', version: appVersion(), revs, time: Date.now() })
    const fn = (ev) => write(ev)
    streamClients.add(fn)
    const hb = setInterval(() => write({ ping: Date.now() }), 15000)
    res.on('close', () => { streamClients.delete(fn); clearInterval(hb) })
    return
  }
  // 重启服务（改监听设置后生效）
  if (pathname === '/api/restart' && method === 'POST') {
    sendJson(res, 200, { ok: true, message: '服务即将重启，几秒后自动恢复' })
    audit(req, 'service.restart', {})
    setTimeout(async () => {
      // ★ Windows：脱离当前进程自拉起；Android：写"引擎已更新"标记，由手机壳提示重启应用
      if (process.platform === 'android') {
        try { await writeFile(path.join(DATA_DIR, '.engine-updated'), String(Date.now())) } catch { /* ignore */ }
        return
      }
      if (process.platform === 'win32') {
        try { spawn('cmd.exe', ['/c', `timeout /t 1 /nobreak >nul & "${process.execPath}" server.mjs`], { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true }).unref() } catch { /* ignore */ }
      }
      process.exit(0)
    }, 300)
    return
  }

  if (pathname === '/api/templates' && method === 'GET') return sendJson(res, 200, { ok: true, templates: TEMPLATES, roles: ROLE_META, prices: DEFAULT_PRICES, contextLimits: DEFAULT_CONTEXT_LIMITS, skills, jsPlugins: jsPluginMeta })
  if (pathname === '/api/state' && method === 'GET') {
    const list = []
    for (const p of providers) { const k = await getSecret(p.id); list.push({ ...p, keyMasked: maskKey(k), hasKey: !!k }) }
    return sendJson(res, 200, { ok: true, providers: list, roles, settings, plugins, skills, jsPlugins: jsPluginMeta, stats })
  }
  // 设置
  if (pathname === '/api/settings' && method === 'GET') return sendJson(res, 200, { ok: true, settings })
  if (pathname === '/api/settings' && method === 'PUT') {
    const b = await readBody(req)
    // ★ 工具调用限制：0=无限（默认）、-1=禁止、N=最多 N 次
    if (b.toolLimits && typeof b.toolLimits === 'object') {
      const tl = {}
      for (const k of ['chat', 'team', 'roleChat']) {
        const v = Number(b.toolLimits[k])
        tl[k] = Number.isFinite(v) ? Math.max(-1, Math.trunc(v)) : 0
      }
      b.toolLimits = { ...(settings.toolLimits || {}), ...tl }
    }
    // ★ TAT：布尔开关（局域网监听 / 断线暂停）规范化
    if (b.lanListen != null) b.lanListen = !!b.lanListen
    if (b.pauseOnDisconnect != null) b.pauseOnDisconnect = !!b.pauseOnDisconnect
    if (b.kbAuto != null) b.kbAuto = !!b.kbAuto // ★ 知识库自动检索注入开关
    if (b.voiceBackend != null) b.voiceBackend = ['voicestudio', 'qwen'].includes(b.voiceBackend) ? b.voiceBackend : 'cloud' // ★ 声音后端（cloud/voicestudio/qwen）
    if (b.voiceStudio && typeof b.voiceStudio === 'object') b.voiceStudio = { ...(settings.voiceStudio || {}), ...b.voiceStudio } // ★ 本地声音引擎配置合并
    if (b.qwenTts && typeof b.qwenTts === 'object') b.qwenTts = { ...(settings.qwenTts || {}), ...b.qwenTts } // ★ Qwen-TTS 配置合并
    // ★ TAT：EasyTier 组网配置合并
    if (b.easytier && typeof b.easytier === 'object') b.easytier = { ...(settings.easytier || {}), ...b.easytier }
    settings = { ...settings, ...b }
    await saveSettings()
    return sendJson(res, 200, { ok: true, settings })
  }
  // ★ 工作区内新建/覆盖文本文件（手机端「新建文件」与通用便捷写文件；限定工作区、≤2MB）
  if (pathname === '/api/fs/write' && method === 'POST') {
    const b = await readBody(req)
    const rel = String(b.path || '').trim()
    if (!rel) return sendJson(res, 200, { ok: false, error: '缺少 path（相对工作区的文件路径）' })
    const content = String(b.content ?? '')
    if (Buffer.byteLength(content) > 2 * 1024 * 1024) return sendJson(res, 200, { ok: false, error: '内容超过 2MB 限制' })
    try {
      const abs = resolveInWorkspace(rel, getActiveRoot())
      await mkdir(path.dirname(abs), { recursive: true })
      await writeFile(abs, content, 'utf8')
      audit(req, 'fs.write', { path: rel, bytes: Buffer.byteLength(content) })
      return sendJson(res, 200, { ok: true, path: rel })
    } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  // ★ 工作区管理
  if (pathname === '/api/workspaces' && method === 'GET') {
    return sendJson(res, 200, { ok: true, workspaces: settings.workspaces.map((w) => ({ path: w, exists: existsSync(w) })), active: getActiveRoot() })
  }
  if (pathname === '/api/workspaces' && method === 'POST') {
    const b = await readBody(req)
    const p = path.resolve(String(b.path || '').trim())
    if (!b.path || !b.path.trim()) return sendJson(res, 200, { ok: false, error: '请输入目录路径' })
    if (!existsSync(p)) { try { mkdirSync(p, { recursive: true }) } catch (e) { return sendJson(res, 200, { ok: false, error: '目录不存在且无法创建：' + e.message }) } }
    if (!settings.workspaces.some((w) => path.resolve(w).toLowerCase() === p.toLowerCase())) settings.workspaces.push(p)
    settings.activeWorkspace = p
    await saveSettings()
    return sendJson(res, 200, { ok: true, workspaces: settings.workspaces, active: p })
  }
  if (pathname === '/api/workspaces/active' && method === 'PUT') {
    const b = await readBody(req)
    const p = path.resolve(String(b.path || ''))
    if (!settings.workspaces.some((w) => path.resolve(w).toLowerCase() === p.toLowerCase())) return sendJson(res, 200, { ok: false, error: '该目录不在工作区列表' })
    if (!existsSync(p)) return sendJson(res, 200, { ok: false, error: '目录不存在：' + p })
    settings.activeWorkspace = p
    await saveSettings()
    return sendJson(res, 200, { ok: true, active: p })
  }
  // ★ 弹出系统原生文件夹选择框（Windows），选择后直接加入并切换
  if (pathname === '/api/workspaces/pick' && method === 'POST') {
    if (process.platform !== 'win32') return sendJson(res, 200, { ok: false, error: '当前系统不支持弹窗选择，请手动输入路径' })
    try {
      const ps1 = path.join(DATA_DIR, 'pick-folder.ps1')
      const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
# ★ 先清理可能残留的旧选择框，避免多个对话框堆叠
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'pick-folder.ps1' -and $_.ProcessId -ne $PID } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
# ★ 用"可见的置顶小窗"做父窗口：保证对话框居中在屏幕正面，且进程有前台权限
$owner = New-Object System.Windows.Forms.Form
$owner.Text = '选择工作区'
$owner.FormBorderStyle = 'FixedToolWindow'
$owner.TopMost = $true
$owner.StartPosition = 'CenterScreen'
$owner.Width = 340
$owner.Height = 96
$owner.ShowInTaskbar = $true
$owner.MaximizeBox = $false
$owner.MinimizeBox = $false
$label = New-Object System.Windows.Forms.Label
$label.Text = '请在弹出的文件夹窗口中选择目录…'
$label.Dock = 'Fill'
$label.TextAlign = 'MiddleCenter'
$owner.Controls.Add($label)
$owner.Show()
$owner.Activate()
$owner.BringToFront()
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = '选择要作为工作区的文件夹'
$dlg.ShowNewFolderButton = $true
$res = $dlg.ShowDialog($owner)
$owner.Close()
if ($res -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath }
`
      await writeFile(ps1, '\ufeff' + script, 'utf8')
      const { stdout } = await execAsync(`powershell -STA -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, { timeout: 180000, windowsHide: true, maxBuffer: 1024 * 1024 })
      const picked = String(stdout || '').trim()
      if (!picked) return sendJson(res, 200, { ok: true, canceled: true })
      const p = path.resolve(picked)
      if (!settings.workspaces.some((w) => path.resolve(w).toLowerCase() === p.toLowerCase())) settings.workspaces.push(p)
      settings.activeWorkspace = p
      await saveSettings()
      dbg('workspace.pick', { path: p })
      return sendJson(res, 200, { ok: true, path: p, workspaces: settings.workspaces, active: p })
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: '弹窗选择失败：' + (e?.message || e) })
    }
  }
  if (pathname === '/api/workspaces' && method === 'DELETE') {
    const b = await readBody(req)
    const p = path.resolve(String(b.path || ''))
    if (settings.workspaces.length <= 1) return sendJson(res, 200, { ok: false, error: '至少保留一个工作区' })
    settings.workspaces = settings.workspaces.filter((w) => path.resolve(w).toLowerCase() !== p.toLowerCase())
    if (path.resolve(settings.activeWorkspace).toLowerCase() === p.toLowerCase()) settings.activeWorkspace = settings.workspaces[0]
    await saveSettings()
    return sendJson(res, 200, { ok: true, workspaces: settings.workspaces, active: settings.activeWorkspace })
  }
  // provider 增删改
  if (pathname === '/api/providers' && method === 'POST') {
    const b = await readBody(req)
    const tpl = TEMPLATES[b.template] || {}
    const provider = { id: crypto.randomUUID(), name: b.name || tpl.label || '未命名 API', template: b.template || 'openai_compatible', baseUrl: b.baseUrl || tpl.baseUrl || '', models: normalizeModels(b.models?.length ? b.models : tpl.models), capabilities: Array.isArray(b.capabilities) ? b.capabilities : String(b.capabilities || '').split(',').map((s) => s.trim()).filter(Boolean), balance: b.balance || tpl.balance || 'probe', note: b.note || '', defaultPrice: b.defaultPrice || null, createdAt: Date.now() }
    providers.push(provider); await saveProviders(); await setSecret(provider.id, b.apiKey || '')
    return sendJson(res, 200, { ok: true, provider })
  }
  const mp = pathname.match(/^\/api\/providers\/([^/]+)$/)
  if (mp) {
    const provider = providers.find((p) => p.id === mp[1])
    if (!provider) return sendJson(res, 404, { ok: false, error: '未找到该 API' })
    if (method === 'PUT') {
      const b = await readBody(req)
      if (b.name != null) provider.name = b.name
      if (b.baseUrl != null) provider.baseUrl = b.baseUrl
      if (b.models != null) provider.models = normalizeModels(b.models)
      if (b.capabilities != null) provider.capabilities = Array.isArray(b.capabilities) ? b.capabilities : String(b.capabilities).split(',').map((s) => s.trim()).filter(Boolean)
      if (b.note != null) provider.note = b.note
      if (b.defaultPrice !== undefined) provider.defaultPrice = b.defaultPrice
      if (typeof b.apiKey === 'string' && b.apiKey.trim()) await setSecret(provider.id, b.apiKey.trim())
      await saveProviders()
      return sendJson(res, 200, { ok: true, provider })
    }
    if (method === 'DELETE') { providers = providers.filter((p) => p.id !== provider.id); await saveProviders(); await setSecret(provider.id, ''); return sendJson(res, 200, { ok: true }) }
  }
  const mfetch = pathname.match(/^\/api\/providers\/([^/]+)\/models\/fetch$/)
  if (mfetch && method === 'POST') {
    const provider = providers.find((p) => p.id === mfetch[1])
    if (!provider) return sendJson(res, 404, { ok: false, error: '未找到该 API' })
    try {
      const r = await fetch(joinUrl(provider.baseUrl || '', 'models'), { headers: await authHeaders(provider) })
      const j = await r.json().catch(() => null)
      if (!r.ok) return sendJson(res, 200, { ok: false, error: `HTTP ${r.status}` })
      const ids = (j?.data || []).map((m) => m?.id).filter(Boolean)
      return sendJson(res, 200, { ok: true, models: normalizeModels(ids), count: ids.length })
    } catch (e) { return sendJson(res, 200, { ok: false, error: `连接失败：${e.message}` }) }
  }
  const mt = pathname.match(/^\/api\/providers\/([^/]+)\/test$/)
  if (mt && method === 'POST') { const p = providers.find((x) => x.id === mt[1]); if (!p) return sendJson(res, 404, { ok: false, error: '未找到' }); return sendJson(res, 200, { ok: true, result: await queryBalance(p) }) }
  const mb = pathname.match(/^\/api\/providers\/([^/]+)\/balance$/)
  if (mb && method === 'GET') { const p = providers.find((x) => x.id === mb[1]); if (!p) return sendJson(res, 404, { ok: false, error: '未找到' }); const result = await queryBalance(p); return sendJson(res, 200, { ok: result.ok, result }) }
  if (pathname === '/api/balances' && method === 'GET') { const out = {}; await Promise.all(providers.map(async (p) => { out[p.id] = await queryBalance(p) })); return sendJson(res, 200, { ok: true, balances: out }) }
  // 角色
  if (pathname === '/api/roles' && method === 'GET') return sendJson(res, 200, { ok: true, roles })
  if (pathname === '/api/roles' && method === 'PUT') {
    const b = await readBody(req)
    if (Array.isArray(b)) roles = b.map((r) => ({ ...r, id: r.id || crypto.randomUUID(), label: r.label || '未命名角色', color: r.color || '#888', enabled: r.enabled !== false, skills: r.skills || [], permission: (r.permission === '' || PERMISSIONS.includes(r.permission)) ? (r.permission || '') : '', toolLimit: (r.toolLimit === '' || r.toolLimit == null) ? '' : (Number.isFinite(Number(r.toolLimit)) ? Math.max(-1, Math.trunc(Number(r.toolLimit))) : '') }))
    else if (b && typeof b === 'object') roles = DEFAULT_ROLES.map((d) => ({ ...d, ...(b[d.id] || {}) }))
    rebuildRoleMeta(); await saveRoles()
    return sendJson(res, 200, { ok: true, roles: ROLE_META })
  }
  // ★ 自定义团队预设：保存 / 列表 / 删除
  if (pathname === '/api/presets' && method === 'GET') return sendJson(res, 200, { ok: true, presets: customPresets })
  if (pathname === '/api/presets' && method === 'POST') {
    const b = await readBody(req)
    if (!Array.isArray(b.roles) || !b.roles.length) return sendJson(res, 200, { ok: false, error: '缺少角色配置' })
    const key = 'custom_' + Date.now()
    customPresets[key] = { label: String(b.label || '自定义预设').slice(0, 40), roles: b.roles, createdAt: Date.now() }
    await saveCustomPresets()
    return sendJson(res, 200, { ok: true, key })
  }
  const mpre = pathname.match(/^\/api\/presets\/([^/]+)$/)
  if (mpre && method === 'DELETE') { delete customPresets[mpre[1]]; await saveCustomPresets(); return sendJson(res, 200, { ok: true }) }
  // ★ Agent 技能（预设，可增删改 / 导入导出）
  if (pathname === '/api/skills' && method === 'GET') return sendJson(res, 200, { ok: true, skills })
  if (pathname === '/api/skills' && method === 'POST') {
    const b = await readBody(req)
    const s = { id: crypto.randomUUID(), name: b.name || '未命名技能', description: b.description || '', prompt: b.prompt || '', tags: b.tags || [] }
    skills.push(s); await saveSkills()
    return sendJson(res, 200, { ok: true, skill: s })
  }
  if (pathname === '/api/skills/import' && method === 'POST') {
    const b = await readBody(req)
    try {
      let data
      if (b.url) { const r = await fetch(b.url); data = await r.json() } else data = typeof b.json === 'string' ? JSON.parse(b.json) : (b.json || b.data)
      const list = Array.isArray(data) ? data : [data]
      let n = 0
      for (const it of list) {
        if (!it || !it.prompt) continue
        skills.push({ id: crypto.randomUUID(), name: it.name || it.label || `导入技能${skills.length + 1}`, description: it.description || it.desc || '', prompt: it.prompt, tags: it.tags || ['导入'] })
        n++
      }
      await saveSkills()
      return sendJson(res, 200, { ok: true, imported: n, skills })
    } catch (e) { return sendJson(res, 200, { ok: false, error: '导入失败：' + e.message }) }
  }
  const msk = pathname.match(/^\/api\/skills\/([^/]+)$/)
  if (msk && msk[1] !== 'market') { // ★ 保留字 market 交由下方技能市场路由处理
    const sk = skills.find((s) => s.id === msk[1])
    if (!sk) return sendJson(res, 404, { ok: false, error: '技能不存在' })
    if (method === 'PUT') { const b = await readBody(req); Object.assign(sk, { name: b.name ?? sk.name, description: b.description ?? sk.description, prompt: b.prompt ?? sk.prompt, tags: b.tags ?? sk.tags }); await saveSkills(); return sendJson(res, 200, { ok: true, skill: sk }) }
    if (method === 'DELETE') { skills = skills.filter((s) => s.id !== sk.id); await saveSkills(); return sendJson(res, 200, { ok: true }) }
  }
  // ★ 统计
  if (pathname === '/api/stats' && method === 'GET') return sendJson(res, 200, { ok: true, stats })
  if (pathname === '/api/stats/reset' && method === 'POST') {
    stats = { calls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cost: 0, toolCalls: 0, byRole: {}, byModel: {}, updatedAt: Date.now() }
    await writeFile(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8')
    return sendJson(res, 200, { ok: true, stats })
  }
  // ★ OAT JS 插件（参考 DSH 的"一切皆插件"：本地 .mjs 插件注册工具）
  if (pathname === '/api/jsplugins' && method === 'GET') return sendJson(res, 200, { ok: true, plugins: jsPluginMeta, dir: JS_PLUGINS_DIR })
  if (pathname === '/api/jsplugins/import' && method === 'POST') {
    const b = await readBody(req)
    try {
      let code = b.code
      if (!code && b.url) { const r = await fetch(b.url); code = await r.text() }
      if (!code) return sendJson(res, 200, { ok: false, error: '缺少插件代码或 URL' })
      const name = String(b.name || 'plugin').replace(/[^\w.-]/g, '_')
      const file = name.endsWith('.mjs') ? name : `${name}.mjs`
      if (!existsSync(JS_PLUGINS_DIR)) mkdirSync(JS_PLUGINS_DIR, { recursive: true })
      await writeFile(path.join(JS_PLUGINS_DIR, file), code, 'utf8')
      let meta = []
      try { meta = JSON.parse(await readFile(path.join(JS_PLUGINS_DIR, 'plugins.json'), 'utf8')) } catch { meta = [] }
      if (!meta.some((m) => m.file === file)) meta.push({ file, enabled: true })
      await writeFile(path.join(JS_PLUGINS_DIR, 'plugins.json'), JSON.stringify(meta, null, 2), 'utf8')
      await loadJsPlugins()
      return sendJson(res, 200, { ok: true, file, plugins: jsPluginMeta })
    } catch (e) { return sendJson(res, 200, { ok: false, error: '导入失败：' + e.message }) }
  }
  const mjp = pathname.match(/^\/api\/jsplugins\/([^/]+)$/)
  if (mjp) {
    const file = decodeURIComponent(mjp[1])
    const target = path.join(JS_PLUGINS_DIR, file)
    if (!existsSync(target)) return sendJson(res, 404, { ok: false, error: '插件不存在' })
    let meta = []
    try { meta = JSON.parse(await readFile(path.join(JS_PLUGINS_DIR, 'plugins.json'), 'utf8')) } catch { meta = [] }
    if (method === 'PUT') {
      const b = await readBody(req)
      let entry = meta.find((m) => m.file === file)
      if (!entry) { entry = { file, enabled: true }; meta.push(entry) }
      entry.enabled = b.enabled !== false
      await writeFile(path.join(JS_PLUGINS_DIR, 'plugins.json'), JSON.stringify(meta, null, 2), 'utf8')
      await loadJsPlugins()
      return sendJson(res, 200, { ok: true, plugins: jsPluginMeta })
    }
    if (method === 'DELETE') {
      await rm(target, { force: true })
      await writeFile(path.join(JS_PLUGINS_DIR, 'plugins.json'), JSON.stringify(meta.filter((m) => m.file !== file), null, 2), 'utf8')
      await loadJsPlugins()
      return sendJson(res, 200, { ok: true })
    }
  }
  // 插件（自定义外部 API）
  if (pathname === '/api/plugins' && method === 'GET') return sendJson(res, 200, { ok: true, plugins })
  if (pathname === '/api/plugins' && method === 'POST') {
    const b = await readBody(req)
    const p = { id: crypto.randomUUID(), name: b.name || '未命名插件', description: b.description || '', method: (b.method || 'GET').toUpperCase(), url: b.url || '', headers: b.headers || {}, body: b.body || '', params: Array.isArray(b.params) ? b.params : String(b.params || '').split(',').map((s) => s.trim()).filter(Boolean) }
    plugins.push(p); await savePlugins()
    return sendJson(res, 200, { ok: true, plugin: p })
  }
  const mpl = pathname.match(/^\/api\/plugins\/([^/]+)$/)
  if (mpl && method === 'DELETE') { plugins = plugins.filter((p) => p.id !== mpl[1]); await savePlugins(); return sendJson(res, 200, { ok: true }) }
  // 工具测试（调试用）
  if (pathname === '/api/tools/test' && method === 'POST') {
    const b = await readBody(req)
    const result = await runTool(b.call || b)
    return sendJson(res, 200, { ok: true, result })
  }
  // 调试
  if (pathname === '/api/debug/events' && method === 'GET') return sendJson(res, 200, { ok: true, events: debugEvents.slice(0, Number(url.searchParams.get('limit') || 120)) })
  if (pathname === '/api/debug/clear' && method === 'POST') { debugEvents.length = 0; return sendJson(res, 200, { ok: true }) }
  if (pathname === '/api/debug/state' && method === 'GET') return sendJson(res, 200, { ok: true, providers: providers.map((p) => ({ id: p.id, name: p.name, template: p.template, models: p.models.length, balance: p.balance, defaultPrice: p.defaultPrice || null })), roles, plugins: plugins.length, settings, workspace: WORKSPACE_DIR })
  // GitHub
  if (pathname === '/api/github/status' && method === 'GET') return sendJson(res, 200, await ghStatus())
  if (pathname === '/api/github/token' && method === 'POST') {
    const b = await readBody(req)
    await setSecret('github', b.token || '')
    const st = await ghStatus()
    return sendJson(res, 200, st)
  }
  if (pathname === '/api/github/repos' && method === 'GET') {
    try { const list = await gh('/user/repos?per_page=100&sort=updated'); return sendJson(res, 200, { ok: true, repos: list.map((r) => ({ full_name: r.full_name, private: r.private, default_branch: r.default_branch, html_url: r.html_url, updated_at: r.updated_at })) }) }
    catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  if (pathname === '/api/github/clone' && method === 'POST') {
    const b = await readBody(req)
    try { return sendJson(res, 200, { ok: true, ...(await ghClone(b.repo, b.dir)) }) }
    catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  if (pathname === '/api/github/publish' && method === 'POST') {
    const b = await readBody(req)
    try { return sendJson(res, 200, { ok: true, ...(await ghPublish(b)) }) }
    catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  // ★ 对话（会话制：消息在服务端持久化，每个会话独立；兼容旧的 messages 直传）
  if (pathname === '/api/chat' && method === 'POST') {
    const body = await readBody(req)
    const session = body.sessionId ? sessions.find((s) => s.id === body.sessionId) : null
    const provider = providers.find((p) => p.id === (session?.providerId || body.providerId))
    if (!provider) return sendJson(res, 404, { ok: false, error: '未找到该 API' })
    const modelId = session?.model || body.model
    const userContent = body.content != null ? body.content : body.message
    const toolsEnabled = body.tools != null ? !!body.tools : settings.chatTools !== false
    if (session && userContent != null) {
      session.messages.push({ role: 'user', content: userContent, t: Date.now() })
      if (!session.title) session.title = (typeof userContent === 'string' ? userContent : '[图片]').slice(0, 40)
      session.updatedAt = Date.now()
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const emit = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`) } catch { /* 客户端已断开 */ } }
    // ★ tool 消息只用于前端回放；发回模型时转成 user（工具结果）
    const toApiMsg = (m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content })
    const history = session ? session.messages.map(toApiMsg) : (body.messages || [])
    // ★ 会话有自己的工作区：工具执行范围跟随会话（缺省用全局当前工作区）
    const chatRoot = session?.workspace && existsSync(session.workspace) ? session.workspace : getActiveRoot()
    if (toolsEnabled && !history.some((m) => m.role === 'system')) history.unshift({ role: 'system', content: chatSystemPrompt(chatRoot) })
    try {
      // ★ 工具调用次数限制（设置页可调）：0=无限（默认）、-1=禁止、N=最多 N 次
      const chatLimit = effectiveToolLimit(null, 'chat')
      const maxTurns = !toolsEnabled ? 2 : chatLimit === -1 ? 2 : chatLimit > 0 ? Math.min(chatLimit + 2, 40) : 40
      const autoState = { approvedAll: false } // ★ 本请求内「全部允许」状态
      let emptyRetried = false
      let chatToolCalls = 0
      for (let turn = 0; turn < maxTurns; turn++) {
        let usage = null, cost = null, turnReasoning = ''
        const tIdx = turn
        const text = await chatComplete(provider, modelId, history, {
          stream: true, temperature: body.temperature ?? 0.7, sessionId: session?.id,
          reasoningEffort: emptyRetried ? 'none' : (session?.effort || undefined),
          onDelta: (d) => emit({ delta: d, turn: tIdx }),
          // ★ 思考过程随会话持久化（刷新后仍可回看），推理模型才有
          onReasoning: (r) => { turnReasoning += r; emit({ reasoning: r, turn: tIdx }) },
          onUsage: (u) => {
            usage = u
            cost = calcCost(getPrice(provider, modelId), u)
            statsAdd({ role: 'chat', model: modelId, usage: u, cost: cost || 0 })
            emit({ usage: u, cost, cacheHit: u?.prompt_cache_hit_tokens || 0, contextLimit: getContextLimit(provider, modelId), turn: tIdx })
          },
        })
        if (!text.trim()) {
          // ★ 只思考没正文：只重试一次，且关闭思考（不落盘空消息）
          if (!emptyRetried) { emptyRetried = true; history.push({ role: 'user', content: '你上一轮没有输出任何正文（全部消耗在内部思考中）。请关闭思考、直接给出最终答复。' }); continue }
          break
        }
        if (session && text) {
          session.messages.push({ role: 'assistant', content: text, reasoning: turnReasoning || undefined, t: Date.now(), usage: usage || null, cost: cost || null, contextLimit: getContextLimit(provider, modelId), turn: tIdx })
          session.tokens = (session.tokens || 0) + (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0)
          session.cost = Number(((session.cost || 0) + (cost || 0)).toFixed(6))
          session.updatedAt = Date.now()
        }
        if (!toolsEnabled) break
        const calls = extractToolCalls(text)
        // ★ 工具块 JSON 解析失败检测：提示模型重发，避免"以为执行了其实没执行"
        const blockCount = (text.match(/```tool\s*[\s\S]*?```/g) || []).length
        if (blockCount > calls.length) {
          history.push({ role: 'assistant', content: text })
          history.push({ role: 'user', content: `你上一条回复里有 ${blockCount - calls.length} 个工具块 JSON 解析失败（通常是路径/命令里的引号、反斜杠未转义）。请重发这些操作：确保 JSON 严格合法（字符串内的双引号写成 \\"，Windows 路径的反斜杠写成 \\\\）；读取文件用 read_file、列目录用 list_files，不要用 cat/ls 等 Linux 命令。` })
          continue
        }
        if (!calls.length) break
        history.push({ role: 'assistant', content: text })
        const toolResults = []
        // ★ 工具次数限制：禁止 / 达到上限时不再执行，明确告知模型与用户
        if (chatLimit === -1) {
          history.push({ role: 'user', content: '工具调用已被用户设置为「禁止」。请直接用已有信息回答，不要再输出工具块。' })
          emit({ notice: '工具调用已被用户设置为「禁止」，本轮仅文字回答。', turn: tIdx })
          break
        }
        if (chatLimit > 0 && chatToolCalls >= chatLimit) {
          history.push({ role: 'user', content: `工具调用次数已达用户设置的上限（${chatLimit} 次）。请基于已有结果直接给出最终答复，不要再调用工具。` })
          emit({ notice: `工具调用已达上限（${chatLimit} 次），已停止继续调用；可提高设置中的上限或发送新消息继续。`, turn: tIdx })
          break
        }
        for (const call of calls) {
          if (chatLimit > 0 && chatToolCalls >= chatLimit) break
          chatToolCalls++
          const result = await runToolGuarded(call, {
            root: chatRoot,
            permission: session?.permission || body.permission || settings.defaultPermission || 'modify',
            session, autoState, agentId: 'chat',
            onConfirm: (c) => emit({ confirm: c, turn: tIdx }),
            onImage: (info) => emit({ image: info, turn: tIdx }),
            onImageReview: (r) => emit({ imagereview: r, turn: tIdx }),
            onQuestion: (q) => emit({ question: q, turn: tIdx }),
            onProgress: (info) => emit({ tool_progress: info, turn: tIdx }),
            onPermRequest: (info) => { const id = crypto.randomUUID(); emit({ permreq: { id, agent: 'chat', ...info }, turn: tIdx }); return waitPermReq(id) },
          })
          const detail = call.path || call.command || call.query || call.plugin || call.url || ''
          emit({ tool: call.tool, detail, result: result.slice(0, 3000), turn: tIdx })
          const entry = `【工具结果】${call.tool} ${detail}\n${result}`
          toolResults.push(entry)
          if (session) session.messages.push({ role: 'tool', content: entry.slice(0, 6000), tool: call.tool, detail: String(detail), t: Date.now() })
        }
        history.push({ role: 'user', content: toolResults.join('\n\n') + '\n\n请根据工具结果继续；如果任务已完成，请给出最终答复，不要再调用工具。' })
        if (session) await saveSessions()
      }
      if (session) await saveSessions()
      emit({ done: true })
    } catch (e) { emit({ error: e.message }) }
    res.end()
    return
  }
  // ★ 权限申请回执（允许一次 / 本任务全部允许 / 拒绝）
  if (pathname === '/api/permreq' && method === 'POST') {
    const b = await readBody(req)
    const fn = pendingPermReqs.get(b.id)
    if (!fn) return sendJson(res, 200, { ok: false, error: '权限申请已过期或已完成' })
    fn(['once', 'all', 'deny'].includes(b.decision) ? b.decision : 'deny')
    return sendJson(res, 200, { ok: true })
  }
  // ★ 步骤确认回执
  if (pathname === '/api/confirm' && method === 'POST') {
    const b = await readBody(req)
    const fn = pendingConfirms.get(b.id)
    if (!fn) return sendJson(res, 200, { ok: false, error: '确认请求已过期或已完成' })
    fn(['once', 'all', 'deny'].includes(b.decision) ? b.decision : 'deny')
    return sendJson(res, 200, { ok: true })
  }
  // ★ 用户回答 AI 的提问（队长规划阶段）
  if (pathname === '/api/answer' && method === 'POST') {
    const b = await readBody(req)
    const fn = pendingQuestions.get(b.id)
    if (!fn) return sendJson(res, 200, { ok: false, error: '问题已过期或已回答' })
    fn(String(b.answer == null ? '' : b.answer))
    return sendJson(res, 200, { ok: true })
  }
  // ★ 团队任务中途指令（用户对单个角色追加要求）
  if (pathname === '/api/team/steer' && method === 'POST') {
    const b = await readBody(req)
    if (!b.taskId || !String(b.message || '').trim()) return sendJson(res, 200, { ok: false, error: '缺少 taskId 或 message' })
    const list = teamSteers.get(b.taskId) || []
    list.push({ agent: String(b.agent || '*'), message: String(b.message).slice(0, 2000), t: Date.now() })
    teamSteers.set(b.taskId, list)
    return sendJson(res, 200, { ok: true })
  }
  // ★ 会话管理
  if (pathname === '/api/sessions' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      sessions: sessions.map((s) => {
        // ★ 会话指标：缓存命中累计 / 最近一次输入 Token / 上下文上限（供悬停卡片显示）
        let cacheHitTokens = 0, lastPrompt = 0, contextLimit = 0
        for (const m of s.messages || []) {
          if (m.usage) { cacheHitTokens += m.usage.prompt_cache_hit_tokens || 0; lastPrompt = m.usage.prompt_tokens || lastPrompt }
          if (m.contextLimit) contextLimit = m.contextLimit
        }
        if (!contextLimit) { try { contextLimit = getContextLimit(providers.find((p) => p.id === s.providerId) || {}, s.model) } catch { contextLimit = 0 } }
        return { id: s.id, kind: s.kind || 'chat', providerId: s.providerId, model: s.model, title: s.title, workspace: s.workspace, archived: !!s.archived, permission: s.permission || settings.defaultPermission || 'modify', autoApprove: !!s.autoApprove, effort: s.effort || '', game: s.game || null, messageCount: s.messages?.length || 0, tokens: s.tokens || 0, cost: s.cost || 0, cacheHitTokens, lastPrompt, contextLimit, createdAt: s.createdAt, updatedAt: s.updatedAt }
      }),
    })
  }
  if (pathname === '/api/sessions' && method === 'POST') {
    const b = await readBody(req)
    // ★ kind：chat=普通对话 / team=团队工作 / game=团队会话（游戏与推演大厅）
    const kind = b.kind === 'team' ? 'team' : (b.kind === 'game' ? 'game' : 'chat')
    const s = { id: crypto.randomUUID(), kind, providerId: b.providerId || providers[0]?.id || '', model: b.model || '', title: b.title || '', workspace: b.workspace || getActiveRoot(), permission: PERMISSIONS.includes(b.permission) ? b.permission : (settings.defaultPermission || 'modify'), autoApprove: false, archived: false, messages: [], tokens: 0, cost: 0, createdAt: Date.now(), updatedAt: Date.now() }
    // ★ 游戏会话：对局配置随会话保存（模式/板子/身份/预算/模型 等，开局前可改）
    if (kind === 'game') s.game = b.game && typeof b.game === 'object' ? b.game : {}
    // ★ 会话工作区不存在时自动创建（避免工具静默回退到全局工作区，造成"文件不见"的困惑）
    try { if (s.workspace && !existsSync(s.workspace)) await mkdir(s.workspace, { recursive: true }) } catch { /* ignore */ }
    sessions.unshift(s); await saveSessions()
    return sendJson(res, 200, { ok: true, session: s })
  }
  const mss = pathname.match(/^\/api\/sessions\/([^/]+)$/)
  // ★ TAT：会话消息增量拉取（?after=毫秒时间戳），手机端断线重连只补差量
  const mmsg = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/)
  if (mmsg && method === 'GET') {
    const s = sessions.find((x) => x.id === mmsg[1])
    if (!s) return sendJson(res, 404, { ok: false, error: '会话不存在' })
    const after = Number(url.searchParams.get('after') || 0) || 0
    const msgs = (s.messages || []).filter((m) => (m.t || 0) > after)
    return sendJson(res, 200, { ok: true, messages: msgs, total: (s.messages || []).length, rev: revs.sessions || 0 })
  }
  if (mss) {
    const s = sessions.find((x) => x.id === mss[1])
    if (!s) return sendJson(res, 404, { ok: false, error: '会话不存在' })
    if (method === 'GET') return sendJson(res, 200, { ok: true, session: s })
    if (method === 'PUT') {
      const b = await readBody(req)
      if (b.title != null) s.title = b.title
      if (b.archived != null) s.archived = !!b.archived
      if (b.model != null) s.model = b.model
      if (b.providerId != null) s.providerId = b.providerId
      if (b.workspace != null) s.workspace = b.workspace
      if (b.permission != null && PERMISSIONS.includes(b.permission)) s.permission = b.permission
      if (b.autoApprove != null) s.autoApprove = !!b.autoApprove
      // ★ 推理等级（拖动滑块）：''=跟随全局；none/low/high/max/default
      if (b.effort != null && ['', 'none', 'low', 'high', 'max', 'default'].includes(b.effort)) s.effort = b.effort
      // ★ Paperclip 要点①：自动续跑次数（0=关闭，1-5 轮）
      if (b.autoContinue != null) s.autoContinue = Math.max(0, Math.min(5, Math.round(Number(b.autoContinue) || 0)))
      s.updatedAt = Date.now(); await saveSessions()
      return sendJson(res, 200, { ok: true, session: s })
    }
    if (method === 'DELETE') {
      // ★ purge=1：连同该会话的工作区文件夹与任务记录一起彻底删除
      const purge = url.searchParams.get('purge') === '1'
      sessions = sessions.filter((x) => x.id !== s.id); await saveSessions()
      // ★ 游戏会话：先终止内存中的对局引擎，再删除对局状态/事件流/复盘目录（属于会话数据，不删工作区）
      const eng = gameEngines.get(s.id)
      if (eng) { eng.abort = true; eng.paused = false; if (eng.state.waiting) engineSubmitAction(eng, { auto: true }); gameNotify(eng); gameEngines.delete(s.id) }
      if ((s.kind || '') === 'game') { try { await rm(gameDir(s.id), { recursive: true, force: true }) } catch { /* ignore */ } }
      let purged = '', purgeError = ''
      if (purge && s.workspace) {
        // ★ 安全审计修复：防止「对话与文件夹一起删除」误删默认工作区/激活工作区/应用目录（含应用数据）
        const wsAbs = path.resolve(s.workspace)
        const appRoot = path.resolve(path.dirname(DATA_DIR))
        const relIn = path.relative(appRoot, wsAbs)   // ws 位于应用目录内？
        const relOut = path.relative(wsAbs, appRoot)  // ws 是应用目录的祖先？
        const insideApp = relIn === '' || (!relIn.startsWith('..') && !path.isAbsolute(relIn))
        const containsApp = relOut === '' || (!relOut.startsWith('..') && !path.isAbsolute(relOut))
        const unsafe = insideApp || containsApp || wsAbs === path.resolve(WORKSPACE_DIR) || wsAbs === path.resolve(getActiveRoot())
        if (unsafe) {
          audit(req, 'session.purge_denied', { workspace: s.workspace })
          return sendJson(res, 200, { ok: true, purged: '', purgeError: '出于安全考虑：该文件夹是默认/激活工作区或包含应用数据，已取消「连同文件夹删除」（会话记录已删除，文件夹保留）' })
        }
        try {
          await rm(s.workspace, { recursive: true, force: true })
          if (s.workspace === WORKSPACE_DIR) await mkdir(s.workspace, { recursive: true })
          if (settings.activeWorkspace === s.workspace) { settings.activeWorkspace = WORKSPACE_DIR; await saveSettings() }
          purged = s.workspace
        } catch (e) { purgeError = e.message }
      }
      if (purge) {
        // 同时清掉该会话遗留的任务记录（新记录带 sessionId）
        try {
          const idxFile = path.join(TASKS_DIR, 'index.json')
          let list = []
          try { list = JSON.parse(await readFile(idxFile, 'utf8')) } catch { list = [] }
          const keep = []
          for (const t of list) {
            if (t.sessionId && t.sessionId === s.id) { try { await rm(path.join(TASKS_DIR, `${t.id}.json`), { force: true }); await rm(path.join(TASKS_DIR, `${t.id}.events.jsonl`), { force: true }) } catch { /* ignore */ } }
            else keep.push(t)
          }
          if (keep.length !== list.length) await writeFile(idxFile, JSON.stringify(keep, null, 2), 'utf8')
        } catch { /* ignore */ }
      }
      return sendJson(res, 200, { ok: true, purged, purgeError })
    }
  }
  const msc = pathname.match(/^\/api\/sessions\/([^/]+)\/(compact|export|clear|undo|truncate)$/)
  if (msc) {
    const s = sessions.find((x) => x.id === msc[1])
    if (!s) return sendJson(res, 404, { ok: false, error: '会话不存在' })
    const op = msc[2]
    if (op === 'clear') { s.messages = []; s.tokens = 0; s.cost = 0; s.updatedAt = Date.now(); await saveSessions(); return sendJson(res, 200, { ok: true, session: s }) }
    // ★ 撤回/重新编辑：截断到指定消息索引（保留 [0, index)）
    if (op === 'truncate') {
      const b2 = await readBody(req).catch(() => ({}))
      const idx = Number(b2?.index)
      s.messages = s.messages.slice(0, Number.isFinite(idx) && idx > 0 ? idx : 0)
      s.updatedAt = Date.now(); await saveSessions()
      return sendJson(res, 200, { ok: true, session: s })
    }
    if (op === 'undo') { while (s.messages.length) { const m = s.messages.pop(); if (m.role === 'user') break } s.updatedAt = Date.now(); await saveSessions(); return sendJson(res, 200, { ok: true, session: s }) }
    if (op === 'export') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="oat-session-${s.id}.json"` }); res.end(JSON.stringify(s, null, 2)); return }
    if (op === 'compact') {
      const provider = providers.find((p) => p.id === s.providerId)
      if (!provider) return sendJson(res, 200, { ok: false, error: '会话的 API 不存在' })
      try {
        const summary = await chatComplete(provider, s.model, [
          { role: 'system', content: '你是会话压缩器。请把下面的对话压缩成结构化摘要（已完成事项、关键结论、未决问题、下一步），尽量保留文件路径与命令等关键信息，不超过 400 字。' },
          ...s.messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        ], { stream: false, temperature: 0.3, sessionId: s.id })
        const kept = s.messages.slice(-4)
        s.messages = [{ role: 'assistant', content: `【上下文摘要】\n${summary}`, t: Date.now() }, ...kept]
        s.compactedAt = Date.now(); s.updatedAt = Date.now(); await saveSessions()
        return sendJson(res, 200, { ok: true, summary, session: s })
      } catch (e) { return sendJson(res, 200, { ok: false, error: '压缩失败：' + e.message }) }
    }
  }
  // ★ 技能市场
  if (pathname === '/api/skills/market' && method === 'GET') return sendJson(res, 200, { ok: true, skills: BUILTIN_SKILLS })
  if (pathname === '/api/skills/market/import' && method === 'POST') {
    const b = await readBody(req)
    const ids = Array.isArray(b.ids) ? b.ids : [b.id]
    let n = 0
    for (const mk of BUILTIN_SKILLS.filter((x) => ids.includes(x.id))) {
      if (skills.some((s) => s.name === mk.name)) continue
      skills.push({ id: crypto.randomUUID(), name: mk.name, description: mk.description, prompt: mk.prompt, tags: mk.tags })
      n++
    }
    await saveSkills()
    return sendJson(res, 200, { ok: true, imported: n, skills })
  }
  // 团队
  if (pathname === '/api/team/run' && method === 'POST') {
    const body = await readBody(req)
    if (!body.task) return sendJson(res, 400, { ok: false, error: '缺少任务' })
    const tsess = body.sessionId ? sessions.find((s) => s.id === body.sessionId) : null
    const run = createTeamRun(body.task, tsess?.id)
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const write = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`) } catch { /* 客户端已断开 */ } }
    const listener = (o) => write(o)
    run.listeners.add(listener)
    const hb = setInterval(() => write({ ping: Date.now() }), 15000)
    res.on('close', () => {
      run.listeners.delete(listener)
      clearInterval(hb)
      if (run.finished) return
      // ★ TAT：默认「断线不暂停」（手机切后台/地铁断网不会再打断任务）；可在设置里开启「断线时暂停」
      setTimeout(() => {
        if (!run.finished && run.listeners.size === 0 && !run.paused && settings.pauseOnDisconnect === true) {
          run.paused = true
          run.pausedReasons.add('disconnect')
          runEmit(run, { type: 'paused', paused: true, reason: 'disconnect', message: '连接已断开，任务已自动暂停；重新打开后请选择是否继续' })
          notifyRun(run)
        }
      }, 4000)
    })
    try { await runTeam(body.task, { session: tsess, run }) } catch (e) { runEmit(run, { type: 'error', message: e?.message || String(e) }) }
    run.finished = true
    clearInterval(hb)
    teamRuns.delete(run.id)
    try { res.end() } catch { /* ignore */ }
    return
  }
  // ★ 重新接入正在运行/已暂停的团队任务（回放缓冲事件）
  if (pathname === '/api/team/attach' && method === 'GET') {
    const taskId = url.searchParams.get('taskId') || ''
    const run = teamRuns.get(taskId)
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const write = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`) } catch { /* ignore */ } }
    if (!run) {
      // ★ TAT：任务已结束/服务重启后，从落盘事件文件回放（手机断线久了也能补全）
      const evFile = path.join(TASKS_DIR, `${taskId}.events.jsonl`)
      if (taskId && existsSync(evFile)) {
        write({ type: 'attached', taskId, task: '', finished: true })
        const txt = await readFile(evFile, 'utf8')
        for (const line of txt.split('\n')) { if (line.trim()) { try { write(JSON.parse(line)) } catch { /* ignore */ } } }
        write({ type: 'done', taskId, fromReplay: true, cost: 0, toolCalls: 0, aborted: false, budgetStopped: false })
      } else {
        write({ type: 'error', message: '任务不存在或已结束' }); write({ type: 'done', taskId: '', aborted: false })
      }
      res.end(); return
    }
    write({ type: 'attached', taskId: run.id, task: run.task, sessionId: run.sessionId, paused: run.paused, pausedAgents: [...run.pausedAgents], reasons: [...run.pausedReasons] })
    for (const ev of run.buffer) write(ev)
    const listener = (o) => write(o)
    run.listeners.add(listener)
    const hb = setInterval(() => write({ ping: Date.now() }), 15000)
    res.on('close', () => { run.listeners.delete(listener); clearInterval(hb) })
    return
  }
  // ★ 团队任务控制：暂停/恢复/终止（全局或单个角色）
  if (pathname === '/api/team/control' && method === 'POST') {
    const b = await readBody(req)
    const run = teamRuns.get(b.taskId)
    if (!run) return sendJson(res, 200, { ok: false, error: '任务不存在或已结束' })
    if (b.action === 'pause') { run.paused = true; run.pausedReasons.add('user') }
    else if (b.action === 'resume') { run.paused = false; run.pausedReasons.clear() }
    else if (b.action === 'stop') { run.abort = true; run.paused = false }
    else if (b.action === 'pauseAgent' && b.agent) run.pausedAgents.add(b.agent)
    else if (b.action === 'resumeAgent' && b.agent) run.pausedAgents.delete(b.agent)
    notifyRun(run)
    const type = b.action === 'stop' ? 'stopped' : (b.action.startsWith('pause') ? 'paused' : 'resumed')
    runEmit(run, { type, paused: run.paused, pausedAgents: [...run.pausedAgents], agent: b.agent || '', byUser: true })
    return sendJson(res, 200, { ok: true, paused: run.paused, pausedAgents: [...run.pausedAgents] })
  }
  // ★ 拖拽上传：文件保存到当前工作区 uploads/（对话与团队任务共用）
  if (pathname === '/api/upload' && method === 'POST') {
    const b = await readBody(req)
    const name = String(b.name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'file'
    const data = String(b.data || '')
    if (!data) return sendJson(res, 200, { ok: false, error: '缺少文件数据' })
    let buf
    try { buf = Buffer.from(data, 'base64') } catch { return sendJson(res, 200, { ok: false, error: '文件数据无效' }) }
    if (buf.length > 30 * 1024 * 1024) return sendJson(res, 200, { ok: false, error: '文件超过 30MB 限制' })
    const dir = path.join(getActiveRoot(), 'uploads')
    await mkdir(dir, { recursive: true })
    let target = name
    let i = 1
    while (existsSync(path.join(dir, target))) {
      const ext = path.extname(name)
      target = `${path.basename(name, ext)}_${i++}${ext}`
    }
    await writeFile(path.join(dir, target), buf)
    const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(target)
    return sendJson(res, 200, { ok: true, path: `uploads/${target}`, name: target, isImage, size: buf.length })
  }
  // ★ 与单个角色的直接对话（独立于团队任务）
  if (pathname === '/api/role/chat' && method === 'POST') {
    const b = await readBody(req)
    const role = roleById(b.roleId)
    if (!role) return sendJson(res, 404, { ok: false, error: '角色不存在' })
    const target = resolveRoleTarget(role)
    if (!target) return sendJson(res, 200, { ok: false, error: '该角色没有可用的对话模型' })
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const emit = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`) } catch { /* ignore */ } }
    // ★ 团队会话内的角色对话会写进会话历史（刷新后可见）
    const sess = b.sessionId ? sessions.find((s) => s.id === b.sessionId) : null
    const rec = (msg) => { if (!sess) return; sess.messages.push({ role: 'assistant', t: Date.now(), ...msg }); sess.updatedAt = Date.now(); saveSessions().catch(() => {}) }
    if (sess) rec({ kind: 'role-chat', agent: role.id, side: 'user', content: String(b.message || '').slice(0, 4000) })
    try {
      // ★ 单角色对话也支持工具（含 ask_role 联系队友、读写工作区等）：多轮工具循环
      // ★ 工具根目录跟随该团队会话自己的工作区（缺省才用全局激活工作区）
      const root = sess?.workspace && existsSync(sess.workspace) ? sess.workspace : getActiveRoot()
      const autoState = { approvedAll: false }
      // ★ 上下文复用三件套：角色完整记忆（稳定前缀）+ 团队会话档案 + 工作区快照
      //   目的：AI 记得自己做过什么，且不用每次重新翻项目文件（省 token、省等待、利于缓存命中）
      const archive = sessionArchive(sess, 6000)
      const digest = await projectDigest(root, 50)
      // ★ .oat 常驻项目档案：跨会话注入项目历史（新会话问项目历史无需翻文件）
      const projMem = await projectMemoryDigest(root)
      // ★ 本地知识库（RAG）：后台刷新索引 + 按用户问题检索注入
      kbMaybeRefresh(root).catch(() => {})
      const kb = await kbDigest(root, b.message)
      const userMsg = `【与用户的单独对话】${String(b.message || '').slice(0, 4000)}\n（当前工作区目录：${root}）\n\n${digest}${projMem ? '\n\n' + projMem : ''}${kb ? '\n\n' + kb : ''}${archive ? '\n\n' + archive : ''}\n\n（提示：以上快照与档案已包含当前进度与产物，请直接据此回答，避免不必要的重复读取；如确需细节再调用工具（在项目文档里找答案可用 kb_search）。你可以用 ask_role 询问队友。请以你的角色身份简洁、专业地回复。）`
      const messages = [
        { role: 'system', content: roleSystemPrompt(role) },
        ...roleChatHistory(role.id), // ★ 完整角色记忆（不再只取最后 12 条）
        { role: 'user', content: userMsg },
      ]
      // ★ 权限：优先用该角色自己的权限设置，未设置则跟随全局默认
      const rolePerm = PERMISSIONS.includes(role.permission) ? role.permission : (settings.defaultPermission || 'modify')
      // ★ 工具调用次数限制：角色单独设置优先，否则用全局「单个角色对话」限制
      const roleLimit = effectiveToolLimit(role, 'roleChat')
      const roleMaxTurns = roleLimit === -1 ? 2 : roleLimit > 0 ? Math.min(roleLimit + 3, 40) : 40
      let roleToolCalls = 0
      let lastText = ''
      for (let turn = 0; turn < roleMaxTurns; turn++) {
        const text = await chatComplete(target.provider, target.model, messages, {
          stream: true, temperature: 0.5,
          onDelta: (d) => emit({ delta: d, turn }),
          onReasoning: (r) => emit({ reasoning: r, turn }),
          onUsage: (u) => { const cost = calcCost(getPrice(target.provider, target.model), u); statsAdd({ role: role.id, model: target.model, usage: u, cost: cost || 0 }); emit({ usage: u, cost, cacheHit: u?.prompt_cache_hit_tokens || 0, contextLimit: getContextLimit(target.provider, target.model), turn }) },
        })
        if (!text.trim()) break
        lastText = text
        const calls = extractToolCalls(text)
        // ★ 工具块 JSON 解析失败检测：提示模型重发（此前会被静默丢弃，模型误报"结果未回传"）
        const blockCount = (text.match(/```tool\s*[\s\S]*?```/g) || []).length
        if (blockCount > calls.length) {
          messages.push({ role: 'assistant', content: text })
          messages.push({ role: 'user', content: `你上一条回复里有 ${blockCount - calls.length} 个工具块 JSON 解析失败（通常是路径/命令里的引号、反斜杠未转义）。请重发这些操作：确保 JSON 严格合法（字符串内的双引号写成 \\"，Windows 路径的反斜杠写成 \\\\）；读取文件用 read_file、列目录用 list_files，不要用 cat/ls 等 Linux 命令。` })
          continue
        }
        if (!calls.length) break
        messages.push({ role: 'assistant', content: text })
        const outs = []
        // ★ 工具次数限制：禁止 / 达到上限时停止执行并明确说明
        if (roleLimit === -1) {
          messages.push({ role: 'user', content: '工具调用已被用户设置为「禁止」。请直接用已有信息回答，不要再输出工具块。' })
          emit({ notice: '工具调用已被用户设置为「禁止」，本轮仅文字回答。' })
          break
        }
        if (roleLimit > 0 && roleToolCalls >= roleLimit) {
          messages.push({ role: 'user', content: `工具调用次数已达用户设置的上限（${roleLimit} 次）。请基于已有结果直接给出最终答复，不要再调用工具。` })
          emit({ notice: `工具调用已达上限（${roleLimit} 次），已停止继续调用；可在角色设置中调整上限。` })
          break
        }
        for (const call of calls) {
          if (roleLimit > 0 && roleToolCalls >= roleLimit) break
          roleToolCalls++
          const result = await runToolGuarded(call, {
            root, permission: rolePerm, session: null, autoState, agentId: role.id, task: '',
            reportUsage: (a, p, m, u) => { const cost = calcCost(getPrice(p, m), u); statsAdd({ role: a, model: m, usage: u, cost: cost || 0 }) },
            onConfirm: (c) => emit({ confirm: c }),
            onImage: (info) => emit({ image: info }),
            onQuestion: (q) => emit({ question: q }),
            onAsk: (info) => { rec({ kind: 'team-ask', from: info.from, to: info.to, question: info.question }); emit({ ask: info }) },
            onAskDone: (info) => { rec({ kind: 'team-ask-done', from: info.from, to: info.to, answer: String(info.answer || '').slice(0, 2000) }); emit({ ask_done: info }) },
            onProgress: (info) => emit({ tool_progress: info }),
            onPermRequest: (info) => { const id = crypto.randomUUID(); emit({ permreq: { id, agent: role.id, ...info } }); return waitPermReq(id) },
          })
          emit({ tool: call.tool, detail: call.path || call.command || call.query || call.plugin || call.url || '', result: result.slice(0, 3000) })
          outs.push(`【工具结果】${call.tool} ${call.path || call.command || call.query || call.plugin || call.url || ''}\n${result}`)
        }
        messages.push({ role: 'user', content: outs.join('\n\n') + '\n\n请根据工具结果继续；如已完成请给出最终答复（不要再调用工具）。' })
      }
      // ★ 对话留痕：角色下次（无论用户直聊还是队友提问）都能回忆
      roleChatAppend(role.id, 'user', String(b.message || '').slice(0, 4000))
      if (lastText.trim()) roleChatAppend(role.id, 'assistant', lastText)
      if (sess && lastText.trim()) rec({ kind: 'role-chat', agent: role.id, side: 'ai', content: lastText })
      emit({ done: true })
    } catch (e) { emit({ error: e.message }) }
    res.end()
    return
  }
  // ★ 正在运行的任务列表（刷新后询问是否继续）
  if (pathname === '/api/team/runs' && method === 'GET') {
    const list = [...teamRuns.values()].filter((r) => !r.finished).map((r) => ({ id: r.id, task: r.task.slice(0, 80), sessionId: r.sessionId, paused: r.paused, pausedAgents: [...r.pausedAgents], reasons: [...r.pausedReasons], startedAt: r.startedAt }))
    return sendJson(res, 200, { ok: true, runs: list })
  }
  // ★ 出图人工审核回执
  if (pathname === '/api/review' && method === 'POST') {
    const b = await readBody(req)
    const fn = pendingReviews.get(b.id)
    if (!fn) return sendJson(res, 200, { ok: false, error: '该审核已过期' })
    fn({ action: ['keep', 'regen', 'delete'].includes(b.action) ? b.action : 'keep', prompt: String(b.prompt || '') })
    return sendJson(res, 200, { ok: true })
  }
  // ★ 画廊：列表 / 删除 / 重画
  if (pathname === '/api/art' && method === 'GET') return sendJson(res, 200, { ok: true, items: await readArtMeta() })
  if (pathname === '/api/art/delete' && method === 'POST') {
    const b = await readBody(req)
    const files = Array.isArray(b.files) ? b.files : [b.file].filter(Boolean)
    if (!files.length) return sendJson(res, 200, { ok: false, error: '缺少文件' })
    return sendJson(res, 200, { ok: true, ...(await deleteArtFiles(files, !!b.deleteFile)) })
  }
  if (pathname === '/api/art/regenerate' && method === 'POST') {
    const b = await readBody(req)
    const meta = (await readArtMeta()).find((x) => x.file === b.file)
    const target = resolveArtTarget({ providerId: b.providerId || meta?.providerId, model: b.model })
    const prompt = String(b.prompt || meta?.prompt || '').trim()
    if (!target) return sendJson(res, 200, { ok: false, error: '未找到出图模型（请先在画板选择一次）' })
    if (!prompt) return sendJson(res, 200, { ok: false, error: '缺少提示词（该图没有记录提示词，请手动输入）' })
    try {
      const baseName = b.replace && b.file ? path.parse(b.file).name : ''
      const urls = await generateImage(target.provider, target.model, prompt, baseName || undefined)
      await recordArt(urls, { prompt, model: target.model, provider: target.provider.name, role: '重画' })
      return sendJson(res, 200, { ok: true, urls })
    } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  // ★ 定时任务/心跳：列表 / 新建 / 修改 / 删除（无人值守按计划自动跑团队任务）
  if (pathname === '/api/schedules' && method === 'GET') {
    return sendJson(res, 200, { ok: true, now: Date.now(), schedules: schedules.map((s) => ({ ...s, running: !!s.activeTaskId })) })
  }
  if (pathname === '/api/schedules' && method === 'POST') {
    const b = await readBody(req)
    if (!String(b.task || '').trim()) return sendJson(res, 200, { ok: false, error: '缺少任务内容' })
    const s = {
      id: crypto.randomUUID(), name: String(b.name || '定时任务').slice(0, 40),
      kind: b.kind === 'daily' ? 'daily' : 'interval',
      intervalMinutes: Math.max(1, Math.min(7 * 24 * 60, Math.round(Number(b.intervalMinutes) || 60))),
      at: /^\d{1,2}:\d{2}$/.test(String(b.at || '')) ? String(b.at) : '09:00',
      task: String(b.task).slice(0, 4000), sessionId: String(b.sessionId || ''),
      enabled: true, consecutiveFails: 0, lastStatus: '', lastRun: 0, lastCost: 0, activeTaskId: '', createdAt: Date.now(),
    }
    s.nextRun = computeNextRun(s)
    schedules.unshift(s); await saveSchedules()
    audit(req, 'schedule.create', { name: s.name })
    return sendJson(res, 200, { ok: true, schedule: s })
  }
  const msch = pathname.match(/^\/api\/schedules\/([^/]+)$/)
  if (msch) {
    const s = schedules.find((x) => x.id === msch[1])
    if (!s) return sendJson(res, 404, { ok: false, error: '定时任务不存在' })
    if (method === 'PUT') {
      const b = await readBody(req)
      if (b.enabled != null) { s.enabled = !!b.enabled; s.consecutiveFails = 0 }
      if (b.name != null) s.name = String(b.name).slice(0, 40)
      if (b.task != null && String(b.task).trim()) s.task = String(b.task).slice(0, 4000)
      if (b.kind === 'daily' || b.kind === 'interval') s.kind = b.kind
      if (b.intervalMinutes != null) s.intervalMinutes = Math.max(1, Math.min(7 * 24 * 60, Math.round(Number(b.intervalMinutes) || 60)))
      if (/^\d{1,2}:\d{2}$/.test(String(b.at || ''))) s.at = String(b.at)
      if (b.sessionId != null) s.sessionId = String(b.sessionId)
      s.nextRun = computeNextRun(s)
      await saveSchedules()
      audit(req, 'schedule.update', { id: s.id, enabled: s.enabled })
      return sendJson(res, 200, { ok: true, schedule: s })
    }
    if (method === 'DELETE') {
      schedules = schedules.filter((x) => x.id !== s.id)
      await saveSchedules()
      audit(req, 'schedule.delete', { id: s.id })
      return sendJson(res, 200, { ok: true })
    }
  }
  // ★ 本地知识库（RAG）：索引状态 / 重建 / 检索测试
  if (pathname === '/api/kb/stats' && method === 'GET') {
    const root = String(url.searchParams.get('root') || '') || getActiveRoot()
    const idx = await kbLoad(root)
    const chunks = idx ? (idx.files || []).reduce((n, f) => n + (f.chunks?.length || 0), 0) : 0
    return sendJson(res, 200, { ok: true, root, path: path.join(root, '.oat', 'index.json'), exists: !!idx, files: idx ? (idx.files || []).length : 0, chunks, builtAt: idx?.builtAt || 0, auto: settings.kbAuto !== false })
  }
  if (pathname === '/api/kb/rebuild' && method === 'POST') {
    const b = await readBody(req)
    const root = String(b.root || '') || getActiveRoot()
    const st = await kbBuild(root)
    audit(req, 'kb.rebuild', { root })
    return sendJson(res, 200, { ok: true, ...st })
  }
  if (pathname === '/api/kb/search' && method === 'GET') {
    const root = String(url.searchParams.get('root') || '') || getActiveRoot()
    const q = String(url.searchParams.get('q') || '')
    const limit = Math.min(10, Number(url.searchParams.get('limit') || 5) || 5)
    const results = await kbSearch(root, q, limit)
    return sendJson(res, 200, { ok: true, results })
  }
  // ★ 媒体引擎：状态 / 安装 ffmpeg
  if (pathname === '/api/media/status' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true, ffmpeg: ffmpegReady(),
      voiceBackend: settings.voiceBackend === 'voicestudio' ? 'voicestudio' : 'cloud',
      ttsProviderId: settings.ttsProviderId || '', ttsModel: settings.ttsModel || '', ttsVoice: settings.ttsVoice || '',
      vsUrl: vsUrl(), vsVoice: settings.vsVoice || '', vsModel: settings.vsModel || 'omnivoice',
      qwenUrl: qwenUrl(), qwenModel: settings.qwenModel || '', qwenSpeaker: settings.qwenSpeaker || '', qwenVoice: settings.qwenVoice || '',
      bgmDir: path.join(getActiveRoot(), 'bgm'),
    })
  }
  // ★ Qwen-TTS 本地引擎：连接检测 / 模型列表（注意：不主动查音色列表——那会触发 WebUI 加载大模型）
  if (pathname === '/api/qwen/status' && method === 'GET') {
    const h = await qwenHealth()
    return sendJson(res, 200, {
      ok: true, url: qwenUrl(), running: h.ok,
      models: (h.models || []).map((m) => ({ name: m.name, type: m.type })),
      cloned: localVoices.filter((v) => v.engine === 'qwen').slice(0, 50),
    })
  }
  // ★ VoiceStudio 本地声音引擎：状态 / 检测 / 下载安装包 / 运行安装包
  if (pathname === '/api/voicestudio/status' && method === 'GET') {
    const h = await vsHealth()
    let voices = []
    if (h.ok) { try { voices = await vsListVoices() } catch { /* ignore */ } }
    return sendJson(res, 200, { ok: true, url: vsUrl(), running: h.ok, protocol: h.protocol || '', voices: voices.slice(0, 50), voicesCount: voices.length, cloned: localVoices.filter((v) => v.engine === 'voicestudio').slice(0, 50) })
  }
  if (pathname === '/api/voicestudio/download' && method === 'POST') {
    try {
      let tag = '', asset = null
      if (process.platform === 'win32') {
        // ★ Windows 走 PowerShell 通道（与热更新下载一致，规避 Node fetch 的 TLS/代理问题）
        const meta = await execAsync(`powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (Invoke-WebRequest -Uri 'https://api.github.com/repos/debpalash/VoiceStudio/releases/latest' -UseBasicParsing -Headers @{'User-Agent'='open-agent-team'}).Content"`, { timeout: 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
        const j2 = JSON.parse(meta.stdout)
        tag = j2.tag_name || 'latest'
        asset = (j2.assets || []).find((a) => /win-x64\.exe$/i.test(a.name))
      } else {
        const r = await fetch('https://api.github.com/repos/debpalash/VoiceStudio/releases/latest', { headers: { 'User-Agent': 'open-agent-team' }, signal: AbortSignal.timeout(30000) })
        const j2 = await r.json()
        tag = j2.tag_name || 'latest'
        asset = (j2.assets || []).find((a) => /win-x64\.exe$/i.test(a.name))
      }
      if (!asset) return sendJson(res, 200, { ok: false, error: '未找到 Windows 安装包，请到 GitHub Releases 手动下载' })
      await mkdir(path.join(__dirname, 'tools'), { recursive: true })
      const dest = path.join(__dirname, 'tools', `VoiceStudio-Setup-${tag}.exe`)
      if (!existsSync(dest)) {
        // ★ 直连失败时走国内镜像回退（ghproxy 系）
        const urls = [
          asset.browser_download_url,
          `https://ghproxy.net/${asset.browser_download_url}`,
          `https://gh-proxy.com/${asset.browser_download_url}`,
          `https://ghfast.top/${asset.browser_download_url}`,
        ]
        let ok = false; let lastErr = ''
        for (const u of urls) {
          try {
            if (process.platform === 'win32') {
              await execAsync(`powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${u}' -OutFile '${dest}' -UseBasicParsing -Headers @{'User-Agent'='open-agent-team'}"`, { timeout: 1800000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })
            } else {
              const buf = Buffer.from(await (await fetch(u, { signal: AbortSignal.timeout(1800000) })).arrayBuffer())
              await writeFile(dest, buf)
            }
            ok = true; dbg('voicestudio.download_ok', { url: String(u).slice(0, 80) }); break
          } catch (e) { lastErr = String(e.message || e).slice(0, 200); try { await rm(dest, { force: true }) } catch { /* ignore */ } }
        }
        if (!ok) return sendJson(res, 200, { ok: false, error: `下载失败（直连与镜像均失败）：${lastErr}` })
      }
      // ★ 官方 Release 提供 sha256 摘要时校验完整性
      if (typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')) {
        const buf = await readFile(dest)
        const got = crypto.createHash('sha256').update(buf).digest('hex')
        if (got !== asset.digest.slice(7).toLowerCase()) { try { await rm(dest, { force: true }) } catch { /* ignore */ } return sendJson(res, 200, { ok: false, error: '安装包 sha256 校验失败，已删除，请重试' }) }
      }
      audit(req, 'voicestudio.download', { version: tag })
      const size = existsSync(dest) ? (await stat(dest)).size : 0
      return sendJson(res, 200, { ok: true, path: dest, version: tag, size })
    } catch (e) { return sendJson(res, 200, { ok: false, error: String(e.message || e).slice(0, 300) }) }
  }
  if (pathname === '/api/voicestudio/launch-installer' && method === 'POST') {
    try {
      const toolsDir = path.join(__dirname, 'tools')
      const files = (await readdir(toolsDir).catch(() => [])).filter((f) => /^VoiceStudio-Setup-.*\.exe$/i.test(f)).sort()
      if (!files.length) return sendJson(res, 200, { ok: false, error: '未找到安装包：请先点「下载安装包」' })
      const exe = path.join(toolsDir, files[files.length - 1])
      spawn(exe, [], { detached: true, stdio: 'ignore' }).unref()
      audit(req, 'voicestudio.launch_installer', { file: files[files.length - 1] })
      return sendJson(res, 200, { ok: true, path: exe })
    } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  if (pathname === '/api/media/install-ffmpeg' && method === 'POST') {
    try { await ensureFfmpeg(); audit(req, 'media.ffmpeg_install', {}); return sendJson(res, 200, { ok: true }) }
    catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  // ★ .oat 常驻项目档案：查看 / 覆盖 / 清空（存于 工作区/.oat/PROJECT.md，随项目迁移）
  if (pathname === '/api/project-memory' && method === 'GET') {
    const root = String(url.searchParams.get('root') || '') || getActiveRoot()
    return sendJson(res, 200, { ok: true, root, path: path.join(root, '.oat', 'PROJECT.md'), text: await readProjectMemory(root) })
  }
  if (pathname === '/api/project-memory' && method === 'POST') {
    const b = await readBody(req)
    const root = String(b.root || '') || getActiveRoot()
    const dir = path.join(root, '.oat')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'PROJECT.md'), String(b.text || ''), 'utf8')
    projMemCache.delete(root)
    audit(req, 'project_memory.write', { root })
    return sendJson(res, 200, { ok: true })
  }
  if (pathname === '/api/project-memory' && method === 'DELETE') {
    const root = String(url.searchParams.get('root') || '') || getActiveRoot()
    try { await rm(path.join(root, '.oat', 'PROJECT.md'), { force: true }) } catch { /* ignore */ }
    projMemCache.delete(root)
    audit(req, 'project_memory.clear', { root })
    return sendJson(res, 200, { ok: true })
  }
  // ★ 清理残留数据：孤儿任务记录 / 引用已删除会话的任务 / 空会话 / 已删除角色的对话记忆
  if (pathname === '/api/cleanup' && method === 'POST') {
    const result = { sessions: 0, tasks: 0, taskFiles: 0, roleChats: 0 }
    try {
      const sessIds = new Set(sessions.map((s) => s.id))
      const idxFile = path.join(TASKS_DIR, 'index.json')
      let list = []
      try { list = JSON.parse(await readFile(idxFile, 'utf8')) } catch { list = [] }
      const keep = []
      for (const t of list) {
        if (t.sessionId && !sessIds.has(t.sessionId)) {
          try { await rm(path.join(TASKS_DIR, `${t.id}.json`), { force: true }); await rm(path.join(TASKS_DIR, `${t.id}.events.jsonl`), { force: true }) } catch { /* ignore */ }
          result.tasks++
        } else keep.push(t)
      }
      if (keep.length !== list.length) await writeFile(idxFile, JSON.stringify(keep, null, 2), 'utf8')
      // 不在索引里的任务明细文件 / 事件回放文件（历史残留）
      const files = await readdir(TASKS_DIR).catch(() => [])
      for (const f of files) {
        if (f === 'index.json') continue
        if (f.endsWith('.events.jsonl')) { const id = f.replace(/\.events\.jsonl$/, ''); if (!keep.some((t) => t.id === id)) { try { await rm(path.join(TASKS_DIR, f), { force: true }); result.taskFiles++ } catch { /* ignore */ } } ; continue }
        if (!f.endsWith('.json')) continue
        const id = f.replace(/\.json$/, '')
        if (!keep.some((t) => t.id === id)) { try { await rm(path.join(TASKS_DIR, f), { force: true }); result.taskFiles++ } catch { /* ignore */ } }
      }
      // 空会话（从未产生任何消息）
      const before = sessions.length
      sessions = sessions.filter((s) => (s.messages || []).length > 0)
      result.sessions = before - sessions.length
      if (result.sessions) await saveSessions()
      // 已删除角色的对话记忆
      const roleIds = new Set(roles.map((r) => r.id))
      for (const rid of Object.keys(roleChats)) {
        if (!roleIds.has(rid)) { delete roleChats[rid]; result.roleChats++ }
      }
      if (result.roleChats) saveRoleChats()
    } catch (e) { dbg('cleanup.fail', { error: e.message }) }
    return sendJson(res, 200, { ok: true, ...result })
  }
  // 任务
  if (pathname === '/api/tasks' && method === 'GET') { const f = path.join(TASKS_DIR, 'index.json'); return sendJson(res, 200, { ok: true, tasks: existsSync(f) ? (await readFile(f, 'utf8').then(JSON.parse).catch(() => [])) : [] }) }
  const mtask = pathname.match(/^\/api\/tasks\/([^/]+)$/)
  if (mtask && method === 'GET') { const f = path.join(TASKS_DIR, `${mtask[1]}.json`); if (!existsSync(f)) return sendJson(res, 404, { ok: false, error: '不存在' }); return sendJson(res, 200, { ok: true, task: JSON.parse(await readFile(f, 'utf8')) }) }
  // 图片
  if (pathname === '/api/images/generate' && method === 'POST') {
    const b = await readBody(req)
    const provider = providers.find((p) => p.id === b.providerId)
    if (!provider) return sendJson(res, 404, { ok: false, error: '未找到该 API' })
    try {
      const urls = await generateImage(provider, b.model, b.prompt, b.name)
      await recordArt(urls, { prompt: b.prompt, model: b.model, provider: provider.name, providerId: provider.id, role: '手动', keep: true, kind: 'image' })
      return sendJson(res, 200, { ok: true, urls })
    } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  // ★ 视频生成（手动）
  if (pathname === '/api/videos/generate' && method === 'POST') {
    const b = await readBody(req)
    const provider = providers.find((p) => p.id === b.providerId)
    if (!provider) return sendJson(res, 404, { ok: false, error: '未找到该 API' })
    try {
      const urls = await generateVideo(provider, b.model, b.prompt, b.name)
      await recordArt(urls, { prompt: b.prompt, model: b.model, provider: provider.name, providerId: provider.id, role: '手动', keep: true, kind: 'video' })
      return sendJson(res, 200, { ok: true, urls })
    } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  // ★ 凭据保险箱
  if (pathname === '/api/vault' && method === 'GET') {
    const pass = await getVaultPass()
    const kb = await vaultGetKey()
    return sendJson(res, 200, {
      ok: true, hasPassword: !!pass,
      items: vault.map((it) => ({ id: it.id, name: it.name, type: it.type || 'custom', baseUrl: it.baseUrl || '', note: it.note || '', keyMasked: maskKey(decryptText(it.keyCipher, kb) || ''), t: it.t || 0 })),
    })
  }
  if (pathname === '/api/vault' && method === 'POST') {
    const b = await readBody(req)
    if (!String(b.name || '').trim()) return sendJson(res, 200, { ok: false, error: '请填写名称' })
    const kb = await vaultGetKey()
    const note = String(b.note || '').trim() || guessVaultNote(b.name, b.baseUrl)
    const exist = b.id ? vault.find((x) => x.id === b.id) : null
    if (exist) {
      exist.name = String(b.name); exist.type = b.type || exist.type; exist.baseUrl = String(b.baseUrl || '')
      exist.note = note
      if (b.method != null) exist.method = String(b.method || 'GET').toUpperCase()
      if (b.authHeader != null) exist.authHeader = String(b.authHeader || '')
      if (String(b.key || '').trim()) exist.keyCipher = encryptText(String(b.key).trim(), kb)
      exist.t = Date.now()
    } else {
      vault.unshift({ id: crypto.randomUUID(), name: String(b.name), type: b.type || 'custom', baseUrl: String(b.baseUrl || ''), method: String(b.method || 'GET').toUpperCase(), authHeader: String(b.authHeader || ''), note, keyCipher: encryptText(String(b.key || '').trim(), kb), t: Date.now() })
    }
    await saveVault()
    return sendJson(res, 200, { ok: true })
  }
  const mvault = pathname.match(/^\/api\/vault\/([^/]+)$/)
  if (mvault && method === 'DELETE') {
    vault = vault.filter((x) => x.id !== mvault[1])
    await saveVault()
    return sendJson(res, 200, { ok: true })
  }
  if (pathname === '/api/vault/reveal' && method === 'POST') {
    // ★ 安全审计修复：密钥查看密码暴力破解防护（每 IP 5 次失败锁 60 秒）
    const vf = pairFails.get('vault:' + clientIp) || { n: 0, until: 0 }
    if (vf.until > Date.now()) return sendJson(res, 200, { ok: false, error: '密码尝试次数过多，请 1 分钟后再试' })
    const b = await readBody(req)
    const it = vault.find((x) => x.id === b.id)
    if (!it) return sendJson(res, 200, { ok: false, error: '记录不存在' })
    const pass = await getVaultPass()
    if (pass) {
      const salt = pass.salt || ''
      if (vaultHash(b.password || '', salt) !== pass.hash) {
        vf.n++
        if (vf.n >= 5) { vf.until = Date.now() + 60 * 1000; vf.n = 0 }
        pairFails.set('vault:' + clientIp, vf)
        audit(req, 'vault.reveal_fail', {})
        return sendJson(res, 200, { ok: false, error: '密码不正确' })
      }
    }
    pairFails.delete('vault:' + clientIp)
    const kb = await vaultGetKey()
    return sendJson(res, 200, { ok: true, key: decryptText(it.keyCipher, kb) || '' })
  }
  // ★ 安全审计修复：清除保护仅允许电脑本机操作（防远程/局域网设备清掉密码门槛后查看密钥）
  if (pathname === '/api/vault/password/reset' && method === 'POST') {
    if (!isLoopback) { audit(req, 'vault.reset_denied', {}); return sendJson(res, 403, { ok: false, error: '为安全起见，「清除保护」仅允许在电脑本机操作' }) }
    try { await rm(VAULT_PASS_FILE, { force: true }) } catch { /* ignore */ }
    audit(req, 'vault.reset', {})
    return sendJson(res, 200, { ok: true, hasPassword: false })
  }
  if (pathname === '/api/vault/password' && method === 'POST') {
    const b = await readBody(req)
    const cur = await getVaultPass()
    if (cur) {
      if (vaultHash(b.old || '', cur.salt || '') !== cur.hash) return sendJson(res, 200, { ok: false, error: '原密码不正确' })
    }
    const next = String(b.new || '')
    if (!next) { try { await rm(VAULT_PASS_FILE, { force: true }) } catch { /* ignore */ } ; return sendJson(res, 200, { ok: true, hasPassword: false }) }
    const salt = crypto.randomBytes(16).toString('hex')
    await writeFile(VAULT_PASS_FILE, JSON.stringify({ salt, hash: vaultHash(next, salt) }), 'utf8')
    return sendJson(res, 200, { ok: true, hasPassword: true })
  }
  // ★ GitHub 热更新：检查新版本（Windows 下优先用 PowerShell 下载，避免 Node 证书链校验失败）
  if (pathname === '/api/update/check' && method === 'GET') {
    const repo = String(url.searchParams.get('repo') || settings.updateRepo || '').trim()
    const branch = String(url.searchParams.get('branch') || settings.updateBranch || 'main').trim()
    const current = appVersion()
    if (!repo) return sendJson(res, 200, { ok: false, error: '未配置更新源：请在「设置 → 更新」填写你的 GitHub 仓库（如 username/repo）', current })
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return sendJson(res, 200, { ok: false, error: '仓库格式应为 owner/repo', current })
    try {
      const text = await ghGetText(`https://raw.githubusercontent.com/${repo}/${branch}/version.json?t=${Date.now()}`)
      const j = JSON.parse(text)
      const latest = String(j?.version || '').trim()
      if (!latest) return sendJson(res, 200, { ok: false, error: 'version.json 缺少 version 字段', current })
      return sendJson(res, 200, { ok: true, current, latest, newer: cmpVer(latest, current) > 0, notes: String(j?.notes || ''), date: String(j?.date || ''), repo, branch })
    } catch (e) {
      const msg = String(e?.message || e)
      let friendly = `检查失败：${msg.replace(/Command failed:[\s\S]*?Invoke-WebRequest/, '下载失败：').slice(0, 160)}`
      if (/404/.test(msg)) friendly = '该仓库/分支下没有 version.json —— 请在仓库根目录放置 version.json（参考项目根目录的同名文件）'
      else { const m = msg.match(/5\d\d/); if (m) friendly = `网络或代理暂时不可用（HTTP ${m[0]}），请稍后重试` }
      return sendJson(res, 200, { ok: false, error: friendly, current })
    }
  }
  // ★ GitHub 热更新：下载并应用（仅覆盖程序文件，绝不触碰 data / workspace / node_modules）
  if (pathname === '/api/update/apply' && method === 'POST') {
    const b = await readBody(req)
    const repo = String(b.repo || settings.updateRepo || '').trim()
    const branch = String(b.branch || settings.updateBranch || 'main').trim()
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return sendJson(res, 200, { ok: false, error: '未配置或格式错误（应为 owner/repo）' })
    const fromVer = appVersion()
    const tmp = path.join(os.tmpdir(), 'oat-update-' + Date.now())
    try {
      await mkdir(tmp, { recursive: true })
      const zipPath = path.join(tmp, 'update.zip')
      await ghDownload(`https://github.com/${repo}/archive/refs/heads/${branch}.zip`, zipPath)
      const extractDir = path.join(tmp, 'src')
      await mkdir(extractDir, { recursive: true })
      try { await execAsync(`tar -xf "${zipPath}" -C "${extractDir}"`, { timeout: 180000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }) }
      catch { await execAsync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { timeout: 300000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }) }
      const tops = (await readdir(extractDir)).map((x) => path.join(extractDir, x))
      const srcRoot = tops.find((x) => existsSync(path.join(x, 'server.mjs'))) || tops[0]
      if (!srcRoot || !existsSync(path.join(srcRoot, 'server.mjs'))) throw new Error('压缩包内未找到 server.mjs（请确认仓库根目录就是应用文件）')
      // 白名单覆盖：只更新程序文件；data/ workspace/ node_modules/ 一律不动
      const ITEMS = ['server.mjs', 'package.json', 'package-lock.json', 'version.json', 'web', 'desktop', 'README.md', '插件开发说明.md', '使用说明.txt', '启动工作站.bat', '启动桌面版.bat']
      const updated = []
      for (const it of ITEMS) {
        const from = path.join(srcRoot, it)
        if (!existsSync(from)) continue
        const to = path.join(__dirname, it)
        const st = await stat(from)
        if (st.isDirectory()) { await rm(to, { recursive: true, force: true }); await cp(from, to, { recursive: true }) }
        else await copyFile(from, to)
        updated.push(it)
      }
      let toVer = fromVer
      try { toVer = JSON.parse(await readFile(path.join(__dirname, 'package.json'), 'utf8')).version || fromVer } catch { /* ignore */ }
      dbg('update.applied', { repo, branch, from: fromVer, to: toVer, updated })
      // 更新后重启：Windows 自拉起；Android 写标记由手机壳提示重启（内嵌引擎不能自杀退出）
      try {
        if (process.platform === 'android') {
          await writeFile(path.join(DATA_DIR, '.engine-updated'), String(Date.now())).catch(() => {})
        } else {
          if (process.platform === 'win32') {
            spawn('cmd.exe', ['/c', `timeout /t 2 /nobreak >nul & "${process.execPath}" server.mjs`], { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true }).unref()
          }
          setTimeout(() => process.exit(0), 800)
        }
      } catch { /* 重启失败也不影响已更新的文件 */ }
      return sendJson(res, 200, { ok: true, from: fromVer, to: toVer, updated, restart: true })
    } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
    finally { try { await rm(tmp, { recursive: true, force: true }) } catch { /* ignore */ } }
  }
  // workspace
  if (pathname === '/api/workspace/tree' && method === 'GET') {
    const root = getActiveRoot()
    const entries = []
    async function walk(dir, depth) {
      if (depth > 4 || entries.length > 800) return
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (['node_modules', '.git'].includes(e.name)) continue
        const rel = path.relative(root, path.join(dir, e.name)).replace(/\\/g, '/')
        entries.push({ path: rel, name: e.name, dir: e.isDirectory() })
        if (e.isDirectory()) await walk(path.join(dir, e.name), depth + 1)
      }
    }
    try { await walk(root, 0) } catch { /* ignore */ }
    return sendJson(res, 200, { ok: true, entries, root })
  }
  if (pathname === '/api/workspace/file' && method === 'GET') {
    try {
      // ★ 返回原始字节（base64），由前端尝试 UTF-8 → GBK 解码，避免中文源码乱码
      const buf = await readFile(resolveInWorkspace(url.searchParams.get('path') || ''))
      return sendJson(res, 200, { ok: true, base64: buf.toString('base64'), size: buf.length })
    } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }) }
  }
  if (pathname === '/api/artifact' && method === 'GET') {
    try { const abs = resolveInWorkspace(url.searchParams.get('path') || ''); if (!existsSync(abs)) { res.writeHead(404); res.end(); return }; res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' }); res.end(await readFile(abs)) } catch { res.writeHead(404); res.end() }
    return
  }
  // ★ 游戏与推演大厅：开始对局（可同时更新配置）
  if (pathname === '/api/game/start' && method === 'POST') {
    const b = await readBody(req)
    const sess = sessions.find((s) => s.id === b.sessionId && (s.kind || '') === 'game')
    if (!sess) return sendJson(res, 404, { ok: false, error: '游戏会话不存在' })
    if (b.game && typeof b.game === 'object') { sess.game = { ...(sess.game || {}), ...b.game }; await saveSessions() }
    const engine = await startGameSession(sess)
    return sendJson(res, 200, { ok: true, state: gameViewFor(engine.state) })
  }
  // ★ 对局状态（刷新/手机端轮询兜底）
  if (pathname === '/api/game/state' && method === 'GET') {
    const sid = url.searchParams.get('sessionId') || ''
    const engine = gameEngines.get(sid)
    if (engine) return sendJson(res, 200, { ok: true, state: gameViewFor(engine.state), running: true })
    const st = await gameLoad(sid)
    if (!st) {
      // ★ 未开局：还没有 state.json —— 按会话配置生成"预览状态"，供前端显示设置面板
      const sess = sessions.find((s) => s.id === sid && (s.kind || '') === 'game')
      if (!sess) return sendJson(res, 200, { ok: false, error: '对局不存在' })
      return sendJson(res, 200, { ok: true, state: gameViewFor(makeGameState(sess)), running: false })
    }
    return sendJson(res, 200, { ok: true, state: gameViewFor(st), running: false })
  }
  // ★ 对局事件流（SSE）：先发当前状态，再回放缓冲/历史事件，最后实时推送
  if (pathname === '/api/game/stream' && method === 'GET') {
    const sid = url.searchParams.get('sessionId') || ''
    const engine = gameEngines.get(sid)
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const st = engine ? engine.state : await gameLoad(sid)
    if (!st) { try { res.write(`data: ${JSON.stringify({ type: 'game-error', error: '对局不存在' })}\n\n`); res.end() } catch { /* ignore */ } return }
    // ★ 双保险：SSE 写入前按用户身份过滤私密事件（与状态视图同一套可见性规则）
    const canSeeNow = (ch) => {
      const S = engine ? engine.state : st
      const uid = S.userSeat
      const isJudge = S.config.myRole === 'judge'
      const isObserver = S.config.myRole === 'observer'
      const me = uid != null ? S.players.find((p) => p.seat === uid) : null
      const userDead = !!(me && !me.alive)
      const userWolf = !!(me && me.team === 'wolf')
      if (ch === 'public') return true
      if (ch === 'judge') return isJudge || isObserver
      if (ch === 'dead') return isJudge || isObserver || userDead
      if (ch === 'wolf') return isJudge || isObserver || userWolf
      if (ch.startsWith('note:')) return isJudge || ch === 'note:' + uid
      if (ch.startsWith('whisper:')) return isJudge || isObserver || ch.split(':').includes(String(uid))
      return false
    }
    const write = (o) => {
      try {
        if (o.type === 'game-msg' && !canSeeNow(o.channel)) return
        if (o.type === 'delta' && !canSeeNow(o.channel || 'public')) return
        if (o.type === 'game-note' && o.seat !== (engine ? engine.state.userSeat : st.userSeat)) return
        res.write(`data: ${JSON.stringify(o)}\n\n`)
      } catch { /* ignore */ }
    }
    write({ type: 'game-state', state: gameViewFor(st) })
    if (engine) {
      // ★ 状态快照已包含全部频道与等待项，无需重放 buffer（避免消息重复）
      const listener = (o) => write(o)
      engine.listeners.add(listener)
      const hb = setInterval(() => write({ ping: Date.now() }), 15000)
      res.on('close', () => { engine.listeners.delete(listener); clearInterval(hb) })
    } else {
      // 未在运行（未开局/已结束/进程重启）：发完成状态快照即可
      try { res.end() } catch { /* ignore */ }
    }
    return
  }
  // ★ 用户操作提交（发言/投票/夜间技能/法官指令）
  if (pathname === '/api/game/action' && method === 'POST') {
    const b = await readBody(req)
    const engine = gameEngines.get(b.sessionId)
    if (!engine) return sendJson(res, 200, { ok: false, error: '对局不在运行中' })
    engineSubmitAction(engine, b.action || {})
    return sendJson(res, 200, { ok: true })
  }
  // ★ 对局控制：暂停/继续（可追加预算）/结束/法官公告/私聊/跳过等待
  if (pathname === '/api/game/control' && method === 'POST') {
    const b = await readBody(req)
    const engine = gameEngines.get(b.sessionId)
    if (!engine) return sendJson(res, 200, { ok: false, error: '对局不在运行中' })
    const S = engine.state
    if (b.action === 'pause') { engine.paused = true; engine.pausedReason = 'user'; gameEmit(engine, { type: 'game-status', status: 'paused' }) }
    else if (b.action === 'resume') {
      engine.paused = false; engine.pausedReason = ''
      if (Number(b.addBudget) > 0) { S.config.budget = Math.max(0, Number(S.config.budget) || 0) + Number(b.addBudget); S.budgetStopped = false }
      gameNotify(engine)
      gameEmit(engine, { type: 'game-status', status: 'running' })
    } else if (b.action === 'stop') {
      engine.abort = true; engine.paused = false
      if (S.waiting) engineSubmitAction(engine, { auto: true })
      gameNotify(engine)
      gameEmit(engine, { type: 'game-status', status: 'stopping' })
    } else if (b.action === 'announce' && b.text) gameSystem(engine, String(b.text).slice(0, 500))
    else if (b.action === 'whisper' && b.to && b.text) { const me = S.userSeat != null ? S.userSeat : 'judge'; gameSay(engine, `whisper:${me}:${b.to}`, '法官', String(b.text).slice(0, 500)) }
    else if (b.action === 'skip' && S.waiting && engine.pendingResolve) engineSubmitAction(engine, { auto: true, skip: true })
    await gameSave(S)
    return sendJson(res, 200, { ok: true, paused: engine.paused })
  }
  // ★ 复盘报告（对局结束后查看）
  if (pathname === '/api/game/review' && method === 'GET') {
    const sid = url.searchParams.get('sessionId') || ''
    const st = await gameLoad(sid)
    if (!st) return sendJson(res, 200, { ok: false, error: '对局不存在' })
    return sendJson(res, 200, { ok: true, md: st.review || '', result: st.result, status: st.status })
  }
  res.writeHead(404); res.end('Not Found')
}

/* ═══════════════════════════════════════════════════════════════
 * 十三、团队会话：游戏与推演大厅（狼人杀 / 角色扮演推演）
 * ─ 与「团队工作」并列：不执行任何工作，只陪用户玩/推演
 * ─ 对局状态 data/games/<会话id>/state.json；事件流 events.jsonl（可回放/复盘）
 * ─ 用户三种身份：judge=法官（看全部）/ player=入局（占一个座位）/ observer=观战
 * ═══════════════════════════════════════════════════════════════ */
// ★ 狼人杀板子（内置三套）
const WW_BOARDS = {
  '6p': { name: '6人局', size: 6, roles: ['wolf', 'wolf', 'seer', 'witch', 'villager', 'villager'], win: 'city', sheriff: false, desc: '2狼 · 预女 · 2民（屠城）' },
  '9p': { name: '9人局', size: 9, roles: ['wolf', 'wolf', 'wolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager'], win: 'side', sheriff: true, desc: '3狼 · 预女猎 · 3民（屠边）' },
  '12p': { name: '12人局', size: 12, roles: ['wolf', 'wolf', 'wolf', 'wolf', 'seer', 'witch', 'hunter', 'idiot', 'villager', 'villager', 'villager', 'villager'], win: 'side', sheriff: true, desc: '4狼 · 预女猎白 · 4民（屠边）' },
}
// ★ 身份说明（发给 AI 的规则要点也用这里）
const WW_ROLES = {
  wolf: { label: '狼人', team: 'wolf', god: false, desc: '每晚与狼队友共同商议并刀掉一名玩家；白天伪装成好人' },
  seer: { label: '预言家', team: 'good', god: true, desc: '每晚查验一名玩家是好人还是狼人' },
  witch: { label: '女巫', team: 'good', god: true, desc: '全局各一次：解药救当晚被刀的人（不能自救）/ 毒药毒死一人' },
  hunter: { label: '猎人', team: 'good', god: true, desc: '被狼刀或被放逐时可开枪带走一人；被女巫毒死不能开枪' },
  idiot: { label: '白痴', team: 'good', god: true, desc: '被投票放逐时翻牌不死，但从此失去投票权' },
  villager: { label: '村民', team: 'good', god: false, desc: '没有技能，靠听发言、盘逻辑找出狼人' },
}
// ★ AI 玩家性格池（零成本随机人设，避免所有 AI 一个腔调）
const WW_PERSONAS = [
  '沉稳老练，发言先立观点再给理由，不喜欢跟风',
  '话痨型选手，喜欢盘逻辑，发言经常超长',
  '谨慎保命派，信息不够时宁愿弃票观望',
  '直觉派，盯语气和态度找狼，经常语出惊人',
  '强势带队型，喜欢指定站边、逼人表态',
  '温和中立，爱当和事佬，不喜欢对线',
  '细节控，专门盯票型和改票找矛盾',
  '爱开玩笑活跃气氛，但关键局很认真',
  '萌新心态，容易紧张、容易相信别人',
  '朋克rapper风格，说话自带节奏，爱用押韵',
]
// ★ 数据读写：一局一个目录
const GAMES_DIR = path.join(DATA_DIR, 'games')
const gameDir = (sid) => path.join(GAMES_DIR, sid)
const gameStateFile = (sid) => path.join(gameDir(sid), 'state.json')
const gameEventsFile = (sid) => path.join(gameDir(sid), 'events.jsonl')
async function gameSave(state) {
  try {
    await mkdir(gameDir(state.sid), { recursive: true })
    await writeFile(gameStateFile(state.sid), JSON.stringify(state, null, 2), 'utf8')
  } catch { /* ignore */ }
}
async function gameLoad(sid) { try { return JSON.parse(await readFile(gameStateFile(sid), 'utf8')) } catch { return null } }
// ★ AI 经验档案：按会话累积（每座位保留最近 10 条），重新游戏后继承
const gameExpFile = (sid) => path.join(gameDir(sid), 'experience.json')
async function gameLoadExperience(sid) { try { const e = JSON.parse(await readFile(gameExpFile(sid), 'utf8')); return { games: Number(e.games) || 0, players: e.players || {} } } catch { return { games: 0, players: {} } } }

// ★ 对局实例：内存中的运行引擎（进程重启后不自动续跑，但状态与事件可回放）
const gameEngines = new Map() // sid → engine

function makeGameState(sess) {
  const cfg = sess.game || {}
  const mode = cfg.mode === 'roleplay' ? 'roleplay' : 'werewolf'
  const board = WW_BOARDS[cfg.board] ? cfg.board : '9p'
  // 座位名称：狼人杀用「N号」，用户座位显示「你」；角色扮演由角色卡生成后覆盖
  const size = mode === 'werewolf' ? WW_BOARDS[board].size : Math.max(2, Math.min(10, Number(cfg.playerCount) || 5)) + (cfg.myRole === 'player' ? 1 : 0)
  const players = []
  for (let i = 1; i <= size; i++) {
    players.push({ seat: i, name: `${i}号`, kind: 'ai', alive: true, role: '', team: '', persona: '', model: null, canVote: true, revealed: false, notes: [] })
  }
  return {
    sid: sess.id, mode, board, status: 'idle',
    createdAt: Date.now(), updatedAt: Date.now(),
    config: {
      mode, board, myRole: ['judge', 'player', 'observer'].includes(cfg.myRole) ? cfg.myRole : 'judge',
      budget: Math.max(0, Number(cfg.budget) || 0), timer: !!cfg.timer, timerSpeak: Math.max(10, Number(cfg.timerSpeak) || 45), timerVote: Math.max(10, Number(cfg.timerVote) || 30),
      voteOpen: cfg.voteOpen !== false,
      providerId: cfg.providerId || sess.providerId || '', model: cfg.model || sess.model || '', playerModels: cfg.playerModels || {},
      userName: String(cfg.userName || '你').slice(0, 20), premise: String(cfg.premise || '').slice(0, 2000), playerCount: Number(cfg.playerCount) || 5,
      characters: Array.isArray(cfg.characters) ? cfg.characters : [], speakLimit: Math.max(40, Number(cfg.speakLimit) || 120),
    },
    title: sess.title || '', day: 0, phase: 'setup', phaseName: '准备中',
    players, userSeat: null, sheriff: null,
    channels: { public: [], wolf: [], dead: [], judge: [] },
    night: null, votes: { current: null, history: [] },
    speak: { order: [], idx: -1, current: null },
    waiting: null, cost: 0, budgetStopped: false,
    result: null, review: '', log: [],
  }
}

// ★ 视图过滤：按用户身份隐藏不该看到的信息（法官=全知）
function gameViewFor(S) {
  const uid = S.userSeat
  const isJudge = S.config.myRole === 'judge'
  const isObserver = S.config.myRole === 'observer'
  const me = uid != null ? S.players.find((p) => p.seat === uid) : null
  const userDead = !!(me && !me.alive)
  const userWolf = !!(me && me.team === 'wolf')
  // ★ 观战 = 全知视角（与法官同级）：可看狼人夜聊/法官频道等全部信息
  const canSee = (ch) => {
    if (ch === 'public') return true
    if (ch === 'judge') return isJudge || isObserver
    if (ch === 'dead') return isJudge || isObserver || userDead
    if (ch === 'wolf') return isJudge || isObserver || userWolf
    if (ch.startsWith('note:')) return isJudge || ch === 'note:' + uid
    if (ch.startsWith('whisper:')) return isJudge || isObserver || ch.split(':').includes(String(uid))
    return false
  }
  const channels = {}
  for (const [k, v] of Object.entries(S.channels || {})) if (canSee(k)) channels[k] = v
  const over = S.status === 'finished'
  const players = S.players.map((p) => ({
    seat: p.seat, name: p.name, kind: p.kind, alive: p.alive, revealed: !!p.revealed, canVote: p.canVote !== false, persona: p.persona || '',
    role: over || isJudge || isObserver || p.seat === uid ? p.role : '',
    team: over || isJudge || isObserver || p.seat === uid || (userWolf && p.team === 'wolf') ? p.team : '',
    isSheriff: S.sheriff === p.seat,
  }))
  // ★ 等待用户操作：只有该用户（或法官输入）能看到并响应
  let waiting = null
  if (S.waiting && (S.waiting.seat === uid || S.waiting.forJudge && isJudge)) {
    waiting = { type: S.waiting.type, seat: S.waiting.seat, prompt: S.waiting.prompt || '', options: S.waiting.options || [], deadline: S.waiting.deadline || 0, minLen: 0 }
  }
  const votes = S.votes?.current ? {
    type: S.votes.current.type, day: S.votes.current.day, round: S.votes.current.round, deadline: S.votes.current.deadline || 0,
    voted: Object.keys(S.votes.current.ballots || {}).map(Number),
    // ★ 票型明细：法官或公布后才可见；投票中只给"谁投完了"进度
    ballots: (isJudge || isObserver || S.votes.current.revealed) ? S.votes.current.ballots : null,
  } : null
  return {
    sid: S.sid, mode: S.mode, board: S.board, title: S.title, status: S.status, day: S.day, phase: S.phase, phaseName: S.phaseName,
    config: { ...S.config, characters: S.config.characters }, players, channels, userSeat: uid, judge: isJudge ? 'user' : (S.config.myRole === 'observer' ? null : null),
    sheriff: S.sheriff, waiting, votes, speak: { current: S.speak?.current || null, order: S.speak?.order || [] },
    cost: Number((S.cost || 0).toFixed(4)), budget: S.config.budget, budgetStopped: !!S.budgetStopped,
    result: S.result, review: S.review || '', experienceGames: S.experience?.games || 0, updatedAt: S.updatedAt,
  }
}

// ★ 事件广播：内存缓冲 + 落盘（delta/typing 不落盘），断线/重启后可回放
function gameEmit(engine, ev) {
  try {
    if (!engine) return
    engine.state.updatedAt = Date.now()
    if (!['delta', 'typing'].includes(ev.type)) engine.buffer.push(ev)
    if (engine.buffer.length > 1500) engine.buffer.splice(0, engine.buffer.length - 1500)
    for (const fn of engine.listeners) { try { fn(ev) } catch { /* ignore */ } }
    if (!['delta', 'typing'].includes(ev.type)) {
      mkdir(gameDir(engine.state.sid), { recursive: true }).then(() => appendFile(gameEventsFile(engine.state.sid), JSON.stringify(ev) + '\n')).catch(() => {})
      engine.saveSoon()
    }
  } catch { /* ignore */ }
}

// ★ AI 调用封装：发言/决策，流式输出到前端，返回 {text, action}（action 来自 <<ACTION>> 协议）
const ACTION_RE = /<<ACTION>>\s*(\{[\s\S]*?\})\s*$/
function parseGameAction(text) {
  const m = ACTION_RE.exec(String(text || '').trim())
  if (!m) return { text: String(text || '').trim(), action: null }
  try { return { text: String(text).replace(ACTION_RE, '').trim(), action: JSON.parse(m[1]) } } catch { return { text: String(text).replace(ACTION_RE, '').trim(), action: null } }
}
function gameProviderModel(engine, seat) {
  const cfg = engine.state.config
  const pm = cfg.playerModels?.[seat] || {}
  const providerId = pm.providerId || cfg.providerId
  const model = pm.model || cfg.model
  const provider = providers.find((p) => p.id === providerId) || providers.find((p) => (p.models || []).some((m) => (m.id || m) === model)) || providers[0]
  return { provider, model: model || (provider?.models?.[0]?.id || provider?.models?.[0] || '') }
}
async function gameAsk(engine, seat, sys, userMsg, opts = {}) {
  const S = engine.state
  const ok = await gameGate(engine)
  if (!ok) throw new Error('对局已结束')
  const { provider, model } = gameProviderModel(engine, seat)
  if (!provider || !model) throw new Error('没有可用的对话模型（请先在团队会话里选择模型）')
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: userMsg }]
  const text = await chatComplete(provider, model, messages, {
    stream: true, temperature: opts.temperature != null ? opts.temperature : 0.8, reasoningEffort: 'none', sessionId: S.sid,
    // ★ 流式增量带频道标记；quiet=不对外流式（用于投票/夜间技能等纯动作决策，防私密内容泄露）
    onDelta: opts.quiet ? null : (d) => gameEmit(engine, { type: 'delta', seat, text: d, channel: opts.deltaChannel || 'public' }),
    onUsage: (usage) => gameTrackUsage(engine, provider, model, usage),
  })
  return parseGameAction(text)
}
function gameTrackUsage(engine, provider, model, usage) {
  try {
    const cost = calcCost(getPrice(provider, model), usage)
    if (cost != null) engine.state.cost += cost
    gameEmit(engine, { type: 'game-cost', cost: Number(engine.state.cost.toFixed(4)), budget: engine.state.config.budget })
    // ★ 单局预算熔断：超预算自动暂停，等用户决定继续/结束
    if (engine.state.config.budget > 0 && engine.state.cost > engine.state.config.budget && !engine.state.budgetStopped) {
      engine.state.budgetStopped = true
      engine.paused = true
      engine.pausedReason = 'budget'
      gameEmit(engine, { type: 'game-system', text: `【预算】已达到单局预算 ¥${engine.state.config.budget}（已花 ¥${engine.state.cost.toFixed(2)}），对局已自动暂停。在顶部继续（追加预算）或结束对局。` })
    }
  } catch { /* ignore */ }
}
// ★ 发言记账：写入频道 + 广播
function gameSay(engine, channel, from, text, extra = {}) {
  const S = engine.state
  const msg = { from, text: String(text || '').slice(0, 3000), day: S.day, phase: S.phase, t: Date.now(), ...extra }
  if (!S.channels[channel]) S.channels[channel] = []
  S.channels[channel].push(msg)
  gameEmit(engine, { type: 'game-msg', channel, msg })
  return msg
}
function gameSystem(engine, text) {
  gameEmit(engine, { type: 'game-system', text })
  return gameSay(engine, 'public', '系统', text, { system: true })
}
// ★ 私密纸条：只发给某个座位的玩家（预言家验人结果 / 女巫用药确认等）
function gameNote(engine, seat, text) {
  gameEmit(engine, { type: 'game-note', seat, text })
  return gameSay(engine, `note:${seat}`, '上帝视角', text, { note: true })
}
function aliveSeats(S) { return S.players.filter((p) => p.alive).map((p) => p.seat) }
function playerBySeat(S, seat) { return S.players.find((p) => p.seat === seat) }
function seatName(S, seat) { return playerBySeat(S, seat)?.name || `${seat}号` }

// ★ 暂停/继续/终止
async function gameGate(engine) {
  while (!engine.abort && engine.paused) await new Promise((r) => engine.waiters.push(r))
  return !engine.abort
}
function gameNotify(engine) { engine.waiters.splice(0).forEach((f) => { try { f() } catch { /* ignore */ } }) }

// ★ 等待用户操作（发言/投票/夜间技能/法官指令）；限时到点执行兜底
function awaitUser(engine, spec) {
  return new Promise((resolve) => {
    const seq = ++engine.waitSeq
    engine.state.waiting = { ...spec, seq, deadline: spec.deadlineSec ? Date.now() + spec.deadlineSec * 1000 : 0 }
    gameEmit(engine, { type: 'game-wait', wait: { type: spec.type, seat: spec.seat, prompt: spec.prompt, options: spec.options || [], deadline: engine.state.waiting.deadline } })
    let timer = null
    if (spec.deadlineSec) timer = setTimeout(() => { if (engine.state.waiting?.seq === seq) engine.submitAction({ auto: true }) }, spec.deadlineSec * 1000 + 500)
    engine.pendingResolve = (v) => {
      if (engine.state.waiting?.seq !== seq) return
      clearTimeout(timer)
      engine.state.waiting = null
      engine.pendingResolve = null
      gameEmit(engine, { type: 'game-wait-clear' })
      resolve(v)
    }
  })
}
// 路由层调用：提交用户动作（也用于限时自动兜底）
function engineSubmitAction(engine, action) {
  if (engine.pendingResolve) engine.pendingResolve(action || {})
}
// ★ 用户发言（流式打断不需要；直接一次性写入频道）
function gameUserSpeak(engine, channel, text) {
  const S = engine.state
  const seat = S.userSeat
  const from = seatName(S, seat)
  gameSay(engine, channel, from, text, { seat })
}

/* ───────────────────────── 狼人杀流程 ───────────────────────── */
// ★ 给 AI 的局势摘要（公开频道最近消息，裁剪到省 token）
function gamePublicBrief(engine, limit = 30) {
  const S = engine.state
  const arr = (S.channels.public || []).slice(-limit)
  return arr.map((m) => `${m.from}：${String(m.text).slice(0, 140)}`).join('\n') || '（暂无发言）'
}
function wwRoleSystem(engine, seat) {
  const S = engine.state
  const p = playerBySeat(S, seat)
  const team = p.team === 'wolf' ? '狼人阵营' : '好人阵营'
  const wolves = p.team === 'wolf' ? S.players.filter((x) => x.team === 'wolf').map((x) => x.name).join('、') : ''
  const notes = (p.notes || []).slice(-8).join('\n')
  // ★ 历史经验（同会话跨对局累积）：越玩越多，判断参考
  const exp = S.experience?.players?.[seat] || []
  const expTxt = exp.slice(-6).map((e) => `- 第${e.g}局（${e.role}）：${e.text}`).join('\n')
  const cfg = S.config
  return [
    `你在玩一局中文狼人杀（${WW_BOARDS[S.board].name}，${WW_BOARDS[S.board].desc}）。你是「${p.name}」，真实身份是【${WW_ROLES[p.role]?.label}】，属于${team}。`,
    `胜利条件：${p.team === 'wolf' ? '狼人获胜=' + (WW_BOARDS[S.board].win === 'side' ? '屠边（神职全死或村民全死）' : '屠城（好人全部出局）') : '好人获胜=放逐或杀死全部狼人'}。`,
    wolves && p.role === 'wolf' ? `你的狼队友：${wolves}。` : '',
    notes ? `你的私密笔记：\n${notes}` : '',
    expTxt ? `你的历史对局经验（你已玩过 ${S.experience.games} 局，参考这些经验但不要机械照搬）：\n${expTxt}` : '',
    WW_MANNER,
    p.team === 'wolf' ? WW_STRATEGY_WOLF : WW_STRATEGY_GOOD,
    `当前是第${S.day}天。发言要求：直接说台词（用「${p.name}」的口吻），不要旁白描述动作。`,
    cfg.speakLimit ? `发言不超过${cfg.speakLimit}字。` : '',
    `如需执行游戏动作，在发言最后另起一行输出：<<ACTION>>{"type":"动作类型",...}（只能出现一次；不需要动作就不要输出）。可用动作见具体指令。`,
  ].filter(Boolean).join('\n')
}
async function wwAiTalk(engine, seat, situation, opts = {}) {
  const p = playerBySeat(engine.state, seat)
  const { text, action } = await gameAsk(engine, seat, wwRoleSystem(engine, seat), situation, opts)
  return { text, action }
}
async function wwAiDiscuss(engine, seat, situation) {
  // ★ 狼人夜聊的流式发言标记为 wolf 频道，只有狼人与法官能看到
  const { text, action } = await wwAiTalk(engine, seat, situation, { deltaChannel: 'wolf' })
  if (text) gameSay(engine, 'wolf', seatName(engine.state, seat), text, { seat, wolf: true })
  return action
}
// ★ 白天：等待用户发言（轮到时）
async function wwUserSpeak(engine, deadlineSec) {
  const val = await awaitUser(engine, { type: 'speak', seat: engine.state.userSeat, prompt: '轮到你发言了。输入内容将发到公共频道（可点"过麦"跳过）。', deadlineSec })
  const text = String(val?.text || '').trim()
  if (text) gameUserSpeak(engine, 'public', text.slice(0, 1000))
  return text
}
// 夜间狼人：夜聊 + 刀人投票
async function wwNightWolf(engine) {
  const S = engine.state
  S.phase = 'night_wolf'; S.phaseName = '第' + S.day + '夜 · 狼人行动'
  gameEmit(engine, { type: 'game-phase', day: S.day, phase: S.phase, name: S.phaseName })
  const wolves = S.players.filter((p) => p.alive && p.role === 'wolf')
  if (!wolves.length) return
  const alive = aliveSeats(S)
  const votes = {}
  for (const w of wolves) {
    const targets = alive.filter((x) => x !== w.seat).map((x) => `${x}号(${seatName(S, x)})`).join('、')
    if (w.seat === S.userSeat) {
      const val = await awaitUser(engine, { type: 'kill', seat: w.seat, prompt: '你是狼人，选择今晚要刀的目标。', options: alive.filter((x) => x !== w.seat).map((x) => ({ value: x, label: seatName(S, x) })), deadlineSec: S.config.timer ? S.config.timerSpeak : 0 })
      const t = Number(val?.target) || wwPickTarget(engine, alive.filter((x) => x !== w.seat))
      votes[w.seat] = t
      gameSay(engine, 'wolf', '你', `（你选择刀 ${seatName(S, t)}）`, { seat: w.seat, wolf: true })
      continue
    }
    const situation = `现在是第${S.day}夜狼人行动。存活玩家：${alive.map((x) => seatName(S, x)).join('、')}。你们需要刀掉一人。\n狼队在狼人频道的历史发言：\n${(S.channels.wolf || []).slice(-12).map((m) => `${m.from}：${m.text}`).join('\n') || '（无）'}\n请先在狼人频道说一句简短的意见（≤60字），然后输出动作：<<ACTION>>{"type":"kill","target":座位号}`
    const act = await wwAiDiscuss(engine, w.seat, situation)
    votes[w.seat] = Number(act?.target) || wwPickTarget(engine, alive.filter((x) => x !== w.seat))
  }
  // 统计刀口：多数决，平票随机
  const tally = {}
  for (const t of Object.values(votes)) tally[t] = (tally[t] || 0) + 1
  let best = [], max = 0
  for (const [t, n] of Object.entries(tally)) { if (n > max) { max = n; best = [Number(t)] } else if (n === max) best.push(Number(t)) }
  const target = wwPickTarget(engine, best)
  S.night = { wolfTarget: target, witchHeal: false, witchPoison: null, seerCheck: null }
  gameEmit(engine, { type: 'game-system', text: `（夜间信息：狼人选择刀 ${seatName(S, target)}）`, vis: 'wolf' })
  gameSay(engine, 'wolf', '系统', `今晚狼队统一刀 ${seatName(S, target)}`, { wolf: true })
}
function wwPickTarget(engine, arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null }
// 夜间女巫
async function wwNightWitch(engine) {
  const S = engine.state
  S.phase = 'night_witch'; S.phaseName = '第' + S.day + '夜 · 女巫行动'
  gameEmit(engine, { type: 'game-phase', day: S.day, phase: S.phase, name: S.phaseName })
  const w = S.players.find((p) => p.alive && p.role === 'witch')
  if (!w) return
  const target = S.night?.wolfTarget
  const canHeal = w.usedHeal !== true && target && target !== w.seat
  const canPoison = w.usedPoison !== true
  const alive = aliveSeats(S).filter((x) => x !== w.seat)
  if (w.seat === S.userSeat) {
    const options = []
    if (canHeal) options.push({ value: `heal:${target}`, label: `救 ${seatName(S, target)}` })
    options.push({ value: 'none', label: '不用药' })
    for (const x of alive) if (canPoison) options.push({ value: `poison:${x}`, label: `毒 ${seatName(S, x)}` })
    const val = await awaitUser(engine, { type: 'poison', seat: w.seat, prompt: `你是女巫。今晚 ${seatName(S, target)} 被刀${target === w.seat ? '（是你自己，不能自救）' : ''}。解药${w.usedHeal ? '已用' : '可用'}，毒药${w.usedPoison ? '已用' : '可用'}。`, options, deadlineSec: S.config.timer ? S.config.timerSpeak : 0 })
    const v = String(val?.value || 'none')
    if (v.startsWith('heal:') && canHeal) { S.night.witchHeal = true; w.usedHeal = true; gameSay(engine, 'judge', '系统', `女巫使用解药救了 ${seatName(S, target)}`, { system: true }); gameNote(engine, w.seat, `【女巫】你使用了解药，救回 ${seatName(S, target)}`) }
    else if (v.startsWith('poison:') && canPoison) { const t = Number(v.split(':')[1]); S.night.witchPoison = t; w.usedPoison = true; gameSay(engine, 'judge', '系统', `女巫使用毒药毒了 ${seatName(S, t)}`, { system: true }); gameNote(engine, w.seat, `【女巫】你使用了毒药，目标 ${seatName(S, t)}`) }
    else gameNote(engine, w.seat, '【女巫】你今晚没有用药')
    return
  }
  const situation = `现在是第${S.day}夜女巫行动。今晚 ${seatName(S, target)} 被狼人袭击。你的解药${w.usedHeal ? '已经用过' : '还没用'}，毒药${w.usedPoison ? '已经用过' : '还没用'}。${canHeal ? `你可以救 ${seatName(S, target)}（不能自救，本局解药未用）` : '你无法使用解药'}；${canPoison ? '你可以毒任意一名存活玩家' : '毒药已用完'}。\n请输出动作（不救人毒人就选 none）：<<ACTION>>{"type":"heal"} 救人；<<ACTION>>{"type":"poison","target":座位号} 毒人；<<ACTION>>{"type":"none"} 不用药。`
  const { action } = await gameAsk(engine, w.seat, wwRoleSystem(engine, w.seat), situation, { quiet: true })
  if (action?.type === 'heal' && canHeal) { S.night.witchHeal = true; w.usedHeal = true; gameSay(engine, 'judge', '系统', `女巫使用解药救了 ${seatName(S, target)}`, { system: true }) }
  else if (action?.type === 'poison' && canPoison) { const t = Number(action.target); if (alive.includes(t)) { S.night.witchPoison = t; w.usedPoison = true; gameSay(engine, 'judge', '系统', `女巫使用毒药毒了 ${seatName(S, t)}`, { system: true }) } }
}
// 夜间预言家
async function wwNightSeer(engine) {
  const S = engine.state
  S.phase = 'night_seer'; S.phaseName = '第' + S.day + '夜 · 预言家查验'
  gameEmit(engine, { type: 'game-phase', day: S.day, phase: S.phase, name: S.phaseName })
  const p = S.players.find((x) => x.alive && x.role === 'seer')
  if (!p) return
  const alive = aliveSeats(S).filter((x) => x !== p.seat)
  let target = null
  if (p.seat === S.userSeat) {
    const val = await awaitUser(engine, { type: 'check', seat: p.seat, prompt: '你是预言家，选择今晚查验的目标。', options: alive.map((x) => ({ value: x, label: seatName(S, x) })), deadlineSec: S.config.timer ? S.config.timerSpeak : 0 })
    target = Number(val?.target) || wwPickTarget(engine, alive)
  } else {
    const situation = `现在是第${S.day}夜预言家行动。存活玩家：${alive.map((x) => seatName(S, x)).join('、')}。选择一名玩家查验。\n请输出动作：<<ACTION>>{"type":"check","target":座位号}`
    const { action } = await gameAsk(engine, p.seat, wwRoleSystem(engine, p.seat), situation, { quiet: true })
    target = Number(action?.target)
    if (!alive.includes(target)) target = wwPickTarget(engine, alive)
  }
  const t = playerBySeat(S, target)
  const isWolf = t?.team === 'wolf'
  S.night.seerCheck = { target, isWolf }
  p.notes.push(`第${S.day}夜查验 ${t.name}：${isWolf ? '狼人' : '好人'}`)
  gameSay(engine, 'judge', '系统', `预言家查验 ${t.name}：${isWolf ? '狼人' : '好人'}`, { system: true })
  if (p.seat === S.userSeat) gameNote(engine, p.seat, `【查验】你查验了 ${t.name}，结果是「${isWolf ? '狼人' : '好人'}」`)
}
// 天亮结算：返回死亡名单 [{seat, cause}]
function wwResolveNight(engine) {
  const S = engine.state
  const n = S.night || {}
  const deaths = []
  const wolfTarget = n.wolfTarget
  const healed = n.witchHeal && wolfTarget
  if (wolfTarget && !healed) deaths.push({ seat: wolfTarget, cause: 'wolf' })
  if (n.witchPoison && !deaths.some((d) => d.seat === n.witchPoison)) deaths.push({ seat: n.witchPoison, cause: 'poison' })
  return deaths
}
// 死亡公告 + 遗言 + 猎人开枪 + 警徽处理；返回是否继续
async function wwHandleDeaths(engine, deaths, nightDeaths) {
  const S = engine.state
  for (const d of deaths) {
    const p = playerBySeat(S, d.seat)
    if (!p || !p.alive) continue
    p.alive = false
    p.cause = d.cause
    const roleTxt = S.config.myRole === 'judge' || S.status === 'finished' ? `（${WW_ROLES[p.role]?.label}）` : ''
    gameSystem(engine, `【出局】${p.name}${roleTxt} 死亡（${d.cause === 'wolf' ? '被狼人杀害' : d.cause === 'poison' ? '被女巫毒杀' : d.cause === 'vote' ? '被放逐' : d.cause === 'shoot' ? '被猎人带走' : d.cause}）。`)
    gameEmit(engine, { type: 'game-death', seat: p.seat, cause: d.cause })
    // ★ 警徽：警长死亡时移交或撕毁
    if (S.sheriff === p.seat) await wwBadgeTransfer(engine, p)
  }
  // ★ 猎人开枪（被毒不能开枪；夜间首夜死亡按规则可开枪）
  for (const d of deaths) {
    const p = playerBySeat(S, d.seat)
    if (!p || p.role !== 'hunter' || p.cause === 'poison' || p.shotUsed) continue
    await wwHunterShoot(engine, p)
  }
  // ★ 遗言：首夜被刀者（除毒死）、被放逐者
  for (const d of deaths) {
    const p = playerBySeat(S, d.seat)
    if (!p) continue
    const canLast = (nightDeaths && S.day === 1 && d.cause === 'wolf') || d.cause === 'vote'
    if (!canLast) continue
    if (p.seat === S.userSeat) {
      const val = await awaitUser(engine, { type: 'speak', seat: p.seat, prompt: '请发表遗言（可跳过）。', deadlineSec: 60 })
      const text = String(val?.text || '').trim()
      if (text) gameUserSpeak(engine, 'public', `【遗言】${text.slice(0, 800)}`)
    } else {
      const situation = `你刚出局，请发表简短遗言（≤100字，可给活着的玩家留信息或表态）。\n最近公共发言：\n${gamePublicBrief(engine, 20)}`
      try {
        const { text } = await wwAiTalk(engine, p.seat, situation)
        if (text) gameSay(engine, 'public', p.name, `【遗言】${text}`, { seat: p.seat, dead: true })
      } catch { /* ignore */ }
    }
  }
}
async function wwBadgeTransfer(engine, sheriffP) {
  const S = engine.state
  const alive = aliveSeats(S)
  if (!alive.length) { gameSystem(engine, '警长死亡且无存活玩家，警徽销毁。'); S.sheriff = null; return }
  if (sheriffP.seat === S.userSeat) {
    const val = await awaitUser(engine, { type: 'badge', seat: S.userSeat, prompt: '你是警长且已出局，请选择警徽移交给谁（或撕毁）。', options: [{ value: 0, label: '撕毁警徽' }, ...alive.map((x) => ({ value: x, label: seatName(S, x) }))] })
    const t = Number(val?.target) || 0
    S.sheriff = t && alive.includes(t) ? t : null
    gameSystem(engine, S.sheriff ? `警徽移交给 ${seatName(S, S.sheriff)}。` : '警徽已被撕毁。')
    return
  }
  const t = alive[Math.floor(Math.random() * alive.length)]
  S.sheriff = t
  gameSystem(engine, `警长 ${sheriffP.name} 出局，警徽移交给 ${seatName(S, t)}。`)
}
async function wwHunterShoot(engine, p) {
  const S = engine.state
  p.shotUsed = true
  const alive = aliveSeats(S)
  let target = null
  if (p.seat === S.userSeat) {
    const val = await awaitUser(engine, { type: 'shoot', seat: p.seat, prompt: '你是猎人且已出局，可以开枪带走一名玩家（或放弃）。', options: [{ value: 0, label: '不开枪' }, ...alive.map((x) => ({ value: x, label: seatName(S, x) }))], deadlineSec: 60 })
    target = Number(val?.target) || 0
  } else {
    try {
      const situation = `你是猎人且已出局，可以开枪带走一名玩家。存活玩家：${alive.map((x) => seatName(S, x)).join('、')}。\n当前局势：\n${gamePublicBrief(engine, 24)}\n请输出动作：<<ACTION>>{"type":"shoot","target":座位号} 或 <<ACTION>>{"type":"none"} 放弃开枪。`
      const { action } = await gameAsk(engine, p.seat, wwRoleSystem(engine, p.seat), situation, { quiet: true })
      if (action?.type === 'shoot' && alive.includes(Number(action.target))) target = Number(action.target)
    } catch { /* ignore */ }
  }
  if (target && alive.includes(target)) {
    gameSystem(engine, `【猎人】${p.name} 开枪带走了 ${seatName(S, target)}！`)
    const t = playerBySeat(S, target)
    if (t && t.alive) {
      t.alive = false; t.cause = 'shoot'
      gameEmit(engine, { type: 'game-death', seat: t.seat, cause: 'shoot' })
      if (t.role === 'hunter' && t.seat !== p.seat) { /* 枪口打中猎人：可链式，简化不连锁 */ }
    }
  } else gameSystem(engine, `猎人 ${p.name} 选择不开枪。`)
}
// ★ 胜负判定（每步死亡后调用）
function wwCheckWin(engine) {
  const S = engine.state
  const alive = S.players.filter((p) => p.alive)
  const wolves = alive.filter((p) => p.team === 'wolf').length
  const goods = alive.filter((p) => p.team === 'good')
  const gods = goods.filter((p) => WW_ROLES[p.role]?.god).length
  const villagers = goods.filter((p) => !WW_ROLES[p.role]?.god).length
  let winner = null
  if (wolves === 0) winner = 'good'
  else if (WW_BOARDS[S.board].win === 'city') { if (goods.length === 0) winner = 'wolf' }
  else { if (gods === 0 || villagers === 0) winner = 'wolf' }
  if (winner) { S.result = { winner, text: winner === 'wolf' ? '狼人阵营获胜！' : '好人阵营获胜！' }; S.status = 'finished'; gameEmit(engine, { type: 'game-win', winner, text: S.result.text }) }
  return !!winner
}
// 警长竞选（第1天）
async function wwSheriffElection(engine) {
  const S = engine.state
  S.phase = 'sheriff'; S.phaseName = '第1天 · 警长竞选'
  gameEmit(engine, { type: 'game-phase', day: S.day, phase: S.phase, name: S.phaseName })
  gameSystem(engine, '现在进行警长竞选：上警玩家依次发言，警下玩家投票选出警长（警长投票算 1.5 票）。')
  const alive = aliveSeats(S)
  const candidates = []
  for (const seat of alive) {
    if (seat === S.userSeat) {
      const val = await awaitUser(engine, { type: 'sheriff-run', seat, prompt: '是否参与警长竞选？', options: [{ value: 1, label: '上警' }, { value: 0, label: '不上警' }], deadlineSec: S.config.timer ? 30 : 0 })
      if (Number(val?.value) === 1) { candidates.push(seat); gameUserSpeak(engine, 'public', '（上警）我要竞选警长。') }
      continue
    }
    try {
      const situation = `第1天警长竞选，请决定是否上警（警长可决定发言顺序、投票算 1.5 票——好人建议积极上警争取警徽；狼人也可以上警抢徽）。如果上警，请发表≤80字的竞选发言；不上警则只说"不上警"。\n最近发言：\n${gamePublicBrief(engine, 12)}\n请输出：在该发言末尾附 <<ACTION>>{"type":"run","value":1}（上警）或 <<ACTION>>{"type":"run","value":0}（不上警）。`
      const { text, action } = await wwAiTalk(engine, seat, situation)
      if (action?.value === 1 || /上警/.test(text) && action?.value !== 0) { candidates.push(seat); if (text && !/不上警/.test(text)) gameSay(engine, 'public', seatName(S, seat), `【竞选警长】${text}`, { seat }) }
      else if (text && !/不上警/.test(text)) gameSay(engine, 'public', seatName(S, seat), text, { seat })
    } catch { /* ignore */ }
  }
  if (!candidates.length) { gameSystem(engine, '无人上警，本局没有警长。'); return }
  gameSystem(engine, `上警玩家：${candidates.map((x) => seatName(S, x)).join('、')}。警下玩家开始投票。`)
  const voters = alive.filter((x) => !candidates.includes(x))
  const ballots = {}
  for (const seat of voters) {
    if (seat === S.userSeat) {
      const val = await awaitUser(engine, { type: 'sheriff-vote', seat, prompt: '请投票选出警长。', options: [{ value: 0, label: '弃票' }, ...candidates.map((x) => ({ value: x, label: seatName(S, x) }))], deadlineSec: S.config.timer ? S.config.timerVote : 0 })
      ballots[seat] = Number(val?.target) || 0
      continue
    }
    try {
      const situation = `警长竞选投票。候选：${candidates.map((x) => seatName(S, x)).join('、')}。请输出投票动作（尽量投给发言更好的候选，别弃票）：<<ACTION>>{"type":"vote","target":座位号}（或 target:0 弃票）。\n候选发言摘要：\n${(S.channels.public || []).slice(-14).map((m) => `${m.from}：${String(m.text).slice(0, 90)}`).join('\n')}`
      const { action } = await gameAsk(engine, seat, wwRoleSystem(engine, seat), situation, { quiet: true })
      const t = Number(action?.target) || 0
      ballots[seat] = candidates.includes(t) ? t : 0
    } catch { ballots[seat] = 0 }
  }
  const tally = {}
  for (const [seat, t] of Object.entries(ballots)) { if (!t) continue; tally[t] = (tally[t] || 0) + 1 }
  let best = [], max = 0
  for (const [t, n] of Object.entries(tally)) { if (n > max) { max = n; best = [Number(t)] } else if (n === max) best.push(Number(t)) }
  const win = wwPickTarget(engine, best)
  S.sheriff = win || null
  gameSystem(engine, win ? `${seatName(S, win)} 当选警长（获得警徽，投票算 1.5 票）。` : '警长竞选平票，警徽随机移交给候选之一。')
  if (!win && candidates.length) S.sheriff = wwPickTarget(engine, candidates)
}
// 白天发言轮
async function wwDaySpeak(engine) {
  const S = engine.state
  S.phase = 'day_speak'; S.phaseName = `第${S.day}天 · 发言`
  gameEmit(engine, { type: 'game-phase', day: S.day, phase: S.phase, name: S.phaseName })
  let order = aliveSeats(S)
  order.sort((a, b) => a - b)
  if (S.sheriff && order.includes(S.sheriff)) { const i = order.indexOf(S.sheriff); order = [...order.slice(i), ...order.slice(0, i)] }
  S.speak = { order, idx: -1, current: null }
  for (const seat of order) {
    if (!playerBySeat(S, seat)?.alive) continue
    if (engine.abort) break
    S.speak.current = seat
    gameEmit(engine, { type: 'game-speak-turn', seat })
    if (seat === S.userSeat) { await wwUserSpeak(engine, S.config.timer ? S.config.timerSpeak : 0) }
    else {
      try {
        const p = playerBySeat(S, seat)
        const extra = p.role === 'seer' && (p.notes || []).length ? '' : ''
        const situation = `现在是第${S.day}天白天发言环节，轮到你（${p.name}）发言。\n昨天的公共发言：\n${gamePublicBrief(engine, 30)}\n请结合你的身份和已知信息发言，表态或给出怀疑目标与理由（不要输出动作）。${extra}`
        const { text } = await wwAiTalk(engine, seat, situation)
        if (text) gameSay(engine, 'public', p.name, text, { seat })
      } catch (err) { gameSystem(engine, `（${seatName(S, seat)} 发言失败：${String(err?.message || err).slice(0, 80)}）`) }
    }
  }
  S.speak.current = null
}
// 放逐投票：返回被放逐座位或 null（平安日）
async function wwDayVote(engine) {
  const S = engine.state
  S.phase = 'day_vote'; S.phaseName = `第${S.day}天 · 放逐投票`
  gameEmit(engine, { type: 'game-phase', day: S.day, phase: S.phase, name: S.phaseName })
  const run = async (total, votersAll, round, forbid) => {
    const alive = aliveSeats(S)
    const voters = votersAll.filter((x) => playerBySeat(S, x)?.alive && playerBySeat(S, x)?.canVote !== false)
    const targets = alive.filter((x) => !forbid.includes(x))
    const ballots = {}
    S.votes.current = { type: 'exile', day: S.day, round, ballots, revealed: !!S.config.voteOpen, deadline: S.config.timer ? Date.now() + S.config.timerVote * 1000 : 0 }
    gameEmit(engine, { type: 'game-vote-start', round, voters, targets, deadline: S.votes.current.deadline })
    for (const seat of voters) {
      if (!playerBySeat(S, seat)?.alive) continue
      if (seat === S.userSeat) {
        const val = await awaitUser(engine, { type: 'vote', seat, prompt: '请投票放逐一名玩家（或弃票）。', options: [{ value: 0, label: '弃票' }, ...targets.map((x) => ({ value: x, label: seatName(S, x) }))], deadlineSec: S.config.timer ? S.config.timerVote : 0 })
        ballots[seat] = Number(val?.target) || 0
      } else {
        try {
          const situation = `第${S.day}天放逐投票（第${round}轮）${forbid.length ? `，你不能投 ${forbid.map((x) => seatName(S, x)).join('、')}` : ''}。可投：${targets.map((x) => seatName(S, x)).join('、')}。\n今天的发言：\n${gamePublicBrief(engine, 36)}\n请输出投票动作（尽量投给最可疑的人；弃票只在完全没有信息时使用）：<<ACTION>>{"type":"vote","target":座位号} 或 <<ACTION>>{"type":"vote","target":0} 弃票。`
          const { action } = await gameAsk(engine, seat, wwRoleSystem(engine, seat), situation, { quiet: true })
          const t = Number(action?.target)
          ballots[seat] = targets.includes(t) ? t : 0
        } catch { ballots[seat] = 0 }
      }
      gameEmit(engine, { type: 'game-vote-progress', voted: Object.keys(ballots).map(Number), total: voters.length })
    }
    // 计票（警长 1.5 票）
    const tally = {}
    for (const [seat, t] of Object.entries(ballots)) {
      if (!t) continue
      const w = seat === String(S.sheriff) ? 1.5 : 1
      tally[t] = (tally[t] || 0) + w
    }
    let best = [], max = 0
    for (const [t, n] of Object.entries(tally)) { if (n > max) { max = n; best = [Number(t)] } else if (n === max) best.push(Number(t)) }
    // ★ 票型公开/隐藏：公开=投票后公布每人票型；隐藏=只公布结果（法官在界面仍可看到明细）
    const showBallots = !!S.config.voteOpen || S.config.myRole === 'judge' || S.config.myRole === 'observer'
    S.votes.current.revealed = showBallots
    gameEmit(engine, { type: 'game-vote-result', ballots: showBallots ? ballots : null, tally: showBallots ? tally : null, max: showBallots ? max : null, best, round })
    if (S.config.voteOpen) gameSystem(engine, `【票型】第${round}轮：${Object.entries(ballots).map(([seat, t]) => `${seatName(S, Number(seat))}→${t ? seatName(S, Number(t)) : '弃票'}`).join('，')}。`)
    else gameSystem(engine, `【投票】第${round}轮计票完成：${best.length === 0 ? '无人得票' : best.length === 1 ? `${seatName(S, best[0])} 票数最高` : `平票（${best.map((x) => seatName(S, x)).join('、')}）`}。`)
    S.votes.history.push({ day: S.day, round, ballots, best })
    S.votes.current = { ...S.votes.current, revealed: showBallots }
    if (!best.length || max === 0) return null
    if (best.length === 1) return best[0]      // 唯一最高票 → 放逐
    // 平票 → PK：平票者发言后，其他人重投（平票者不能投）
    gameSystem(engine, `平票：${best.map((x) => seatName(S, x)).join('、')}，进入 PK 发言。`)
    for (const seat of best) {
      if (!playerBySeat(S, seat)?.alive) continue
      if (seat === S.userSeat) { await wwUserSpeak(engine, S.config.timer ? S.config.timerSpeak : 0) }
      else {
        try { const { text } = await wwAiTalk(engine, seat, `你被平票，进入 PK 发言环节。请为自己辩解（≤80字）。\n${gamePublicBrief(engine, 24)}`); if (text) gameSay(engine, 'public', seatName(S, seat), `【PK】${text}`, { seat }) } catch { /* ignore */ }
      }
    }
    return run(total + 1, alive.filter((x) => !best.includes(x)), round + 1, best)
  }
  const exiled = await run(0, aliveSeats(S), 1, [])
  if (exiled == null) gameSystem(engine, '平票无果，本日无人被放逐（平安日）。')
  return exiled
}
// 放逐结算（白痴翻牌 / 遗言 / 死亡）
async function wwExile(engine, seat) {
  const S = engine.state
  const p = playerBySeat(S, seat)
  if (!p || !p.alive) return
  if (p.role === 'idiot' && !p.revealed) {
    p.revealed = true; p.canVote = false
    gameSystem(engine, `${p.name} 被投票放逐，翻牌为【白痴】，免于死亡但失去投票权。`)
    return
  }
  p.alive = false; p.cause = 'vote'
  gameSystem(engine, `${p.name} 被放逐出局。`)
  gameEmit(engine, { type: 'game-death', seat, cause: 'vote' })
  if (S.sheriff === seat) await wwBadgeTransfer(engine, p)
  if (p.role === 'hunter') await wwHunterShoot(engine, p)
  // 遗言
  if (p.seat === S.userSeat) {
    const val = await awaitUser(engine, { type: 'speak', seat, prompt: '你被放逐，请发表遗言（可跳过）。', deadlineSec: 60 })
    const text = String(val?.text || '').trim()
    if (text) gameUserSpeak(engine, 'public', `【遗言】${text.slice(0, 800)}`)
  } else {
    try { const { text } = await wwAiTalk(engine, seat, `你被投票放逐，请发表遗言（≤100字）。\n${gamePublicBrief(engine, 20)}`); if (text) gameSay(engine, 'public', p.name, `【遗言】${text}`, { seat, dead: true }) } catch { /* ignore */ }
  }
}
// 狼人杀主循环（一晚一天为一轮）
async function wwOneDay(engine) {
  const S = engine.state
  S.day++
  gameSystem(engine, `—— 第${S.day}天 天黑请闭眼 ——`)
  await wwNightWolf(engine)
  await wwNightWitch(engine)
  await wwNightSeer(engine)
  const deaths = wwResolveNight(engine)
  S.phase = 'dawn'; S.phaseName = `第${S.day}天 · 天亮`
  gameSystem(engine, `—— 第${S.day}天 天亮 ——`)
  await wwHandleDeaths(engine, deaths, true)
  if (wwCheckWin(engine)) return
  if (S.day === 1 && WW_BOARDS[S.board].sheriff) await wwSheriffElection(engine)
  await wwDaySpeak(engine)
  const exiled = await wwDayVote(engine)
  if (exiled != null) { await wwExile(engine, exiled); if (wwCheckWin(engine)) return }
}

/* ───────────────────────── 角色扮演推演流程 ───────────────────────── */
async function rpCast(engine) {
  const S = engine.state
  if ((S.config.characters || []).length) {
    S.config.characters.slice(0, S.players.length).forEach((c, i) => { const p = S.players[i]; if (p) { p.name = c.name || p.name; p.persona = c.persona || '' } })
    return
  }
  // ★ 自动生成角色阵容（一次 LLM 调用，失败则用默认阵容）
  const { provider, model } = gameProviderModel(engine, 0)
  const n = S.players.length
  if (provider && model) {
    try {
      const text = await chatComplete(provider, model, [
        { role: 'system', content: '你是角色扮演推演的导演。只输出 JSON，不要任何多余文字。' },
        { role: 'user', content: `题材设定：${S.config.premise || '一群性格各异的伙伴在未知世界冒险'}\n请设计 ${n} 个角色，每人：name（2-4字中文名）、persona（一句话人设：身份/性格/目标，40字内）。输出 JSON 数组：[{"name":"","persona":""}]` },
      ], { stream: false, temperature: 0.9, reasoningEffort: 'none', jsonMode: true, sessionId: S.sid, onUsage: (u) => gameTrackUsage(engine, provider, model, u) })
      // ★ 容错解析：先直解，失败则从文本中抠出 JSON 数组（部分模型会带说明文字或代码围栏）
      const raw = String(text || '')
      let arr = null
      try { arr = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()) } catch { /* fallthrough */ }
      if (!Array.isArray(arr)) { const m = /\[[\s\S]*\]/.exec(raw); if (m) { try { arr = JSON.parse(m[0]) } catch { /* ignore */ } } }
      if (Array.isArray(arr) && arr.length) arr.slice(0, n).forEach((c, i) => { const p = S.players[i]; if (p) { p.name = String(c.name || p.name).slice(0, 8); p.persona = String(c.persona || '').slice(0, 80) } })
      else gameEmit(engine, { type: 'game-system', text: '（角色阵容自动生成失败，暂用座位号占位；可结束对局后重新开局）' })
    } catch (e) {
      gameEmit(engine, { type: 'game-system', text: `（角色阵容自动生成失败：${String(e?.message || e).slice(0, 160)}；暂用座位号占位）` })
    }
  }
}
async function rpIntro(engine) {
  const S = engine.state
  S.day = 1
  S.phase = 'rp_intro'; S.phaseName = '序幕'
  gameEmit(engine, { type: 'game-phase', day: S.day, phase: S.phase, name: S.phaseName })
  const cast = S.players.map((p) => `${p.name}：${p.persona || '（无设定）'}`).join('\n')
  gameSystem(engine, `角色阵容：\n${cast}`)
  // ★ 用户当 GM：等用户写开场；否则 AI GM 开场
  if (S.config.myRole === 'judge') {
    S.waiting = null
    const val = await awaitUser(engine, { type: 'gm-input', forJudge: true, prompt: '你是主持（GM）。请写开场描述，推进故事（将广播给所有角色）。', seat: null, deadlineSec: 0 })
    const text = String(val?.text || '').trim()
    if (text) gameSay(engine, 'public', '主持', text, { gm: true })
  } else {
    const { text } = await gameAsk(engine, 0, rpGmSystem(engine), `故事设定：${S.config.premise || '（自由发挥）'}\n角色：\n${cast}\n请以主持身份写一段开场（≤300字）：交代场景、氛围与当前处境，并给每个角色一个入场的契机。`)
    if (text) gameSay(engine, 'public', '主持', text, { gm: true })
  }
}
function rpGmSystem(engine) {
  return `你是角色扮演推演的主持（GM/导演）。职责：描述场景与氛围、推进剧情、裁定玩家行动的后果、制造合理冲突与转折；不替角色发言，不做角色的决定。禁止出戏。每次描述不超过300字。`
}
function rpCharSystem(engine, seat) {
  const S = engine.state
  const p = playerBySeat(S, seat)
  // ★ 表演经验（同会话跨对局累积）
  const exp = S.experience?.players?.[seat] || []
  const expTxt = exp.slice(-4).map((e) => `- ${e.text}`).join('\n')
  return [
    `你在参加一场多人角色扮演推演。你扮演的角色是「${p.name}」。`,
    `人物设定：${p.persona || '（暂无，请自行补充合理设定）'}`,
    S.config.premise ? `故事背景：${S.config.premise}` : '',
    expTxt ? `你的表演经验（参考这些经验提升演出质量）：\n${expTxt}` : '',
    '规则：只以你的角色身份行动与说话，不替别人行动；信息限于你亲历或被告知的内容，禁止全知视角；不写旁白式心理总结，用对白与行动推动；禁止提及AI/模型/提示词等超游内容；每次发言1~3句、不超过120字。',
  ].filter(Boolean).join('\n')
}
async function rpRound(engine) {
  const S = engine.state
  S.day++
  S.phase = `rp_scene_${S.day}`; S.phaseName = `第${S.day}幕`
  gameEmit(engine, { type: 'game-phase', day: S.day, phase: S.phase, name: S.phaseName })
  for (const p of S.players) {
    if (engine.abort) return
    if (p.kind === 'user') {
      const val = await awaitUser(engine, { type: 'speak', seat: p.seat, prompt: `第${S.day}幕：轮到你（${p.name}）行动/发言。`, deadlineSec: 0 })
      const text = String(val?.text || '').trim()
      if (text) gameSay(engine, 'public', p.name, text, { seat: p.seat })
    } else {
      try {
        const situation = `第${S.day}幕。最近的场景与对话：\n${gamePublicBrief(engine, 24)}\n请以「${p.name}」的身份推进：说1~3句台词或描述一个行动。`
        // ★ 扮演模式必须用角色卡提示词（不能用狼人杀身份提示词，否则会串戏）
        const { text } = await gameAsk(engine, p.seat, rpCharSystem(engine, p.seat), situation)
        if (text) gameSay(engine, 'public', p.name, text, { seat: p.seat })
      } catch (err) { gameSystem(engine, `（${p.name} 的行动失败：${String(err?.message || err).slice(0, 80)}）`) }
    }
  }
  // 幕间：GM 总结与推进（用户当 GM 时等用户；AI GM 自动）
  if (S.config.myRole === 'judge') {
    const val = await awaitUser(engine, { type: 'gm-input', forJudge: true, prompt: '你是主持（GM）。请总结本幕并推进下一幕（或直接结束对局）。', deadlineSec: 0 })
    const text = String(val?.text || '').trim()
    if (text) gameSay(engine, 'public', '主持', text, { gm: true })
  } else {
    try {
      const { text } = await gameAsk(engine, 0, rpGmSystem(engine), `本幕进展：\n${gamePublicBrief(engine, 20)}\n请以主持身份小结本幕，并推进一个新事件或转折（≤200字）。`)
      if (text) gameSay(engine, 'public', '主持', text, { gm: true })
    } catch { /* ignore */ }
  }
}

/* ───────────────────────── 对局驱动 / 复盘 ───────────────────────── */
async function gameLoop(engine) {
  const S = engine.state
  try {
    S.status = 'running'
    gameEmit(engine, { type: 'game-status', status: 'running' })
    if (S.mode === 'roleplay') {
      await rpCast(engine)
      await rpIntro(engine)
      while (!engine.abort && !S.result) await rpRound(engine)
      if (!S.result) S.result = { winner: 'none', text: '推演结束。' }
    } else {
      while (!engine.abort && !S.result) { await gameGate(engine); if (engine.abort) break; await wwOneDay(engine) }
      if (!S.result) S.result = { winner: 'none', text: '对局已结束。' }
    }
  } catch (e) {
    // ★ 用户主动结束（stop）时中途抛出的中断错误，不算异常
    if (engine.abort) {
      S.result = S.result || { winner: 'none', text: '对局已由用户结束。' }
    } else {
      gameEmit(engine, { type: 'game-error', error: String(e?.message || e).slice(0, 300) })
      S.result = S.result || { winner: 'none', text: '对局异常结束：' + String(e?.message || e).slice(0, 120) }
    }
  } finally {
    // ★ 已被「重新开局」替换的旧引擎：不写盘、不广播（防止覆盖新对局状态）
    if (engine.replaced) { try { engine.listeners.clear() } catch { /* ignore */ } return }
    S.status = 'finished'
    try { await gameReview(engine) } catch { /* ignore */ }
    gameEmit(engine, { type: 'game-end', result: S.result, review: S.review })
    // ★ 赛后经验总结（先广播结束、再后台总结，避免延迟复盘展示；重新游戏会等待它写完）
    if (S.day > 0) { engine.summaryPromise = gameSummarizeExperience(engine); try { await engine.summaryPromise } catch { /* ignore */ } }
    await gameSave(S)
    gameNotify(engine)
  }
}
// ★ 复盘报告：身份表 / 夜间行动 / 票型 / 关键节点
async function gameReview(engine) {
  const S = engine.state
  const lines = []
  lines.push(`# 对局复盘 · ${S.title || S.sid}`)
  lines.push(`- 模式：${S.mode === 'werewolf' ? `狼人杀（${WW_BOARDS[S.board]?.name || S.board}）` : '角色扮演推演'} ｜ 历时 ${Math.round((Date.now() - S.createdAt) / 60000)} 分钟 ｜ 花费 ¥${S.cost.toFixed(2)}`)
  if (S.result) lines.push(`- 结果：${S.result.text}`)
  if (S.mode === 'werewolf') {
    lines.push('', '## 身份表')
    lines.push('| 座位 | 玩家 | 身份 | 结局 |')
    lines.push('|---|---|---|---|')
    for (const p of S.players) lines.push(`| ${p.seat} | ${p.name} | ${WW_ROLES[p.role]?.label || p.role} | ${p.alive ? '存活' : `出局（${p.cause === 'wolf' ? '被刀' : p.cause === 'poison' ? '被毒' : p.cause === 'vote' ? '被放逐' : p.cause === 'shoot' ? '被枪' : '出局'}）`} |`)
    lines.push('', '## 关键节点')
    for (const m of (S.channels.public || []).filter((x) => x.system)) lines.push(`- ${m.text}`)
    if (S.votes.history.length) {
      lines.push('', '## 票型记录')
      for (const v of S.votes.history) lines.push(`- 第${v.day}天 第${v.round}轮：${Object.entries(v.ballots).map(([s, t]) => `${seatName(S, Number(s))}→${t ? seatName(S, Number(t)) : '弃票'}`).join('，')}`)
    }
  } else {
    lines.push('', '## 角色阵容')
    for (const p of S.players) lines.push(`- ${p.name}：${p.persona || '（无设定）'}`)
    lines.push('', '## 关键节点')
    for (const m of (S.channels.public || []).filter((x) => x.gm || x.system)) lines.push(`- ${String(m.text).slice(0, 120)}`)
  }
  S.review = lines.join('\n')
  try { await mkdir(gameDir(S.sid), { recursive: true }); await writeFile(path.join(gameDir(S.sid), 'review.md'), S.review, 'utf8') } catch { /* ignore */ }
}
// ★ 赛后经验总结：每个 AI 玩家自总结一条经验（按座位累积，重新游戏后继承）
async function gameSummarizeExperience(engine) {
  const S = engine.state
  if (!(S.day > 0)) return // 未真正开局（空跑/秒退）不总结
  const exp = S.experience || { games: 0, players: {} }
  exp.games = (exp.games || 0) + 1
  const resultTxt = S.result?.text || '对局结束'
  for (const p of S.players) {
    if (p.kind !== 'ai') continue
    try {
      const { provider, model } = gameProviderModel(engine, p.seat)
      if (!provider || !model) continue
      const role = WW_ROLES[p.role]?.label || p.role || (S.mode === 'roleplay' ? '角色' : '')
      const notes = (p.notes || []).slice(-5).join('；')
      const sys = S.mode === 'roleplay'
        ? '你刚参加完一场角色扮演推演。只输出一句话经验总结（≤60字，第一人称，具体可操作：如何更好地扮演/推进剧情/避免出戏），不要泛泛而谈。'
        : '你在玩中文狼人杀，正在赛后复盘积累经验。只输出一句话经验总结（≤60字，第一人称，具体可操作：如发言/站边/验人/刀法/票型分析的改进点），不要泛泛而谈。'
      const usr = `你是「${p.name}」，本局身份【${role}】${S.mode === 'werewolf' ? `，所属${p.team === 'wolf' ? '狼人' : '好人'}阵营` : ''}，结果：${resultTxt}。${notes ? '你的私密笔记：' + notes + '。' : ''}请总结本局经验（60字内）。`
      const text = await chatComplete(provider, model, [
        { role: 'system', content: sys },
        { role: 'user', content: usr },
      ], { stream: false, temperature: 0.7, reasoningEffort: 'none', sessionId: S.sid, onUsage: (u) => gameTrackUsage(engine, provider, model, u) })
      const line = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 100)
      if (line) {
        const arr = (exp.players[p.seat] ||= [])
        arr.push({ g: exp.games, role, text: line })
        if (arr.length > 10) arr.splice(0, arr.length - 10)
      }
    } catch { /* 单个玩家总结失败不影响其他 */ }
  }
  S.experience = exp
  try { await mkdir(gameDir(S.sid), { recursive: true }); await writeFile(gameExpFile(S.sid), JSON.stringify(exp, null, 2), 'utf8') } catch { /* ignore */ }
  gameEmit(engine, { type: 'game-experience', games: exp.games })
}
// ★ 开始对局（从会话配置创建引擎并后台运行）
async function startGameSession(sess) {
  const old = gameEngines.get(sess.id)
  if (old) {
    // ★ 重新开局：终止旧引擎并标记 replaced（旧引擎收尾不再写盘/广播，避免覆盖新对局）
    old.abort = true; old.paused = false; old.replaced = true
    if (old.state.waiting) { try { engineSubmitAction(old, { auto: true }) } catch { /* ignore */ } }
    try { gameNotify(old) } catch { /* ignore */ }
  }
  // ★ 等待上一局的"经验总结"写完，再读取经验档案（避免重新游戏时漏掉最新经验）
  if (old?.summaryPromise) { try { await old.summaryPromise } catch { /* ignore */ } }
  const state = makeGameState(sess)
  state.experience = await gameLoadExperience(sess.id)
  const engine = {
    state, listeners: new Set(), buffer: [], waiters: [], waitSeq: 0,
    paused: false, pausedReason: '', abort: false, pendingResolve: null,
    saveSoon: null,
  }
  engine.saveSoon = () => {
    clearTimeout(engine._sv)
    engine._sv = setTimeout(() => { gameSave(engine.state).catch(() => {}) }, 800)
  }
  engine.submitAction = (a) => engineSubmitAction(engine, a)
  gameEngines.set(sess.id, engine)
  // ★ 用户座位：player 模式随机分配一个座位
  const S = engine.state
  if (S.config.myRole === 'player') {
    const seat = Math.floor(Math.random() * S.players.length) + 1
    S.userSeat = seat
    const p = playerBySeat(S, seat)
    p.kind = 'user'; p.name = S.config.userName || '你'
  }
  // ★ 狼人杀身份分配（洗牌）
  if (S.mode === 'werewolf') {
    const rolesPool = [...WW_BOARDS[S.board].roles]
    for (let i = rolesPool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rolesPool[i], rolesPool[j]] = [rolesPool[j], rolesPool[i]] }
    const personas = [...WW_PERSONAS].sort(() => Math.random() - 0.5)
    S.players.forEach((p, i) => { p.role = rolesPool[i]; p.team = WW_ROLES[rolesPool[i]]?.team || 'good'; if (p.kind === 'ai') p.persona = personas[i % personas.length] })
  }
  gameSave(S)
  gameEmit(engine, { type: 'game-status', status: 'running' })
  // ★ 经验继承提示：重新游戏时 AI 带上历史经验（越玩越有判断力）
  if (S.experience?.games > 0) gameSystem(engine, `【经验继承】AI 玩家已加载此前 ${S.experience.games} 局经验，本局为第 ${S.experience.games + 1} 局。`)
  gameLoop(engine).catch(() => { /* gameLoop 内部已兜底 */ })
  return engine
}
// ★ 路由辅助：取引擎或从磁盘重建只读视图
async function gameEngineOrState(sid) { return gameEngines.get(sid) || null }

/* ═══════════════════════════════════════════════════════════════
 * 十四、启动
 * ═══════════════════════════════════════════════════════════════ */
const server = http.createServer(async (req, res) => {
  // ★ 安全审计修复：客户端中途断开/上传中被销毁会产生流错误，统一兜底避免未处理错误
  req.on('error', () => { /* client abort */ })
  res.on('error', () => { /* client abort */ })
  const url = new URL(req.url, `http://${req.headers.host || HOST}`)
  if (req.method !== 'GET') currentOrigin = String(req.headers['x-oat-client'] || '').slice(0, 64)
  try { if (url.pathname.startsWith('/api/')) await handleApi(req, res, url); else await serveStatic(res, url.pathname) }
  catch (e) { dbg('server.error', { message: String(e?.message || e) }); sendJson(res, e?.statusCode || 500, { ok: false, error: String(e?.message || e) }) }
  finally { if (req.method !== 'GET') currentOrigin = '' }
})
await loadData()
startScheduleTicker() // ★ 定时任务/心跳：每 30 秒检查一次到期任务
// ★ TAT：监听地址——「手机连接」开启局域网监听时绑 0.0.0.0（所有网卡），否则仅本机
const bindHost = process.env.HOST || (settings.lanListen ? '0.0.0.0' : '127.0.0.1')
listenAll = bindHost === '0.0.0.0'
server.listen(PORT, bindHost, () => {
  const addr = `http://127.0.0.1:${PORT}`
  console.log(`★ Open Agent Team 已启动：${addr}`)
  console.log(`★ 监听：${bindHost}:${PORT}${settings.lanListen ? '（局域网已开放，手机可连接）' : '（仅本机；可在设置→手机连接中开启局域网监听）'}`)
  console.log(`★ 数据目录：${DATA_DIR}　工作区：${getActiveRoot()}`)
  if (process.platform === 'win32' && process.env.NO_OPEN !== '1') spawn('cmd', ['/c', 'start', '', addr], { detached: true, stdio: 'ignore' }).unref()
})
