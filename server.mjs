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
import { readFile, writeFile, mkdir, readdir, rm, copyFile, cp, stat } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import crypto from 'node:crypto'
import { spawn, exec as execCb } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(execCb)

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
const DATA_DIR = path.join(__dirname, 'data')
const WEB_DIR = path.join(__dirname, 'web')
const WORKSPACE_DIR = path.join(__dirname, 'workspace')
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
const PORT = Number(process.env.PORT || 3410)
const HOST = process.env.HOST || '127.0.0.1'

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
  dashscope: { label: '阿里云百炼（通义千问/万相）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-plus', 'qwen-vl-max', 'wanx2.1-t2i-turbo'], capabilities: ['对话', '视觉', '出图'], balance: 'probe', needsKey: true },
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
let settings = { developerMode: false, exeEnabled: false, exeAllowlist: [], githubLogin: '', workspaces: [], activeWorkspace: '', language: '', taskBudgetCost: 0, chatTools: true, defaultPermission: 'modify', reasoningEffort: 'low', artProvider: '', artModel: '', videoProvider: '', videoModel: '', updateRepo: 'AceTaffer/Open-Agent-Team', updateBranch: 'main', ui: { theme: 'dark', accent: '#2f9e8f', fontSize: 13, spacing: 'normal', teamInputPos: 'bottom' } }

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
  { id: 'mk_pixel_asset', name: '游戏像素素材规范', description: '三视图→动作帧→PNG 标准化流程', tags: ['游戏', '美术'], prompt: '制作游戏素材时严格遵守：1) 先确认角色/场景设定，角色需产出正面/侧面/背面三视图；2) 依据三视图逐动作生成帧素材：待机、向左走、向右走、起跳、下落、下蹲、攻击、受击；3) 所有素材必须是 PNG（用 generate_image 生成，自动为 PNG）；4) 文件命名规范：角色ID_动作_序号.png（如 qianxia_run_01.png），场景命名：场景_分层_序号.png；5) 生成后用 list_files 核对文件确实存在，再汇总路径清单交给程序。' },
  { id: 'mk_game_qa', name: '游戏测试清单', description: '操作/碰撞/边界/性能全项验证', tags: ['游戏', '质量'], prompt: '测试游戏时按清单逐项真实验证并记录结果：1) 启动与加载无报错（浏览器控制台）；2) 键盘/鼠标操作响应正确；3) 移动、跳跃、碰撞、得分、胜负等核心机制；4) 边界情况：卡墙、出界、连续输入、暂停恢复；5) 素材加载：所有引用的 PNG 是否存在且能显示；6) 性能：帧率与内存无明显异常。发现问题要给出复现步骤与期望/实际结果，修复后必须回归重测。' },
  { id: 'mk_asset_org', name: '素材归档与命名', description: 'assets 目录结构与索引清单', tags: ['游戏', '流程'], prompt: '整理素材时：1) 统一放入工作区 assets/ 目录，按角色/场景/UI 分子目录；2) 文件名只使用小写字母、数字、下划线；3) 生成 assets/README.md 或 manifest.json 索引：文件名→用途→来源/生成提示词；4) 引用素材的代码必须使用清单中的路径，禁止出现找不到的文件。' },
  { id: 'mk_video_storyboard', name: '视频分镜脚本规范', description: '脚本→分镜表→逐镜生成', tags: ['视频', '策划'], prompt: '制作视频时按分镜流程：1) 先出脚本（旁白/字幕/时长）；2) 拆成分镜表：镜号、画面描述（英文提示词可直接用于 generate_video）、时长、转场、音效建议；3) 每个分镜单独调用 generate_video 生成 MP4（name 建议 shot01、shot02…），必要时用 generate_image 出关键帧；4) 全部生成后用 list_files 核对文件，输出成片清单（文件→分镜内容→时长）交测试质检。' },
  { id: 'mk_file_organize', name: '文件整理规范', description: '分类归档+去重+命名+清单', tags: ['效率', '流程'], prompt: '整理文件时：1) 动手前先完整列出目标目录清单（list_files），识别类型/重复/命名混乱项；2) 制定整理规则（分类维度、命名规范、保留策略）并先向用户确认；3) 操作使用"复制到新目录 + 生成清单"的非破坏性方式，删除/移动类危险操作必须先备份并征得用户确认；4) 完成后输出整理报告：每类文件数量、去处、重命名映射表、遗留问题。' },
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
  statsTimer = setTimeout(() => { writeFile(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8').catch(() => {}) }, 1200)
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
  await loadJsPlugins()
}
const saveProviders = () => writeFile(PROVIDERS_FILE, JSON.stringify(providers, null, 2), 'utf8')
const saveRoles = () => writeFile(ROLES_FILE, JSON.stringify(roles, null, 2), 'utf8')
const saveSkills = () => writeFile(SKILLS_FILE, JSON.stringify(skills, null, 2), 'utf8')
const saveSessions = () => writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8')
const savePlugins = () => writeFile(PLUGINS_FILE, JSON.stringify(plugins, null, 2), 'utf8')
const saveSettings = () => writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8')

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
{"tool":"ask_role","role":"角色id（如 planner/coder）","question":"想与对方商量/确认的问题"}
\`\`\`
\`\`\`tool
{"tool":"ask_user","questions":[{"question":"想请用户确认的问题","options":["选项A","选项B"]}]}
\`\`\`
（ask_user 会暂停任务等待用户回答，用户答复会作为工具结果返回；需求不明确时应主动提问）
\`\`\`tool
{"tool":"generate_image","prompt":"英文出图提示词","name":"可选英文文件名（PNG，自动保存到工作区 artifacts/）"}
\`\`\`
\`\`\`tool
{"tool":"generate_video","prompt":"英文视频提示词","name":"可选英文文件名（MP4，自动保存到工作区 artifacts/）"}
\`\`\`
工具在沙箱 workspace/ 内执行（联网工具除外），结果下一轮以【工具结果】发给你。`
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
  return [base, skillTextFor(role), BASE_TOOL_PROTOCOL + pluginToolDoc() + vaultToolDoc() + jsToolDoc()].filter(Boolean).join('\n\n')
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
const BLOCKED_CMD = [/\bformat\b/i, /\bshutdown\b/i, /\brestart-computer\b/i, /rmdir\s+\/s/i, /del\s+\/f\s+\/s/i, /\bdiskpart\b/i, /\breg\s+delete\b/i, /\bnet\s+user\b/i, /\bmkfs\b/i, /\bdd\s+if=/i]
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
    const { stdout, stderr } = await execAsync(`"${norm}" ${(Array.isArray(args) ? args : []).map((a) => `"${a}"`).join(' ')}`, { cwd: workdir, timeout: Math.min(Number(timeoutMs) || 120000, 300000), maxBuffer: 4 * 1024 * 1024, windowsHide: true })
    dbg('exe.run', { path: norm, args })
    return `$ ${path.basename(norm)} ${(args || []).join(' ')}\n${(stdout || '') + (stderr ? '\n[stderr]\n' + stderr : '')}`.slice(0, 8000) || '（无输出）'
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
      const { stdout, stderr } = await execAsync(cmd, { cwd: root, timeout: Math.min(Number(call.timeoutMs) || 30000, 120000), maxBuffer: 4 * 1024 * 1024, windowsHide: true })
      return (`$ ${cmd}\n${stdout || ''}${stderr ? '\n[stderr]\n' + stderr : ''}`).slice(0, 8000) || `$ ${cmd}\n(无输出)`
    }
    if (call.tool === 'web_search') return await toolWebSearch(call)
    if (call.tool === 'web_fetch') return await toolWebFetch(call)
    if (call.tool === 'http_call') return await toolHttpCall(call)
    if (call.tool === 'vault_call') return await toolVaultCall(call)
    if (call.tool === 'run_exe') return await toolRunExe(call)
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
const READ_TOOLS = new Set(['read_file', 'list_files', 'web_search', 'web_fetch'])
const WRITE_TOOLS = new Set(['write_file'])
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
      ...roleChatHistory(role.id, 8),
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
  const perm = PERMISSIONS.includes(ctx.permission) ? ctx.permission : 'modify'
  const cat = toolCategory(call)
  const chk = permissionCheck(perm, cat)
  if (!chk.allow) return `⛔ ${chk.reason}`
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
  // ★ 视频：生成后落盘 artifacts（MP4），供 AI 与用户使用
  if (call.tool === 'generate_video') {
    const target = resolveVideoTarget(call)
    if (!target) return '未找到可用的视频模型：请先在「视频」页选择视频模型（会自动记住），或在调用里指定 providerId/model。'
    const prompt = String(call.prompt || '').trim()
    if (!prompt) return '缺少 prompt（视频提示词）。'
    try {
      ctx.onImage?.({ phase: 'start', kind: 'video', prompt, name: call.name || '' })
      const urls = await generateVideo(target.provider, target.model, prompt, call.name)
      await recordArt(urls, { prompt, model: target.model, provider: target.provider.name, providerId: target.provider.id, role: ctx.agentId || 'chat', kind: 'video' })
      ctx.onImage?.({ phase: 'done', kind: 'video', prompt, ok: true })
      return `已生成视频（MP4，保存在当前工作区 artifacts/，可用相对路径引用）：\n${urls.join('\n')}`
    } catch (e) {
      ctx.onImage?.({ phase: 'done', kind: 'video', prompt, ok: false })
      return `视频生成失败：${e.message}`
    }
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
        const auto = ctx.autoState?.approvedAll || ctx.session?.autoApprove
        if (auto || typeof ctx.onImageReview !== 'function') return `已生成图片（PNG，保存在当前工作区 artifacts/，可用相对路径引用）：\n${urls.join('\n')}`
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
  return await runTool(call, { root: ctx.root, allowOutside })
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
async function readBody(req) { const cs = []; for await (const c of req) cs.push(c); if (!cs.length) return {}; try { return JSON.parse(Buffer.concat(cs).toString('utf8')) } catch { return {} } }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' }
async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  const file = path.join(WEB_DIR, rel)
  if (!file.startsWith(WEB_DIR) || !existsSync(file)) { res.writeHead(404); res.end('Not Found'); return }
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
function roleChatHistory(roleId, max = 12) { return (roleChats[roleId] || []).slice(-max).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 3000) })) }
function roleChatAppend(roleId, role, content) {
  if (!roleId || !content || !String(content).trim()) return
  const arr = roleChats[roleId] || (roleChats[roleId] = [])
  arr.push({ role, content: String(content).slice(0, 4000), t: Date.now() })
  while (arr.length > 60) arr.shift()
  saveRoleChats()
}

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
  const model = call.model || (provider.id === settings.videoProvider ? settings.videoModel : '') || models[0]?.id
  return model ? { provider, model } : null
}
async function generateVideo(provider, model, prompt, name) {
  const base = provider.baseUrl || ''
  const key = await getSecret(provider.id)
  const headers = { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }
  if (!base.includes('dashscope')) throw new Error('当前仅支持阿里云百炼（dashscope）的视频模型')
  const root = base.replace(/\/compatible-mode\/v1\/?$/, '')
  const r = await fetch(joinUrl(root, 'api/v1/services/aigc/video-generation/video-synthesis'), {
    method: 'POST', headers: { ...headers, 'X-DashScope-Async': 'enable' },
    body: JSON.stringify({ model, input: { prompt }, parameters: { size: '1280*720' } }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || j?.code) throw new Error(`视频生成失败：${j?.message || `HTTP ${r.status}`}`)
  const taskId = j?.output?.task_id
  for (let i = 0; i < 200; i++) {
    await new Promise((s) => setTimeout(s, 3000))
    const qj = await (await fetch(joinUrl(root, `api/v1/tasks/${taskId}`), { headers: { Authorization: `Bearer ${key}` } })).json().catch(() => null)
    const st = qj?.output?.task_status
    if (st === 'SUCCEEDED') {
      const url = qj?.output?.video_url || (qj?.output?.results || [])[0]?.url
      if (!url) throw new Error('未返回视频地址')
      const fname = `${String(name || '').replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 40) || `video-${Date.now()}`}.mp4`
      const rr = await fetch(url)
      if (!rr.ok) throw new Error(`下载视频失败 HTTP ${rr.status}`)
      await writeFile(path.join(getArtifactDir(), fname), Buffer.from(await rr.arrayBuffer()))
      return [`/api/artifact?path=${encodeURIComponent('artifacts/' + fname)}`]
    }
    if (st === 'FAILED') throw new Error(`视频任务失败：${qj?.output?.message || '未知'}`)
  }
  throw new Error('视频生成超时')
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
  const root = sess?.workspace && existsSync(sess.workspace) ? sess.workspace : getActiveRoot()
  const permission = sess?.permission || settings.defaultPermission || 'modify'
  const autoState = { approvedAll: false }
  send({ type: 'session', taskId })
  // ★ 任务索引：先登记 running 状态（支持并发运行多个任务）
  const idxFile = path.join(TASKS_DIR, 'index.json')
  const readTaskIndex = async () => { try { return existsSync(idxFile) ? JSON.parse(await readFile(idxFile, 'utf8')) : [] } catch { return [] } }
  const writeTaskIndex = async (list) => { await writeFile(idxFile, JSON.stringify(list.slice(0, 200), null, 2), 'utf8') }
  await writeTaskIndex([{ id: taskId, task, summary: '', steps: 0, startedAt, status: 'running' }, ...(await readTaskIndex()).filter((x) => x.id !== taskId)])
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
      const entry = { id: taskId, task, summary: message, steps: 0, startedAt, finishedAt: Date.now(), status: 'failed', cost: Number(totalCost.toFixed(6)), tokens: totalUsage.prompt_tokens + totalUsage.completion_tokens, cacheHitTokens: totalUsage.prompt_cache_hit_tokens, toolCalls: taskToolCalls }
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
      leaderText = await chatComplete(leader.provider, leader.model, leaderMsgs, { stream: true, temperature: 0.4, reasoningEffort: leaderEmptyRetried ? 'none' : undefined, onDelta: (d) => send({ type: 'delta', agent: 'leader', text: d }), onReasoning: (r) => send({ type: 'reasoning', agent: 'leader', text: r }), onUsage: trackUsage('leader', leader.provider, leader.model) })
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

  // 2. 依次执行角色（所有角色都允许工具，最多 5 轮）
  const results = []
  let reworkAdded = false
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
    const messages = [
      { role: 'system', content: roleSystemPrompt(agent.role) },
      { role: 'user', content: `总任务：${task}\n（当前工作区目录：${root}）\n\n本步骤（${step.title}）：${step.instruction}\n\n此前产出：\n${contextText || '（无）'}` },
    ]
    let stepText = '', turn = 0, emptyRetried = false
    try {
      while (turn < 5) {
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
        const effortOverride = emptyRetried ? 'none' : undefined
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
        for (const call of calls) {
          if (!(await gate(roleId))) break
          // ★ 角色独立权限：该角色单独设置了权限则覆盖会话权限
          const rolePerm = PERMISSIONS.includes(agent.role.permission) ? agent.role.permission : permission
          const result = await runToolGuarded(call, {
            root, permission: rolePerm, session: sess, autoState, task, run, agentId: roleId,
            reportUsage: (a, p, m, u) => trackUsage(a, p, m)(u),
            onConfirm: (c) => send({ type: 'confirm', agent: roleId, confirm: c }),
            onImage: (info) => send({ type: 'image', agent: roleId, ...info }),
            onImageReview: (r) => send({ type: 'imagereview', agent: roleId, ...r }),
            onQuestion: (q) => send({ type: 'question', ...q }),
            onAsk: (info) => send({ type: 'ask', ...info }),
            onAskDone: (info) => send({ type: 'ask_done', ...info }),
          })
          taskToolCalls++
          send({ type: 'tool', agent: roleId, call: call.tool, detail: call.path || call.command || call.query || call.plugin || call.url || call.path || '', result: result.slice(0, 1500) })
          toolResults.push(`【工具结果】${call.tool} ${call.path || call.command || call.query || call.plugin || call.url || ''}\n${result}`)
        }
        messages.push({ role: 'user', content: toolResults.join('\n\n') + '\n\n请根据工具结果继续（如已完成请给出最终答复，不要再调用工具）。' })
      }
      results.push({ agent: roleId, title: step.title, result: stepText })
      send({ type: 'step_done', index: i, agent: roleId, title: step.title, result: stepText })
      // ★ 测试判定不通过：自动追加一轮程序返工（只追加一次，避免无限循环）
      if (roleId === 'tester' && !reworkAdded && STEP_FAIL_RE.test(stepText) && plan.steps.length < 6) {
        const fixRole = (enabledOthers.find((r) => r.id === 'coder' || r.id === 'programmer') || enabledOthers[0])?.id
        if (fixRole) {
          reworkAdded = true
          plan.steps.push({ agent: fixRole, title: '根据测试反馈修复', instruction: `测试环节判定未通过。测试报告摘要：\n${stepText.slice(0, 2500)}\n\n请修复报告中的问题：务必用 write_file 真实写入产物文件（大文件可拆成多次写入），写完用 list_files 核对文件确实存在，再简述修复点。` })
          send({ type: 'delta', agent: 'leader', text: '\n\n（检测到测试未通过：已自动安排程序返工修复…）' })
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
      while (turn < 3) {
        if (budgetStopped || run.abort) break
        if (!(await gate('*'))) break
        turn++
        const text = await chatComplete(leader.provider, leader.model, messages, { stream: true, temperature: 0.4, onDelta: (d) => send({ type: 'delta', agent: 'leader', text: d, final: true }), onReasoning: (r) => send({ type: 'reasoning', agent: 'leader', text: r, final: true }), onUsage: trackUsage('leader', leader.provider, leader.model) })
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
            onAsk: (info) => send({ type: 'ask', ...info }),
            onAskDone: (info) => send({ type: 'ask_done', ...info }),
          })
          taskToolCalls++
          send({ type: 'tool', agent: 'leader', call: call.tool, detail: call.path || call.command || call.query || call.plugin || call.url || '', result: result.slice(0, 1500) })
          outs.push(`【工具结果】${call.tool} ${call.path || call.command || call.query || call.plugin || call.url || ''}\n${result}`)
        }
        messages.push({ role: 'user', content: outs.join('\n\n') + '\n\n请继续：如成果已产出完毕，请给出最终汇总（不要再调用工具）。' })
      }
    } catch (e) { send({ type: 'error', message: `队长汇总失败：${e.message}` }) }
  }

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
  const record = { id: taskId, task, plan, results, finalText, startedAt, finishedAt: Date.now(), usage: totalUsage, cost: Number(totalCost.toFixed(6)), roleUsage, toolCalls: taskToolCalls, cacheHitTokens: totalUsage.prompt_cache_hit_tokens, budgetStopped, aborted: run.abort }
  try {
    await writeFile(path.join(TASKS_DIR, `${taskId}.json`), JSON.stringify(record, null, 2), 'utf8')
    const entry = { id: taskId, task, summary: plan.summary, steps: plan.steps.length, startedAt, finishedAt: Date.now(), status: stoppedNow ? 'stopped' : 'done', cost: record.cost, tokens: totalUsage.prompt_tokens + totalUsage.completion_tokens, cacheHitTokens: totalUsage.prompt_cache_hit_tokens, toolCalls: taskToolCalls }
    await writeTaskIndex([entry, ...(await readTaskIndex()).filter((x) => x.id !== taskId)])
  } catch { /* ignore */ }
  send({ type: 'done', taskId, cost: Number(totalCost.toFixed(6)), usage: totalUsage, cacheHitTokens: totalUsage.prompt_cache_hit_tokens, toolCalls: taskToolCalls, budgetStopped, aborted: run.abort })
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
    settings = { ...settings, ...b }
    await saveSettings()
    return sendJson(res, 200, { ok: true, settings })
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
    if (Array.isArray(b)) roles = b.map((r) => ({ ...r, id: r.id || crypto.randomUUID(), label: r.label || '未命名角色', color: r.color || '#888', enabled: r.enabled !== false, skills: r.skills || [], permission: (r.permission === '' || PERMISSIONS.includes(r.permission)) ? (r.permission || '') : '' }))
    else if (b && typeof b === 'object') roles = DEFAULT_ROLES.map((d) => ({ ...d, ...(b[d.id] || {}) }))
    rebuildRoleMeta(); await saveRoles()
    return sendJson(res, 200, { ok: true, roles: ROLE_META })
  }
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
      const maxTurns = toolsEnabled ? 6 : 2 // ★ 至少 2 轮：推理模型首轮可能只思考没正文，需要追问一次
      const autoState = { approvedAll: false } // ★ 本请求内「全部允许」状态
      let emptyRetried = false
      for (let turn = 0; turn < maxTurns; turn++) {
        let usage = null, cost = null, turnReasoning = ''
        const tIdx = turn
        const text = await chatComplete(provider, modelId, history, {
          stream: true, temperature: body.temperature ?? 0.7, sessionId: session?.id,
          reasoningEffort: emptyRetried ? 'none' : undefined,
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
          session.messages.push({ role: 'assistant', content: text, reasoning: turnReasoning || undefined, t: Date.now(), usage: usage || null, cost: cost || null, turn: tIdx })
          session.tokens = (session.tokens || 0) + (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0)
          session.cost = Number(((session.cost || 0) + (cost || 0)).toFixed(6))
          session.updatedAt = Date.now()
        }
        if (!toolsEnabled) break
        const calls = extractToolCalls(text)
        if (!calls.length) break
        history.push({ role: 'assistant', content: text })
        const toolResults = []
        for (const call of calls) {
          const result = await runToolGuarded(call, {
            root: chatRoot,
            permission: session?.permission || body.permission || settings.defaultPermission || 'modify',
            session, autoState, agentId: 'chat',
            onConfirm: (c) => emit({ confirm: c, turn: tIdx }),
            onImage: (info) => emit({ image: info, turn: tIdx }),
            onImageReview: (r) => emit({ imagereview: r, turn: tIdx }),
            onQuestion: (q) => emit({ question: q, turn: tIdx }),
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
    return sendJson(res, 200, { ok: true, sessions: sessions.map((s) => ({ id: s.id, kind: s.kind || 'chat', providerId: s.providerId, model: s.model, title: s.title, workspace: s.workspace, archived: !!s.archived, permission: s.permission || settings.defaultPermission || 'modify', autoApprove: !!s.autoApprove, messageCount: s.messages?.length || 0, tokens: s.tokens || 0, cost: s.cost || 0, createdAt: s.createdAt, updatedAt: s.updatedAt })) })
  }
  if (pathname === '/api/sessions' && method === 'POST') {
    const b = await readBody(req)
    const s = { id: crypto.randomUUID(), kind: b.kind === 'team' ? 'team' : 'chat', providerId: b.providerId || providers[0]?.id || '', model: b.model || '', title: b.title || '', workspace: b.workspace || getActiveRoot(), permission: PERMISSIONS.includes(b.permission) ? b.permission : (settings.defaultPermission || 'modify'), autoApprove: false, archived: false, messages: [], tokens: 0, cost: 0, createdAt: Date.now(), updatedAt: Date.now() }
    sessions.unshift(s); await saveSessions()
    return sendJson(res, 200, { ok: true, session: s })
  }
  const mss = pathname.match(/^\/api\/sessions\/([^/]+)$/)
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
      s.updatedAt = Date.now(); await saveSessions()
      return sendJson(res, 200, { ok: true, session: s })
    }
    if (method === 'DELETE') { sessions = sessions.filter((x) => x.id !== s.id); await saveSessions(); return sendJson(res, 200, { ok: true }) }
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
      // ★ 断线（刷新/断网）：宽限 4 秒无重连则自动暂停，等待用户回来决定是否继续
      setTimeout(() => {
        if (!run.finished && run.listeners.size === 0 && !run.paused) {
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
    const run = teamRuns.get(url.searchParams.get('taskId') || '')
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const write = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`) } catch { /* ignore */ } }
    if (!run) { write({ type: 'error', message: '任务不存在或已结束' }); write({ type: 'done', taskId: '', aborted: false }) ; res.end(); return }
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
    try {
      // ★ 单角色对话也支持工具（含 ask_role 联系队友、读写工作区等）：多轮工具循环
      const root = getActiveRoot()
      const autoState = { approvedAll: false }
      const userMsg = `【与用户的单独对话】${String(b.message || '').slice(0, 4000)}\n你可以调用工具（如用 ask_role 询问其他队友、读写工作区文件等）。请以你的角色身份直接回复用户（简洁、专业）。`
      const messages = [
        { role: 'system', content: roleSystemPrompt(role) },
        ...roleChatHistory(role.id, 12), // ★ 角色自己的对话记忆（含队友协作询问的记录）
        { role: 'user', content: userMsg },
      ]
      // ★ 权限：优先用该角色自己的权限设置，未设置则跟随全局默认
      const rolePerm = PERMISSIONS.includes(role.permission) ? role.permission : (settings.defaultPermission || 'modify')
      let lastText = ''
      for (let turn = 0; turn < 6; turn++) {
        const text = await chatComplete(target.provider, target.model, messages, {
          stream: true, temperature: 0.5,
          onDelta: (d) => emit({ delta: d, turn }),
          onReasoning: (r) => emit({ reasoning: r, turn }),
          onUsage: (u) => { const cost = calcCost(getPrice(target.provider, target.model), u); statsAdd({ role: role.id, model: target.model, usage: u, cost: cost || 0 }); emit({ usage: u, cost, turn }) },
        })
        if (!text.trim()) break
        lastText = text
        const calls = extractToolCalls(text)
        if (!calls.length) break
        messages.push({ role: 'assistant', content: text })
        const outs = []
        for (const call of calls) {
          const result = await runToolGuarded(call, {
            root, permission: rolePerm, session: null, autoState, agentId: role.id, task: '',
            reportUsage: (a, p, m, u) => { const cost = calcCost(getPrice(p, m), u); statsAdd({ role: a, model: m, usage: u, cost: cost || 0 }) },
            onConfirm: (c) => emit({ confirm: c }),
            onImage: (info) => emit({ image: info }),
            onQuestion: (q) => emit({ question: q }),
            onAsk: (info) => emit({ ask: info }),
            onAskDone: (info) => emit({ ask_done: info }),
          })
          emit({ tool: call.tool, detail: call.path || call.command || call.query || call.plugin || call.url || '', result: result.slice(0, 3000) })
          outs.push(`【工具结果】${call.tool} ${call.path || call.command || call.query || call.plugin || call.url || ''}\n${result}`)
        }
        messages.push({ role: 'user', content: outs.join('\n\n') + '\n\n请根据工具结果继续；如已完成请给出最终答复（不要再调用工具）。' })
      }
      // ★ 对话留痕：角色下次（无论用户直聊还是队友提问）都能回忆
      roleChatAppend(role.id, 'user', String(b.message || '').slice(0, 4000))
      if (lastText.trim()) roleChatAppend(role.id, 'assistant', lastText)
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
    const b = await readBody(req)
    const it = vault.find((x) => x.id === b.id)
    if (!it) return sendJson(res, 200, { ok: false, error: '记录不存在' })
    const pass = await getVaultPass()
    if (pass) {
      const salt = pass.salt || ''
      if (vaultHash(b.password || '', salt) !== pass.hash) return sendJson(res, 200, { ok: false, error: '密码不正确' })
    }
    const kb = await vaultGetKey()
    return sendJson(res, 200, { ok: true, key: decryptText(it.keyCipher, kb) || '' })
  }
  // ★ 忘记/从未设置密码时清除保护（本地工具定位：仅解除查看门槛，数据仍为本机加密存储）
  if (pathname === '/api/vault/password/reset' && method === 'POST') {
    try { await rm(VAULT_PASS_FILE, { force: true }) } catch { /* ignore */ }
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
      // 延迟自动重启服务（脱离当前进程，避免端口占用）
      try {
        spawn('cmd.exe', ['/c', `timeout /t 2 /nobreak >nul & "${process.execPath}" server.mjs`], { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true }).unref()
        setTimeout(() => process.exit(0), 800)
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
  res.writeHead(404); res.end('Not Found')
}

/* ═══════════════════════════════════════════════════════════════
 * 十四、启动
 * ═══════════════════════════════════════════════════════════════ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`)
  try { if (url.pathname.startsWith('/api/')) await handleApi(req, res, url); else await serveStatic(res, url.pathname) }
  catch (e) { dbg('server.error', { message: String(e?.message || e) }); sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
})
await loadData()
server.listen(PORT, HOST, () => {
  const addr = `http://${HOST}:${PORT}`
  console.log(`★ Open Agent Team 已启动：${addr}`)
  console.log(`★ 数据目录：${DATA_DIR}　工作区：${getActiveRoot()}`)
  if (process.platform === 'win32' && process.env.NO_OPEN !== '1') spawn('cmd', ['/c', 'start', '', addr], { detached: true, stdio: 'ignore' }).unref()
})
