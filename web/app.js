/**
 * Open Agent Team · 前端逻辑（P5）
 * 会话系统（按 API 分组、可折叠/重命名/归档/删除/导出）、"/"命令面板、
 * OpenCode 订阅窗口显示、技能市场、角色预算、任务并发
 */
const $ = (id) =>document.getElementById(id)
const NON_CHAT = ['出图', '视频', '语音', '嵌入', '重排']

/* ══════════════ i18n ══════════════ */
const I18N = {
 zh: {
 subtitle: 'API 仓库 · 余额 · 多智能体团队 · 工具 · GitHub',
 tabChat: '对话', tabTeam: '团队任务', tabProviders: 'API 仓库', tabTeamConfig: '团队配置', tabPlugins: '插件', tabGithub: '项目', tabStats: '统计', tabDebug: '调试', tabRoadmap: '规划',
 openFolder: ' 打开…', refreshBalance: '刷新余额', addApi: '+ 添加 API',
 pickHint: ' 正在请求系统文件夹选择框…若没看到，请检查任务栏，或', pickManual: '点此手动输入路径',
 registeredApis: '已登记 API', teamRoles: '团队角色', configRoles: ' 配置角色与模型',
 sidebarHint: '提示：点 API 卡片展开它的会话；点「＋新建会话」开启独立对话。',
 sidebarHint2: '程序/测试角色可在工作区内写文件、跑命令；支持联网搜索、自定义 API 插件与 OAT JS 插件。',
 useApi: '使用 API：', model: '模型：', clearChat: '清空对话', chatEmpty: ' 请在左侧「新建会话」开始独立对话；输入 / 查看命令。',
 chatPlaceholder: '输入指令，/ 查看命令，Enter 发送', send: '发送',
 teamPlaceholder: '给团队下达任务…', startTask: ' 开始任务', teamEmpty: '队长先规划，再派给各角色执行；可调用工作区工具、联网搜索、插件。',
 art: ' 画板', code: ' 代码', history: ' 历史', artPrompt: '出图提示词', generate: '生成',
 providersTitle: 'API 仓库', providersDesc: 'Key 加密保存；模型支持一键拉取、自动分类、按分类下拉、可配单价（用于成本统计）。',
 teamConfigTitle: '团队配置', rolesTitle: '角色（可增删改）', addRole: '+ 添加角色', saveRoles: '保存角色',
 skillsTitle: 'Agent 技能预设（可绑定到角色）', skillName: '技能名称', skillDesc: '技能说明', skillPrompt: '技能提示词（会追加到角色系统提示词）',
 addSkill: '添加技能', importUrl: '从 URL 导入', importJson: '粘贴导入', exportSkills: '导出全部',
 skillMarket: '技能市场（内置，一键导入）', importOne: '导入', importAll: '全部导入',
 pluginsTitle: '插件', jsPlugins: 'OAT JS 插件',
 jsPluginsDesc: '本地 .mjs 插件，可注册工具给智能体使用；保存即热加载。开发说明见项目根目录「插件开发说明.md」。',
 importCode: '导入代码', httpPlugins: '外部 API 插件（零代码）', httpPluginsDesc: '把任意 HTTP 接口（抠图/计算器/自建服务）注册成工具，智能体用 http_call 调用；参数用 {{名}} 占位。',
 addPlugin: '添加插件',
 githubTitle: 'GitHub 项目', githubDesc: 'Token 只存本机加密文件：下载仓库到工作区、把工作区项目打包上传（纯 REST，无需 git）。',
 ghLogin: '① 登录', saveToken: '保存 Token', ghClone: '② 下载仓库 → 工作区', download: '下载', ghPublish: '③ 打包上传工作区项目 → GitHub', private: '私有', upload: '上传',
 statsTitle: '统计', statsDesc: '上下文与 Token 消耗、缓存命中、费用、工具调用（累计与分角色/分模型）。', resetStats: '重置统计',
 byRole: '分角色统计', byModel: '分模型统计', recentTasks: '最近任务',
 debugTitle: '开发者调试', debugSwitches: '开关与设置', devMode: '开发者模式', allowExe: '允许调用本地程序（run_exe）', saveSettings: '保存设置', addAllowlist: '加入白名单',
 toolBench: '工具测试台', run: '运行', eventLog: '事件日志', clear: '清空',
 roadmapTitle: '规划', p3Title: 'P3 · 桌面壳 / 成本统计 / 联网工具 / 插件 / GitHub / 调试', p4Title: 'P5（当前）· 会话系统与团队增强',
 p4a: ' 按 API 分组的独立会话（新建/重命名/归档/删除/导出 JSON）', p4b: ' "/" 命令面板（/new /compact /undo /export /model /workspace 等）', p4c: ' OpenCode Go 订阅窗口显示（滚动/每周/月度进度与重置倒计时）+ x-opencode-session 修复',
 p4d: ' 技能市场（代码审查/严谨测试/画风控制等 8 个内置技能）', p4e: ' 分角色预算 + 任务总预算', p4f: ' 任务并发（可同时运行多个团队任务）',
 p5Title: 'P5.1（当前）· 对话工具执行与稳定性修复',
 p5a: ' 单智能体对话可直接生成文件/修改/跑命令（ 工具开关，默认开；执行范围 = 会话工作区）',
 p5b: ' 队长计划 JSON：容错解析 + 自动整理 + 兜底单步计划（不再整个任务失败）',
 p5c: ' AI 思考过程展示（实时展开、回答时自动收起、随会话持久化可回看）',
 p5d: ' 团队任务窗口可折叠 + 长内容限高，修复长对话把窗口拉长的问题',
 p5e: ' 对话历史自动恢复（重开程序回到上次会话并显示全部记录）',
 template: '厂商模板', displayName: '显示名称', apiKey: 'API Key（留空 = 不修改）', capabilities: '能力标签（逗号分隔）', note: '备注', defaultPrice: '默认单价（¥/百万token，可选）',
 modelList: '模型清单', fetchModels: ' 从接口拉取模型', allChat: '全选对话类', all: '全选', none: '清空', testConn: '测试连通性', cancel: '取消', save: '保存',
 testHint: '测试使用「已保存」的配置：修改后请先保存，再测试连通性', testNeedSave: '请先点击「保存」保存配置，然后再点「测试连通性」',
 delSessionTitle: '删除会话', delChatOnly: '仅删除对话（保留文件）', delWithFolder: '对话与文件夹一起删除', delPurgeHint: '「连文件夹一起删除」会清空该会话工作区内的所有文件（不可恢复），请确认后再操作。',
 cleanupTitle: '数据清理', cleanupBtn: '清理残留数据', cleanupDesc: '清理残留数据：已删除会话遗留的任务记录、孤儿任务文件、从未产生消息的空会话，以及已删除角色的对话记忆。不会删除工作区里的文件。',
 cleanupSessions: '会话', cleanupTasks: '任务记录', cleanupMemories: '角色记忆', ctxLabel: '上下文', usageRate: '使用率',
 create: '创建', newSession: '新建会话', sessionWorkspace: '工作区（默认当前工作区）', sessionTitle: '会话名称（可空）', noSessions: '（暂无会话）',
 roleName: '角色名称', roleDesc: '角色描述（给队长看的分工说明）', rolePromptPh: '自定义系统提示词（留空用内置）', enabled: '启用', noSkills: '（暂无技能）', budget: '预算¥',
 rolePerm: '该角色的工具权限（团队任务生效）', permFollow: '跟随会话',
 askLabel: '协作询问', askReply: '协作回复', asking: '询问中',
 waiting: '等待选择…', workspace: '工作区：', noTasks: '还没有任务记录。', tokens: 'Token', cache: '缓存命中', cost: '费用', toolCalls: '工具调用', context: '上下文',
 input: '输入', output: '输出', addProvider: '添加 API', edit: '编辑', delete: '删除', test: '测试', manageModels: '管理模型', useForChat: '用于对话',
 notConfigured: '未配置', noKey: '未配置Key', models: '模型', balance: '余额', failure: '失败', none2: '无', savedOk: '已保存', importDone: '导入完成', skillImportDone: '技能导入完成',
 taskBudget: '任务总预算 ¥', concurrentHint: '（支持同时运行多个任务）', running: '运行中', done: '已完成', stopped: '已停止',
 budgetSpent: '本次已花', budgetLeft: '剩余', budgetNoLimit: '（不限预算）',
 chatTools: '工具', chatToolsTip: '允许 AI 直接读写工作区文件、执行命令（关闭后只聊天）', thinking: '思考中…', thoughtDone: '已思考', clearPanel: '清空面板', collapse: '折叠', expand: '展开',
 tabSettings: '设置', settingsTitle: '设置', appearance: '外观', theme: '主题', themeDark: '深色', themeLight: '浅色', accentColor: '强调色', userBubbleColor: '我的气泡颜色', showReasoning: '显示思维链（推理过程）', showTools: '显示工具使用情况', fontSize: '字体大小',
 agentPolicy: 'Agent 工作方式 / 权限', defaultPermission: '新会话默认权限',
 permLabel: '权限：', permView: '查看', permModify: '修改', permLimited: '受限', permFullOpt: '完全',
 permDesc: '查看=只读；修改=工作区内读写；受限=工作区外可读、区内可写；完全=允许敏感操作并减少确认步骤。',
 confirmDesc: '除「完全权限」外，AI 的写文件/执行命令等操作会逐项弹出确认，可选择「允许一次 / 本会话全部允许 / 拒绝」。可在对话工具栏单独调整当前会话权限。',
 permWarnTitle: '启用「完全权限」', permWarnText: '完全权限下，AI 将减少确认步骤，可直接执行文件修改、外部命令、敏感操作。请确认你信任当前使用的模型与任务内容，并自行承担相应的风险与后果。', permAck: '我已经了解风险及其后果，确定继续', enable: '启用',
 versionTitle: '版本迭代',
 chatHistory: '历史对话', sessionMessages: '本会话消息', pastSessions: '历史会话', withdraw: '撤回', reEdit: '重新编辑',
 teamSession: '团队会话：', newTeamSession: '新建团队会话', noTeamSessions: '（暂无团队会话）', roleActivity: '角色', rolesLiveHint: '团队任务执行时，这里实时显示每个角色在做什么（点左侧角色卡片可聚焦）。',
 teamOverview: '总揽全局', focusHint: '点击只看该角色的内容（再点一次或点「总揽全局」恢复全部）',
    pause: '暂停', resume: '继续', pausedState: '已暂停', planLabel: '计划', toolLabel: '工具',
    themeSystem: '跟随系统',
 resumeAsk: '检测到未完成的团队任务', resumeContinue: '接回任务', resumeResume: '继续运行', resumeStop: '终止任务', resumePausedHint: '（已自动暂停，等待你决定是否继续）', stopConfirm: '终止该任务？已完成步骤会保留在历史中。',
 multiSelect: '多选', regenSel: '重画所选', delSel: '删除所选', selectedCount: '已选',
 viewImage: '查看图片', regenImg: '重画', delImg: '删除',
 delTitle: '删除图片', delListOnly: '仅从列表移除', delWithFile: '同时删除原文件',
 regenTitle: '重新绘画', regenReplace: '替换原图（同名覆盖）', regenNew: '生成新图（保留原图）', regenPromptPh: '提示词（单张重画可修改；多张各自使用原提示词）',
 reviewTitle: '出图审核', keepImg: '保留', reviewHint: '这张图是否保留？（可修改提示词后重画）', regenDone: '重画完成',
 presetTitle: '团队预设：', applyPreset: '应用预设（导入角色+技能）', presetApplied: '预设已应用（已保留各角色的 API/模型选择）', presetConfirm: '应用预设将覆盖当前角色配置（同 id 角色的 API/模型选择会保留），确定继续？',
 presetCustomPrefix: '自定义：', presetCustomGroup: '自定义预设', presetNameAsk: '给这个自定义预设起个名字：', presetCustomDefault: '我的团队', presetSaved: '已保存为自定义预设', presetDeleteConfirm: '删除该自定义预设？', presetDeleted: '自定义预设已删除', presetCurrent: '（当前角色配置）', saveAsPreset: '保存为自定义预设', delPreset: '删除该预设', teamPresetPick: '团队预设（可选，选中后自动带出角色）',
 stAnswering: '回答中', noReply: '没有收到回复', toBottom: '回到底部', stNeeds: '需授权',
 toolLimitTitle: '工具调用限制', tlChat: '对话', tlTeam: '团队任务 AI', tlRoleChat: '团队角色单独对话', tlUnlimited: '无限（默认）', tlOff: '禁止调用', tlCustom: '自定义次数',
 toolLimitDesc: '控制每个请求内 AI 可调用工具的次数量：默认无限；达到上限时会自动停止并提示（可在角色栏单独为该角色设置，角色设置优先）。',
 permTitle: '权限申请', permOnce: '允许一次', permAll: '本任务全部允许', permDeny: '拒绝', permGranted: '已授权', permDenied: '已拒绝',
 mobTitle: '手机连接（手机端）', mobLan: '局域网监听', mobLanDesc: '开启后，同一 Wi-Fi 下的手机可连接本机使用（修改后需重启服务生效）。异地连接可用 EasyTier 组网（后续版本提供一键引导）。',
 mobGenPair: '生成配对码', mobRestart: '重启服务使监听生效', mobPinLabel: '配对码（手机端输入）：', mobQrLabel: '手机系统相机扫码自动配对',
 mobPairHint: '手机与电脑在同一 Wi-Fi 时：打开下面的地址，输入配对码即可（也可直接扫码）：', mobDevices: '已配对设备', mobNoDevices: '（暂无设备，生成配对码后手机即可加入）',
 etTitle: 'EasyTier 异地组网（可选）', etDesc: '让手机在任意网络（流量/异地 Wi-Fi）也能连回本机：电脑与手机都加入同一个 EasyTier 网络即可（P2P 直连；共享节点仅作引荐与兜底）。启动需要管理员权限，电脑会弹 UAC 授权框。',
 etDownload: '一键下载安装', etStart: '启动组网', etStop: '停止', etPhoneHint: '手机端：安装 EasyTier 官方 Android 客户端并加入相同网络名/密码，然后手机浏览器访问「http://本机虚拟IP:3411」即可（与局域网访问用法相同）。',
 etLicense: 'EasyTier 为 LGPL-3.0 开源项目（github.com/EasyTier/EasyTier）。本软件仅从官方 Release 下载并以独立进程方式调用，不修改其代码；详见《第三方声明与许可》。',
 fwBtn: '手机连不上？防火墙设置',
 limitFollow: '跟随全局', limitCustomAsk: '输入最大工具调用次数（1-999）：',
 answerTitle: '队长向你确认需求', answerTitleSuffix: '向你确认需求', answerSubmit: '提交回答', skip: '跳过', optionOr: '也可自行填写（填写后将优先采用你写的内容）',
 uiSpacing: '界面间距', spCompact: '紧凑', spNormal: '标准', spRelaxed: '宽松', teamInputPos: '团队输入框位置', posTop: '上方', posBottom: '下方',
 roleChatAsk: '与该角色直接对话（任务进行中将作为中途指令发送）…', detach: '弹出', detachTitle: '弹出为独立窗口',
 steerAsk: '给该角色发送中途指令（会在它下一步执行时生效）：', steerSent: '指令已发送', steerTitle: '用户中途指令',
 artCalling: '正在调用出图', artCalloutDone: '出图完成', artPromptLabel: '提示词',
 stIdle: '待命', stThinking: '思考中', stActing: '执行中', stFinal: '汇总中', stDone: '已完成', stFailed: '失败',
 confirmNeed: '步骤确认', confirmOnce: '允许一次', confirmAll: '本会话全部允许', confirmDeny: '拒绝', confirmDone: '已允许执行', confirmDenied: '已拒绝', confirmAllDone: '已允许（本会话全部）',
 p6Title: 'P5.2（当前）· 团队会话 · 角色实时面板 · 历史对话 · 步骤确认与权限 · 设置',
 p6a: ' 团队任务改为先建会话（选工作区），任务过程记录进会话可回看',
 p6b: ' 底部角色实时活动栏 + 右侧「角色」面板：实时看每个角色在干什么',
 p6c: ' 对话右侧历史栏：点击跳转、撤回、重新编辑',
 p6d: ' 步骤确认（允许一次/全部允许/拒绝）+ 四级权限（查看/修改/受限/完全+风险确认）',
 p6e: ' 设置页：主题/强调色/字体大小/版本迭代/默认权限',
 p6f: ' 推理强度设置（防「只思考不回答」烧 token）+ 瞬时限流自动重试',
    reasoningEffort: '推理强度', effLow: '低（推荐，省 token）', effHigh: '高', effMax: '最大', effNone: '关闭思考', effDefault: '默认（不发送）',
    video: '视频', openApi: '开放 API', openApiHint: '把任意 HTTP 接口注册成工具（如抠图、翻译、自建服务），团队任务中的智能体可用 http_call 调用；参数用 {{名}} 占位。JS 插件请在「插件」页管理。', jsToolsTitle: '已加载的 JS 插件工具', oaEmpty: '还没有自定义 API 工具',
    vaultTitle: '凭据保险箱', vaultDesc: '本地加密保存任意 API（不限于 AI：抠图 / OCR / 翻译 / 自建服务等），可写备注（留空自动识别）。查看完整内容需要保险箱密码（未设置则直接显示）。', vaultSave: '保存 API', vaultPassBtn: '设置/修改密码', vaultRevealTitle: '查看完整 API', vaultPassPrompt: '请输入保险箱密码', vaultShowTitle: 'API 详情', vaultName: '名称', vaultKey: 'API Key', vaultNote: '备注', vaultPassTitle: '设置保险箱密码', vaultPassDesc: '设置后，每次查看已保存的完整 API 都需要输入该密码；密码仅保存在本机（不可找回，请牢记）。留空新密码则取消密码保护。', vaultOldPass: '原密码（未设置可留空）', vaultNewPass: '新密码（留空 = 取消密码保护）', close: '关闭', confirm: '确认', vaultSaved: '已保存', vaultEmpty: '保险箱还是空的，上面填写后点「保存 API」',
    videoPromptPh: '视频提示词（英文效果更佳）',
 updateTitle: '更新', updateCurrent: '当前版本', updateRepo: '更新源仓库', updateBranch: '分支', updateCheck: '检查更新', updateApply: '下载并更新',
 updateDesc: '在仓库根目录放置 version.json（{"version":"x.y.z","notes":"..."}）。更新只覆盖程序文件，不会动你的 data / workspace 数据。',
 updateNew: '检测到新版本', updateDismiss: '忽略此版本', updateDownloading: '正在下载更新…', updateDoneRestart: '更新完成，服务正在重启，几秒后自动刷新（你的数据保留）', updateFailed: '更新失败', updateUpToDate: '已是最新版本', presetMore: '更多预设：',
 effortDesc: '对 DeepSeek V4 系列等推理模型生效：思考过长会耗尽输出预算，导致「只思考不回答」并大量消耗 token，推荐「低」。',
 },
 en: {
 subtitle: 'API Vault · Balance · Multi-Agent Team · Tools · GitHub',
 tabChat: 'Chat', tabTeam: 'Team Task', tabProviders: 'API Vault', tabTeamConfig: 'Team Setup', tabPlugins: 'Plugins', tabGithub: 'Projects', tabStats: 'Stats', tabDebug: 'Debug', tabRoadmap: 'Roadmap',
 openFolder: ' Open…', refreshBalance: 'Refresh Balances', addApi: '+ Add API',
 pickHint: ' Opening the system folder picker… if you do not see it, check the taskbar, or', pickManual: 'enter a path manually',
 registeredApis: 'Registered APIs', teamRoles: 'Team Roles', configRoles: ' Configure Roles & Models',
 sidebarHint: 'Tip: click an API card to expand its sessions; click “+ New Session” for an isolated chat.',
 sidebarHint2: 'Coder/Tester roles can write files and run commands inside the workspace; web search, HTTP plugins and OAT JS plugins supported.',
 useApi: 'API:', model: 'Model:', clearChat: 'Clear', chatEmpty: ' Create a session on the left to start an isolated chat. Type / for commands.',
 chatPlaceholder: 'Type a command, / for commands, Enter to send', send: 'Send',
 teamPlaceholder: 'Give the team a task…', startTask: ' Start Task', teamEmpty: 'The leader plans first, then dispatches to roles. Tools, web search and plugins are available.',
 art: ' Canvas', code: ' Code', history: ' History', artPrompt: 'Image prompt', generate: 'Generate',
 providersTitle: 'API Vault', providersDesc: 'Keys are encrypted locally; fetch/classify models, grouped dropdown, per-provider pricing for cost stats.',
 teamConfigTitle: 'Team Setup', rolesTitle: 'Roles (add / remove / rename)', addRole: '+ Add Role', saveRoles: 'Save Roles',
 skillsTitle: 'Agent Skills (bind to roles)', skillName: 'Skill name', skillDesc: 'Skill description', skillPrompt: 'Skill prompt (appended to role system prompt)',
 addSkill: 'Add Skill', importUrl: 'Import URL', importJson: 'Import JSON', exportSkills: 'Export All',
 skillMarket: 'Skill Market (built-in, one-click import)', importOne: 'Import', importAll: 'Import All',
 pluginsTitle: 'Plugins', jsPlugins: 'OAT JS Plugins',
 jsPluginsDesc: 'Local .mjs plugins registering tools for agents; hot-reloaded. See 插件开发说明.md in the project root.',
 importCode: 'Import Code', httpPlugins: 'External HTTP API Plugins (no code)', httpPluginsDesc: 'Register any HTTP endpoint as a tool via http_call. Use {{param}} placeholders.',
 addPlugin: 'Add Plugin',
 githubTitle: 'GitHub Projects', githubDesc: 'Token stored encrypted locally: download repos, publish workspace folders (pure REST, no git).',
 ghLogin: '① Sign in', saveToken: 'Save Token', ghClone: '② Download repo → workspace', download: 'Download', ghPublish: '③ Publish workspace project → GitHub', private: 'Private', upload: 'Upload',
 statsTitle: 'Statistics', statsDesc: 'Context & token usage, cache hits, cost, tool calls.', resetStats: 'Reset Stats',
 byRole: 'Per-role stats', byModel: 'Per-model stats', recentTasks: 'Recent tasks',
 debugTitle: 'Developer Debug', debugSwitches: 'Switches & Settings', devMode: 'Developer mode', allowExe: 'Allow local executables (run_exe)', saveSettings: 'Save Settings', addAllowlist: 'Add to allowlist',
 toolBench: 'Tool Test Bench', run: 'Run', eventLog: 'Event Log', clear: 'Clear',
 roadmapTitle: 'Roadmap', p3Title: 'P3 · Desktop shell / cost stats / web tools / plugins / GitHub / debug', p4Title: 'P5 (current) · Sessions & team upgrades',
 p4a: ' Sessions grouped by API (create/rename/archive/delete/export JSON)', p4b: ' "/" command palette (/new /compact /undo /export /model /workspace …)', p4c: ' OpenCode Go subscription windows + x-opencode-session fix',
 p4d: ' Skill market (8 built-in skills)', p4e: ' Per-role budget + task budget', p4f: ' Concurrent team tasks',
 p5Title: 'P5.1 (current) · Chat tool execution & stability fixes',
 p5a: ' Single-agent chat can create/edit files and run commands ( Tools toggle, session workspace scope)',
 p5b: ' Leader plan JSON: tolerant parsing + auto-repair + fallback plan (task no longer fails)',
 p5c: ' AI thinking display (live expand, auto-collapse, persisted in session history)',
 p5d: ' Collapsible team run boxes + content height caps (no more window stretching)',
 p5e: ' Chat history auto-restore (reopen app → last session with full transcript)',
 template: 'Template', displayName: 'Display name', apiKey: 'API Key (blank = keep)', capabilities: 'Capabilities (comma separated)', note: 'Note', defaultPrice: 'Default price (¥/M tokens, optional)',
 modelList: 'Models', fetchModels: ' Fetch models', allChat: 'Select chat models', all: 'Select all', none: 'Clear', testConn: 'Test', cancel: 'Cancel', save: 'Save',
 testHint: 'Testing uses the SAVED config: save your changes first, then test', testNeedSave: 'Click "Save" first, then "Test connectivity"',
 delSessionTitle: 'Delete session', delChatOnly: 'Delete chat only (keep files)', delWithFolder: 'Delete chat AND folder', delPurgeHint: '"Delete chat AND folder" wipes all files inside this session workspace (irreversible).',
 cleanupTitle: 'Data cleanup', cleanupBtn: 'Clean leftover data', cleanupDesc: 'Removes leftover data: task records of deleted sessions, orphan task files, empty sessions, and memories of deleted roles. Workspace files are not touched.',
 cleanupSessions: 'sessions', cleanupTasks: 'tasks', cleanupMemories: 'memories', ctxLabel: 'ctx', usageRate: 'Usage rate',
 create: 'Create', newSession: 'New Session', sessionWorkspace: 'Workspace (default = current)', sessionTitle: 'Session title (optional)', noSessions: '(no sessions)',
 roleName: 'Role name', roleDesc: 'Role description', rolePromptPh: 'Custom system prompt (blank = built-in)', enabled: 'Enabled', noSkills: '(no skills)', budget: 'Budget ¥',
 rolePerm: 'Tool permission for this role (team tasks)', permFollow: 'Follow session',
 askLabel: 'Agent Q&A', askReply: 'Agent reply', asking: 'asking',
 waiting: 'Waiting…', workspace: 'Workspace: ', noTasks: 'No task history yet.', tokens: 'Tokens', cache: 'Cache hit', cost: 'Cost', toolCalls: 'Tool calls', context: 'Context',
 input: 'in', output: 'out', addProvider: 'Add API', edit: 'Edit', delete: 'Delete', test: 'Test', manageModels: 'Models', useForChat: 'Use for chat',
 notConfigured: 'not set', noKey: 'no key', models: 'models', balance: 'Balance', failure: 'failed', none2: 'none', savedOk: 'Saved', importDone: 'Imported', skillImportDone: 'Skills imported',
 taskBudget: 'Task budget ¥', concurrentHint: '(multiple tasks can run at once)', running: 'running', done: 'done', stopped: 'stopped',
 budgetSpent: 'spent', budgetLeft: 'left', budgetNoLimit: '(no limit)',
 chatTools: 'Tools', chatToolsTip: 'Let the AI read/write workspace files and run commands (off = plain chat)', thinking: 'Thinking…', thoughtDone: 'Thought', clearPanel: 'Clear panel', collapse: 'Collapse', expand: 'Expand',
 tabSettings: 'Settings', settingsTitle: 'Settings', appearance: 'Appearance', theme: 'Theme', themeDark: 'Dark', themeLight: 'Light', accentColor: 'Accent color', userBubbleColor: 'My bubble color', showReasoning: 'Show reasoning chain', showTools: 'Show tool activity', fontSize: 'Font size',
 agentPolicy: 'Agent Policy / Permissions', defaultPermission: 'Default permission (new sessions)',
 permLabel: 'Permission:', permView: 'View', permModify: 'Modify', permLimited: 'Limited', permFullOpt: 'Full',
 permDesc: 'View=read only; Modify=read/write inside workspace; Limited=read outside + write inside; Full=sensitive ops allowed with fewer confirmations.',
 confirmDesc: 'Except for Full permission, write/execute actions pop up one-by-one confirmation: allow once / allow all in this session / deny. You can adjust the current session permission in the chat toolbar.',
 permWarnTitle: 'Enable FULL permission', permWarnText: 'With full permission the AI skips most confirmations and may modify files, run external commands and perform sensitive operations. Make sure you trust the model and the task, and accept all risks and consequences.', permAck: 'I understand the risks and consequences, continue', enable: 'Enable',
 versionTitle: 'Version History',
 chatHistory: 'History', sessionMessages: 'This session', pastSessions: 'Past sessions', withdraw: 'Withdraw', reEdit: 'Edit & resend',
 teamSession: 'Team session:', newTeamSession: 'New team session', noTeamSessions: '(no team sessions)', roleActivity: 'Roles', rolesLiveHint: 'While a team task runs, this shows what each role is doing live (click a role card on the left to focus).',
 teamOverview: 'Overview', focusHint: 'Click to show only this role\'s output (click again or Overview to reset)',
    pause: 'Pause', resume: 'Resume', pausedState: 'Paused', planLabel: 'Plan', toolLabel: 'Tool',
    themeSystem: 'System',
 resumeAsk: 'Unfinished team task detected:', resumeContinue: 'Re-attach', resumeResume: 'Resume run', resumeStop: 'Stop task', resumePausedHint: ' (auto-paused, waiting for you)', stopConfirm: 'Stop this task? Completed steps are kept in history.',
 multiSelect: 'Multi-select', regenSel: 'Regen selected', delSel: 'Delete selected', selectedCount: 'Selected',
 viewImage: 'View image', regenImg: 'Regenerate', delImg: 'Delete',
 delTitle: 'Delete image(s)', delListOnly: 'Remove from list only', delWithFile: 'Delete files too',
 regenTitle: 'Regenerate', regenReplace: 'Replace original (same name)', regenNew: 'New file (keep original)', regenPromptPh: 'Prompt (single regen editable; batch uses each original prompt)',
 reviewTitle: 'Image review', keepImg: 'Keep', reviewHint: 'Keep this image? You can edit the prompt and regenerate.', regenDone: 'Regenerated',
 presetTitle: 'Team presets:', applyPreset: 'Apply preset (roles + skills)', presetApplied: 'Preset applied (API/model choices kept)', presetConfirm: 'Applying a preset overwrites current roles (API/model per role id is kept). Continue?',
 presetCustomPrefix: 'Custom: ', presetCustomGroup: 'Custom presets', presetNameAsk: 'Name this custom preset:', presetCustomDefault: 'My team', presetSaved: 'Saved as custom preset', presetDeleteConfirm: 'Delete this custom preset?', presetDeleted: 'Custom preset deleted', presetCurrent: '(current roles)', saveAsPreset: 'Save as custom preset', delPreset: 'Delete preset', teamPresetPick: 'Team preset (optional; brings in its roles)',
 stAnswering: 'Replying', noReply: 'no reply received', toBottom: 'To bottom', stNeeds: 'Needs help',
 toolLimitTitle: 'Tool call limits', tlChat: 'Chat', tlTeam: 'Team tasks', tlRoleChat: 'Role chat', tlUnlimited: 'Unlimited (default)', tlOff: 'Disabled', tlCustom: 'Custom',
 toolLimitDesc: 'Max tool calls per request. Default unlimited; the AI stops with a notice when the cap is reached. Per-role limits (role bar) take priority.',
 permTitle: 'Permission request', permOnce: 'Allow once', permAll: 'Allow all', permDeny: 'Deny', permGranted: 'Granted', permDenied: 'Denied',
 mobTitle: 'Mobile connection (Mobile app)', mobLan: 'LAN listen', mobLanDesc: 'Allow phones on the same Wi-Fi to connect (restart required). Remote access: EasyTier guide coming soon.',
 mobGenPair: 'Generate pair code', mobRestart: 'Restart to apply', mobPinLabel: 'Pair code (enter on phone):', mobQrLabel: 'Scan with phone camera to pair',
 mobPairHint: 'Open this address on your phone (same Wi-Fi) and enter the code, or scan the QR:', mobDevices: 'Paired devices', mobNoDevices: '(no devices yet)',
 etTitle: 'EasyTier remote mesh (optional)', etDesc: 'Connect from any network: join the same EasyTier network on PC and phone (P2P; shared nodes only for introduction/fallback). Starting requires admin (UAC prompt).',
 etDownload: 'Download & install', etStart: 'Start', etStop: 'Stop', etPhoneHint: 'On phone: install the official EasyTier Android app, join the same network, then open http://<virtual-ip>:3411.',
 etLicense: 'EasyTier is LGPL-3.0 (github.com/EasyTier/EasyTier). This app only downloads it from official releases and runs it as a separate process.',
 fwBtn: 'Phone cannot connect? Firewall',
 limitFollow: 'Follow global', limitCustomAsk: 'Max tool calls (1-999):',
    answerTitle: 'The leader asks for your confirmation', answerSubmit: 'Submit', skip: 'Skip', optionOr: 'or type your own (yours takes priority)',
    answerTitleSuffix: 'asks for confirmation', uiSpacing: 'UI spacing', spCompact: 'Compact', spNormal: 'Normal', spRelaxed: 'Relaxed', teamInputPos: 'Team input position', posTop: 'Top', posBottom: 'Bottom',
    roleChatAsk: 'Chat with this role directly (sent as a mid-run instruction during tasks)…', detach: 'Detach', detachTitle: 'Open in a separate window',
 steerAsk: 'Send a mid-run instruction to this role (takes effect on its next turn):', steerSent: 'Instruction sent', steerTitle: 'User instruction',
 artCalling: 'Generating image', artCalloutDone: 'Image generated', artPromptLabel: 'Prompt',
 stIdle: 'idle', stThinking: 'thinking', stActing: 'acting', stFinal: 'summarizing', stDone: 'done', stFailed: 'failed',
 confirmNeed: 'Step confirmation', confirmOnce: 'Allow once', confirmAll: 'Allow all (session)', confirmDeny: 'Deny', confirmDone: 'Allowed', confirmDenied: 'Denied', confirmAllDone: 'Allowed (all in session)',
 p6Title: 'P5.2 (current) · Team sessions · Live role panel · History · Confirmations & permissions · Settings',
 p6a: ' Team tasks now start from a session (workspace), full task history saved',
 p6b: ' Bottom live activity strip + right-side "Roles" panel: see what every role is doing',
 p6c: ' Chat history rail: jump, withdraw, edit & resend',
 p6d: ' Step confirmation (once/all/deny) + 4 permission levels (View/Modify/Limited/Full with risk ack)',
 p6e: ' Settings page: theme/accent/font size/version history/default permission',
 p6f: ' Reasoning effort setting + auto-retry on rate limits',
    reasoningEffort: 'Reasoning effort', effLow: 'Low (recommended)', effHigh: 'High', effMax: 'Max', effNone: 'Off', effDefault: 'Default (not sent)',
    video: 'Video', openApi: 'Open API', openApiHint: 'Register any HTTP endpoint as a tool (matting, translation, your own service). Agents call it via http_call; use {{param}} placeholders. Manage JS plugins on the Plugins page.', jsToolsTitle: 'Loaded JS plugin tools', oaEmpty: 'No custom API tools yet',
    vaultTitle: 'Credential Vault', vaultDesc: 'Save any API locally with encryption (not only AI: matting / OCR / translation / self-hosted). Notes auto-detected when left blank. Viewing full credentials requires the vault password (if not set, shown directly).', vaultSave: 'Save API', vaultPassBtn: 'Set / change password', vaultRevealTitle: 'View full API', vaultPassPrompt: 'Enter vault password', vaultShowTitle: 'API details', vaultName: 'Name', vaultKey: 'API Key', vaultNote: 'Note', vaultPassTitle: 'Set vault password', vaultPassDesc: 'Once set, viewing saved credentials requires this password. Stored locally only (cannot be recovered). Leave the new password blank to remove protection.', vaultOldPass: 'Current password (blank if none)', vaultNewPass: 'New password (blank = remove)', close: 'Close', confirm: 'Confirm', vaultSaved: 'Saved', vaultEmpty: 'The vault is empty — fill the form above and click Save API',
    videoPromptPh: 'Video prompt (English works better)',
 updateTitle: 'Update', updateCurrent: 'Current version', updateRepo: 'Update repo', updateBranch: 'Branch', updateCheck: 'Check for updates', updateApply: 'Download & update',
 updateDesc: 'Put version.json ({"version":"x.y.z","notes":"..."}) in the repo root. Updates only replace app files — your data / workspace stay untouched.',
 updateNew: 'New version available', updateDismiss: 'Skip this version', updateDownloading: 'Downloading update…', updateDoneRestart: 'Update applied. Server is restarting; the page will reload shortly (your data is kept).', updateFailed: 'Update failed', updateUpToDate: 'You are up to date', presetMore: 'More presets:',
 effortDesc: 'Applies to reasoning models (DeepSeek V4 etc.). Excessive thinking can exhaust the output budget (empty answers) and burn tokens — Low is recommended.',
 },
}
let LANG = 'zh'
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || (I18N.zh[k] || k)

/* 团队预设：一键导入角色配置（同 id 保留已选的 API/模型）与配套技能 */
const TEAM_PRESETS = {
 game: {
 label: '游戏开发团队（队长/策划/美术/程序/测试）',
 skillIds: ['mk_requirement', 'mk_pixel_asset', 'mk_game_qa', 'mk_asset_org', 'mk_art_style', 'mk_strict_test', 'mk_refactor', 'mk_doc_cn'],
 roles: [
 { id: 'leader', label: '队长', color: '#4f8cff', desc: '统筹、调研、提问、派单、复评', enabled: true, budgetCost: 0, skills: ['mk_requirement'], systemPrompt: `你是这个团队的队长。你的职责：1）收到用户任务后，先用 web_search/web_fetch 充分调研题材（背景、玩法、参考素材）；2）信息不足时用 ask_user 向用户逐项确认关键需求（运行形态/画风/玩法/操作/怪物/场景/交付物等），得到答复后再汇总；3）把汇总后的目标拆成 JSON 计划派发给策划/美术/程序/测试；4）主动用 ask_role 与队员商量技术方案；5）各角色执行完成后，逐项核对成果（文件是否真实存在、素材是否齐备），有用户中途指令时必须重新评估并说明处理结果；6）最终向用户报告：完成了什么、产物在哪、遗留问题、下一步建议。` },
 { id: 'planner', label: '策划', color: '#e0b34a', desc: '玩法/关卡/数值/验收标准设计', enabled: true, budgetCost: 0, skills: ['mk_requirement', 'mk_game_qa'], systemPrompt: `你是这个团队的策划。根据队长下达的目标产出完整策划书：1）核心玩法与操作（按键、动作、状态机）；2）关卡/地图结构与流程；3）数值与规则（速度、重力、得分、生命、胜负条件）；4）UI/HUD 与美术需求清单（明确需要哪些角色/场景/UI 素材，PNG）；5）验收标准清单。策划书要具体到程序与美术可直接落地执行；完成后交还队长评估。` },
 { id: 'artist', label: '美术', color: '#c86bff', desc: '素材制作：三视图→动作帧→PNG 归档', enabled: true, budgetCost: 0, skills: ['mk_pixel_asset', 'mk_asset_org', 'mk_art_style'], systemPrompt: `你是这个团队的美术，负责把策划需求变成真实可用的 PNG 素材：1）先根据题材检索参考资料，确定画风与尺寸规格；2）角色先出三视图（正面/侧面/背面），再依据三视图用 generate_image 逐个生成动作帧：待机、向左走、向右走、起跳、下落、下蹲、攻击、受击；场景/背景/UI 分文件夹生成；3）所有图片必须用 generate_image 生成（自动保存为 PNG 到工作区 artifacts/，可用 name 指定英文文件名）；4）生成后用 list_files 核对文件真实存在；5）在 assets/manifest.json（或 README.md）里汇总：文件名→用途→提示词，路径规范（如 qianxia_run_01.png），交付给程序直接引用。工作区若已有素材，先识别并判断用途，基于它补齐三视图与动作帧。` },
 { id: 'coder', label: '程序', color: '#43d17c', desc: '实现游戏代码并自测', enabled: true, budgetCost: 0, skills: ['mk_refactor', 'mk_doc_cn'], systemPrompt: `你是这个团队的程序。依据策划书与美术素材清单实现游戏：1）单文件或规范目录结构均可，代码要可直接运行；2）所有素材引用必须使用 assets/ 清单中的真实路径，写文件前先用 list_files 核对素材是否存在，缺什么就用 ask_role 找美术补（说明需要的文件名与规格）；3）写完先自行运行验证（语法检查/本地打开），把验证命令与结果附在汇报里；4）遇到测试反馈的问题要修复并回归验证。` },
 { id: 'tester', label: '测试', color: '#ff8c5a', desc: '独立验证、回归测试、协同程序修复', enabled: true, budgetCost: 0, skills: ['mk_game_qa', 'mk_strict_test'], systemPrompt: `你是这个团队的测试。对程序产出做独立验证：1）核对素材文件是否齐全（PNG 是否存在、代码引用路径是否一致）；2）按清单实测：启动无报错、操作响应、移动/跳跃/碰撞/得分/胜负、边界情况、加载与性能；3）发现问题时用 ask_role 向程序说明「复现步骤+期望+实际」，程序修复后必须回归重测；4）输出结论：通过/不通过、逐项证据、遗留问题。禁止只声称通过。` },
 ],
 },
 software: {
 label: '软件研发团队（队长/策划/程序/测试）',
 skillIds: ['mk_requirement', 'mk_code_review', 'mk_strict_test', 'mk_refactor', 'mk_doc_cn', 'mk_safe_ops'],
 roles: [
 { id: 'leader', label: '队长', color: '#4f8cff', desc: '统筹、调研、提问、派单、复评', enabled: true, budgetCost: 0, skills: ['mk_requirement'], systemPrompt: `你是这个团队的队长。1）先调研（web_search）与澄清需求（信息不足时用 ask_user 提问，拿到答复再汇总）；2）把需求拆成 JSON 计划派发；3）用 ask_role 与队员商量方案；4）逐项核对成果（文件真实性、运行结果）；5）最终报告：完成/产物/遗留/建议。遇到用户中途指令必须重新评估。` },
 { id: 'planner', label: '策划', color: '#e0b34a', desc: '需求拆解、架构与里程碑', enabled: true, budgetCost: 0, skills: ['mk_requirement'], systemPrompt: `你是这个团队的策划。把目标拆成可执行的方案：模块划分、接口约定、数据流、里程碑、验收标准；明确程序与测试各自交付物。完成后交还队长评估。` },
 { id: 'coder', label: '程序', color: '#43d17c', desc: '编码实现并自测', enabled: true, budgetCost: 0, skills: ['mk_refactor'], systemPrompt: `你是这个团队的程序。按方案写完整可运行的代码（用 write_file 落盘），先自测再交付（语法检查/运行命令+结果）；有疑问用 ask_role 问策划或测试。` },
      { id: 'tester', label: '测试', color: '#ff8c5a', desc: '独立验证并回归', enabled: true, budgetCost: 0, skills: ['mk_strict_test'], systemPrompt: `你是这个团队的测试。设计正常/边界/异常用例并真实运行验证；发现问题用 ask_role 反馈给程序（复现+期望+实际），修复后回归；输出通过/不通过结论与证据。` },
    ],
  },
  video: {
    label: '视频制作小组（队长/编剧/视频美术/质检）',
    skillIds: ['mk_requirement', 'mk_video_storyboard', 'mk_doc_cn', 'mk_strict_test'],
    roles: [
      { id: 'leader', label: '队长', color: '#2f9e8f', desc: '澄清需求、派单、汇总', enabled: true, budgetCost: 0, skills: ['mk_requirement'], systemPrompt: `你是视频制作小组的队长。1）先用 ask_user 向用户确认：视频主题、时长、画幅（横屏/竖屏）、风格、是否要字幕/旁白、交付形式；2）把确认结果汇总成目标说明，拆成 JSON 计划派发（通常：编剧分镜 → 视频美术逐镜生成 → 质检核对）；3）跟踪进度、核对产物（MP4 是否真实存在、清单是否完整）；4）最终报告成片清单与后续建议。` },
      { id: 'planner', label: '编剧', color: '#e0b34a', desc: '剧本、分镜表、镜头语言', enabled: true, budgetCost: 0, skills: ['mk_video_storyboard'], systemPrompt: `你是视频编剧。产出：1）脚本（分场、旁白/字幕文案、总时长）；2）分镜表：镜号、画面描述（每条附可直接用于 generate_video 的英文提示词）、时长、转场、音效建议；3）交付物清单。完成后交还队长评估。` },
      { id: 'videoartist', label: '视频美术', color: '#c86bff', desc: '分镜逐镜生成 MP4', enabled: true, budgetCost: 0, skills: ['mk_video_storyboard'], systemPrompt: `你是视频美术。按分镜表逐镜调用 generate_video 生成 MP4（name 用 shot01、shot02…），必要时用 generate_image 生成关键帧/封面；每次生成后用 list_files 核对文件确实存在；输出成片清单（文件→对应分镜→时长）。若生成失败（内容审核/模型不可用），调整提示词重试并说明。` },
      { id: 'tester', label: '质检', color: '#ff8c5a', desc: '核对成片与清单', enabled: true, budgetCost: 0, skills: ['mk_strict_test'], systemPrompt: `你是视频质检。独立核对：1）分镜表要求 vs 实际生成的 MP4 数量与命名；2）用 list_files/read_file 确认文件真实存在、大小正常；3）核对字幕/旁白/时长等需求项是否落实；4）输出通过/不通过结论与逐项证据，不通过时明确指出缺哪一镜。` },
    ],
  },
  image: {
    label: '图片处理小组（队长/设计策划/图片师/质检）',
    skillIds: ['mk_requirement', 'mk_art_style', 'mk_asset_org', 'mk_strict_test'],
    roles: [
      { id: 'leader', label: '队长', color: '#2f9e8f', desc: '澄清需求、派单、汇总', enabled: true, budgetCost: 0, skills: ['mk_requirement'], systemPrompt: `你是图片处理小组的队长。1）先用 ask_user 确认：图片用途、数量与尺寸、风格、是否需要透明背景、命名规则、交付目录；2）汇总后拆 JSON 计划派发（通常：设计策划 → 图片师生成/处理 → 质检）；3）核对产物（PNG 真实存在、命名与清单一致）；4）最终报告图片清单与用途。` },
      { id: 'planner', label: '设计策划', color: '#e0b34a', desc: '出图方案与提示词规范', enabled: true, budgetCost: 0, skills: ['mk_art_style'], systemPrompt: `你是设计策划。产出：1）每张图的用途与规格（尺寸、透明与否、风格关键词、负面提示词）；2）统一命名规则（如 icon_xxx.png）；3）每张图的英文出图提示词（可多行 IMAGE_PROMPT 形式）。完成后交还队长评估。` },
      { id: 'artist', label: '图片师', color: '#c86bff', desc: '生成 PNG 并归档', enabled: true, budgetCost: 0, skills: ['mk_art_style', 'mk_asset_org'], systemPrompt: `你是图片师。按方案逐张用 generate_image 生成 PNG（name 按命名规则），需要透明/方块素材时在提示词中说明；每张图生成后用 list_files 核对文件；最后把全部素材与提示词汇总成 assets/manifest.json 交给质检。` },
      { id: 'tester', label: '质检', color: '#ff8c5a', desc: '核对图片与清单', enabled: true, budgetCost: 0, skills: ['mk_strict_test'], systemPrompt: `你是图片质检。核对：1）清单 vs 实际 PNG 数量与命名；2）文件真实存在、大小正常（list_files 证据）；3）规格是否满足需求（尺寸/数量说明）；4）输出通过/不通过结论与逐项证据。` },
    ],
  },
  novel: {
   label: '小说写作团队（主编/大纲策划/写手/校对）',
   skillIds: ['mk_requirement', 'mk_novel_outline', 'mk_novel_style', 'mk_novel_draft', 'mk_novel_proofread', 'mk_doc_cn'],
   roles: [
    { id: 'leader', label: '主编', color: '#4f8cff', desc: '澄清需求、派单、审稿、汇总', enabled: true, budgetCost: 0, skills: ['mk_requirement'], systemPrompt: `你是小说写作团队的主编。1）先用 ask_user 向用户逐项确认关键设定：题材与基调、目标受众、篇幅与章节数、叙事视角、文风样例、是否需要书名/简介/封面、交付形式（目录与文件命名）；2）把确认结果汇总成写作目标，拆成 JSON 计划派发（通常：大纲策划出纲 → 写手逐章写作 → 校对逐项校对）；3）写作过程中用 ask_role 与队员沟通；4）核对产物：章节文件是否真实存在、大纲与进度清单是否齐全、字数是否达标；5）最终报告：书名/简介、章节清单与字数、遗留问题与下一步建议。遇到用户中途指令必须重新评估并说明处理结果。` },
    { id: 'planner', label: '大纲策划', color: '#e0b34a', desc: '世界观/人物/主线/分章大纲', enabled: true, budgetCost: 0, skills: ['mk_novel_outline'], systemPrompt: `你是大纲策划。依据主编确认的需求产出完整大纲并写入工作区文件（outline.md）：1）世界观与核心设定（规则、禁忌、代价）；2）人物设定表：主角/对手/关键配角的目标、动机、缺陷、成长弧；3）主线与支线脉络（冲突升级节点、高潮与结局）；4）分章大纲：每章写明「本章目标、核心冲突、出场人物、结尾钩子、预计字数」；5）书名候选与简介（3 版）。大纲要细到写手可直接按章开写；完成后交还主编评估。` },
    { id: 'writer', label: '写手', color: '#43d17c', desc: '按大纲逐章写作并落盘', enabled: true, budgetCost: 0, skills: ['mk_novel_style', 'mk_novel_draft'], systemPrompt: `你是写手。严格按大纲逐章写作：1）每章用 write_file 真实落盘到 chapters/chapter_XX.md（不要在回复里只贴正文）；2）遵守已确定的视角、基调、称呼与时间线，对话符合人物性格；3）每章结尾留钩子，控制在约定字数（±10%）；4）维护 chapters/README.md 进度清单（章号/标题/字数/状态）；5）写作中若发现大纲有漏洞或需要调整，用 ask_role 与大纲策划确认后再继续；6）每写完一章用 list_files 核对文件，再继续下一章。` },
    { id: 'editor', label: '校对', color: '#ff8c5a', desc: '逻辑/人设/时间线/文字校对', enabled: true, budgetCost: 0, skills: ['mk_novel_proofread'], systemPrompt: `你是校对。对写手的稿子做独立校对：1）真实读取章节文件（read_file）逐项检查：剧情逻辑、人设一致性、时间线/空间线、重复用词与错别字、节奏问题；2）输出校对清单：文件+段落位置+问题类型+修改建议；3）重大问题用 ask_role 反馈给写手（写明 复现位置+问题+建议），写手修改后必须复审；4）全部通过后输出结论：通过/不通过、逐项证据、遗留问题。禁止只声称通过。` },
   ],
  },
  files: {
   label: '文件整理小组（队长/整理方案/整理执行/核验）',
    skillIds: ['mk_file_organize', 'mk_safe_ops', 'mk_strict_test', 'mk_doc_cn'],
    roles: [
      { id: 'leader', label: '队长', color: '#2f9e8f', desc: '澄清范围、派单、汇总', enabled: true, budgetCost: 0, skills: ['mk_requirement'], systemPrompt: `你是文件整理小组的队长。1）先用 ask_user 确认：要整理哪个目录、按什么维度分类、是否去重、重命名规则、是否允许移动/删除（默认只允许复制到新目录）；2）汇总后拆 JSON 计划派发（整理方案 → 执行 → 核验）；3）强调非破坏性：删除/移动必须先征得用户同意；4）最终报告整理报告摘要。` },
      { id: 'planner', label: '整理方案', color: '#e0b34a', desc: '盘点现状、制定规则', enabled: true, budgetCost: 0, skills: ['mk_file_organize'], systemPrompt: `你是整理方案设计者。1）先用 list_files 完整盘点目标目录（文件类型、数量、疑似重复、命名混乱）；2）产出整理方案：分类维度与目录结构、命名规范、重命名映射表草案、保留/归档策略；3）标明风险操作与替代方案。完成后交还队长评估。` },
      { id: 'organizer', label: '整理执行', color: '#43d17c', desc: '按方案执行并出清单', enabled: true, budgetCost: 0, skills: ['mk_file_organize', 'mk_safe_ops'], systemPrompt: `你是整理执行者。严格按已确认的方案操作：1）默认用「复制到新目录」而非移动；2）用 run_command/write_file 完成分类复制与重命名映射脚本；3）生成整理清单（原路径→新路径→分类→备注）；4）任何删除/覆盖操作前必须先备份并等用户确认。完成后汇报执行结果。` },
      { id: 'tester', label: '核验', color: '#ff8c5a', desc: '核对整理结果与清单', enabled: true, budgetCost: 0, skills: ['mk_strict_test'], systemPrompt: `你是核验员。1）对照整理清单抽查：随机抽取若干条，用 list_files/read_file 确认新路径文件真实存在且内容一致；2）核对是否有遗漏或重复；3）确认没有文件被意外删除；4）输出核验结论与证据。` },
    ],
  },
}

/* 版本迭代记录（设置页展示） */
const APP_VERSION = '1.4.0'
const CHANGELOG = [
  ['P9.3', '2026-10', [
    '本地知识库（RAG）：零依赖 BM25 检索——自动给当前工作区文档（md / txt / PDF 等）建索引（存 工作区/.oat/index.json，随项目迁移），CJK 二元分词无需外部分词库；PDF 为尽力而为抽取（扫描版不支持），纯本机、无外部服务',
    '角色对话与团队每一步自动检索知识库并注入最相关片段（可在设置页关闭）；新增 kb_search 工具，AI 可主动在项目文档里查资料并给出文件路径',
    '设置页新增「本地知识库」卡片：索引状态（文件数/分块数/更新时间）、重建索引、检索测试、自动注入开关；索引超过 30 分钟自动增量刷新（mtime+size 未变的文件复用旧分块）',
  ]],
  ['P9.2', '2026-10', [
    '定时任务 / 心跳（借鉴 Paperclip）：设置页可视化创建「每隔 N 分钟」或「每天 HH:MM」自动任务，到点自动给团队下达指令并跑完整流程；结果写入团队会话与 .oat 项目档案；状态回显（运行中 / 上次成功费用 / 连续失败次数）；失败 5 分钟后自动重试，连续 3 次自动停用',
    '首启向导：未配置任何 API 时对话页顶部显示三步引导（添加 API → 选择团队预设 → 一键填入示例任务），配置完成后自动消失，可点「不再提示」',
    'PWA / 添加到主屏幕：新增 manifest 与移动端 meta，手机浏览器可将页面添加到主屏幕当 App 用（Android 原生壳在规划中）',
  ]],
  ['P9.1', '2026-10', [
    '.oat 常驻项目档案（借鉴 hindsight 思路）：团队任务收尾自动把「任务/步骤/产物线索/状态/汇总节选」写入 工作区/.oat/PROJECT.md，角色对话与团队每个步骤自动注入——新会话不翻文件也能记得项目历史；设置页可查看/编辑/清空，档案随项目复制迁移',
    '自动续跑（团队任务栏，0-5 次）：任务完成后自动检查并继续未完成项，直到汇总写出「【全部完成】」或次数用尽；续跑任务照常落盘，随时可「接回任务」；同时修复了「接回任务」横幅此前不会自动出现的隐藏问题',
    '验收证据门（借鉴 Paperclip「无证据不算完成」）：新增内置技能「验收证据规范」；返工与最终汇总被强制要求附证据（文件读回片段 / 命令原文与输出），无法验证必须标注「未验证」，不允许只声称完成',
    '后台系统通知：页面切到后台时提醒「任务完成 / 待授权 / 待回答」（http 访问下自动退化为标题闪烁）；SSE 断线时顶部出现自动重连横幅',
    '手机连接页新增 IPv6 地址显示与一键复制；新建会话的工作区不存在时自动创建（避免文件静默写到全局工作区）',
    '安全审计与加固：配对码失败限速（防 6 位码爆破）、调试工具执行改 execFile 数组参数（修复引号截断命令注入）、请求体 64MB 上限、保险箱「清除保护」仅限本机、危险命令黑名单扩充、静态文件目录边界校验、客户端断传稳定性兜底',
    '作者声明新增「特别感谢：YY程」',
  ]],
  ['P9', '2026-10', ['重大版本：手机端互联（合并自实验分支 Turing Agent Team，该分支完成使命后归档）——桌面端 + 安卓手机浏览器/App 互联', '手机连接：局域网监听开关（默认关）+ 6 位 PIN/二维码配对（手机系统相机扫码自动配对）+ 设备令牌与权限档（只读/可操作/可批准/可配置）+ 设备管理（命名/改权限/撤销）', '手机端能力：走电脑代理对话、远程监控与控制团队任务（暂停/继续/终止/中途指令/角色单聊）、批准权限申请、回答 AI 提问', '断线不暂停：手机切后台/断网不打断电脑端任务；任务事件落盘，重连后完整回放', '跨设备同步：/api/stream 事件流（rev 变更广播），多设备自动刷新/提示', 'EasyTier 异地组网一键引导（LGPL-3.0：官方下载 + 独立进程调用，见《第三方声明与许可》）', '移动端适配：窄屏抽屉侧栏、工具栏横滑、配对门页面与防火墙提示', '新增内置技能「安全审计（多阶段）」（借鉴 Cloudflare security-audit-skill 方法论：侦察→覆盖排查→候选验证→结构化输出→独立复核→报告）']],
  ['P8.7', '2026-10', ['新增工具调用次数限制（设置 → 工具调用限制）：对话 / 团队任务 / 团队角色单独对话三处独立设置，可选「无限（默认）/ 禁止 / 自定义次数」；角色栏可为单个角色单独设置（角色优先）', '权限不足时 AI 主动申请：弹出「允许一次 / 本任务全部允许 / 拒绝」按钮卡片，不再静默卡住', '团队角色卡片状态标记：✓ 已完成（绿）、! 需授权（棕）、✗ 失败（红）；等待授权时对应角色卡片显示棕色感叹号', '审核/校对判定不通过时自动「返工 → 复审」循环（最多 2 轮）：AI 之间自动对接协作，不再坐等用户转达', '团队角色单独对话：思考过程与工具调用改为可折叠独立框（与对话页一致）；达到次数上限/被禁用时明确提示', '放宽工具轮次上限：默认无限（此前团队每步最多 5 轮、对话 6 轮，导致写长文写到一半停止）']],
  ['P8.6', '2026-10', ['团队会话里的角色单独对话与「协作询问/协作回复」现在会持久化保存，刷新后完整回放（不再只剩记忆）', '对话与团队任务新增「回到底部」浮动按钮：不在底部时自动出现，一键滚到最新内容', '角色单独对话支持拖入图片/文件：聚焦某角色后拖入即发给该角色（文件存入工作区 uploads/ 并附带路径），未聚焦时仍发给团队任务']],
  ['P8.5', '2026-10', ['修复工具执行可靠性：对话与单角色对话新增「工具块 JSON 解析失败自动重发」（此前失败块被静默丢弃，AI 会误报「读取结果未回传」）', '工具协议补充运行环境：Windows 下 run_command 用 cmd（dir/type/findstr），禁止 cat/ls 等 Linux 命令；误用时直接返回替代方案（read_file/list_files/type/dir）', '单角色对话工具循环轮数 6 → 8（为重发与补读留出余量）', '修复团队配置：点「添加角色」不再清空未保存的编辑内容（先收集当前输入再追加）', '团队预设支持自定义：可把当前角色配置保存为自定义预设（持久化），支持套用与删除；新建团队会话弹窗新增预设下拉，选中即带出对应角色', '套用内置预设时，新增角色自动继承队长的 API/模型配置（修复写手/校对等新角色无模型可用）', '团队任务与单角色对话新增状态标签：思考中（闪烁）→ 回答中 → 已完成/失败；点击状态可折叠/展开思考过程', '协作规则：队友间的问题优先用 ask_role 直接沟通（对方立即自动回复），仅重大决策/无法判断时才交给用户']],
  ['P8.4', '2026-10', ['团队预算栏新增实时显示：本次任务已花费 + 预算剩余（修改预算数字即时预览，超支变红；切换会话自动恢复上次花费）', '上下文占用升级为环形进度指示器：直接显示在对话消息内与团队每个角色块头部，悬停弹出「成本 / 使用率 / Token」卡片，≥60% 变黄、≥85% 变红', '修复环形指示器在消息重绘（发送完成/刷新）后消失的问题：会话现在持久化上下文上限，历史消息同样显示环形占用']],
  ['P8.3', '2026-10', ['修复 ask_user 提问卡片：自己填写的内容现在优先于预设选项（此前选了预设再填写，结果仍采用预设的问题）', '新增「小说写作团队」预设：主编 / 大纲策划 / 写手 / 校对 + 配套技能（世界观大纲、文风控制、章节写作规范、校对规范）', '问题卡片输入框提示更新：填写后将优先采用你写的内容']],
  ['P8.2', '2026-10', ['单独对话气泡：用户消息独立显示、不再被 AI 回复覆盖，颜色可在 设置 → 外观 →「我的气泡颜色」调整', '角色对话记忆同步：被询问的角色会保存队友的问询记录（之后单独对话能回忆）；协作询问/回复在双方角色视图都可见，气泡使用各自角色颜色', '单独角色对话也遵循该角色自己的权限设置', '新建团队会话不再显示消息条数后缀（避免误认为会话序号）', '更新源仓库默认填入 AceTaffer/Open-Agent-Team（新安装/分享包即自带）', 'API 弹窗新增提示：测试连通性使用「已保存」配置，未保存点击时会明确提醒先保存', '设置 → 外观新增显示开关：思维链（推理过程）、工具使用情况，默认开启，可随时隐藏', 'AI 回复不再显示原始工具调用代码块（```tool 片段），工具过程统一由工具盒/开关呈现', 'OpenCode Go 模型库扩充至 30 个（千问 Qwen / GLM / GPT-6 Luna / Grok / Kimi / MiniMax / Mimo 等，可直接在模型下拉选择）', '删除对话/团队会话时可选择：仅删除对话（保留文件）或连同工作区文件夹一起彻底删除', '设置新增「数据清理」：清理已删除会话遗留的任务记录、孤儿任务文件、空会话与已删除角色的对话记忆（不动工作区文件）', '对话工具栏与团队每个角色块显示上下文占用百分比（≥60% 变黄、≥85% 变红）']],
  ['P8.1', '2026-10', ['修复团队任务三个问题：① 队长汇总阶段现可真实写文件（报告/文档直接落盘并核对）', '② 角色间协作 ask_role 支持中文角色名匹配（此前「程序/测试」等名称会报未找到角色），并新增「协作询问/协作回复」过程卡片', '③ 团队任务支持每角色独立工具权限（团队配置页可为单个角色设置，覆盖会话默认权限）', '单角色对话（单独与某个 AI 聊天）现支持工具调用：可直接让某角色用 ask_role 联系队友、读写工作区等，过程卡片实时可见', '上游接口 30 秒无数据自动中断并给出明确提示（避免接口繁忙时无限等待）']],
  ['P8', '2026-10', ['正式版 1.0.0', '凭据保险箱中的 API 可被 AI 直接调用（对话与团队任务新增 vault_call 工具，密钥自动携带；支持自定义认证头与 {{key}}/{{参数}} 占位）', '字体大小范围扩展为 10–35px，默认 13px']],
  ['P7.4', '2026-10', ['厂商模板扩充：OpenAI(GPT) / Anthropic(Claude) / 智谱GLM / MiniMax / xAI(Grok) / Gemini + 自定义', '作者声明更新（作者 Acct · AI 协作 deepseek-v4.1-flash · 邮箱 577940959@qq.com）', 'GitHub 仓库已建立并接入热更新（AceTaffer/Open-Agent-Team）']],
  ['P7.3', '2026-10', ['支持把图片/文档直接拖入对话与团队任务（自动存入工作区 uploads/，图片可作为对话附件）', '设置页新增作者声明（作者 Acct · AI 开发协作 · 联系邮箱）', '新增宣传片工程（web/promo：ASCII 终端风格网页动画，可复制再生成视频）', '内置 ffmpeg 视频工具链（tools/ffmpeg.exe，用于动画→MP4 导出）']],
  ['P7.2', '2026-10', ['新增团队预设：视频制作小组 / 图片处理小组 / 文件整理小组（含配套技能）', '新增 GitHub 热更新：自动检测新版本并提醒，一键下载更新（只覆盖程序文件，data/workspace 数据完全保留），更新后自动重启']],
  ['P7.1', '2026-09', ['移除"弹出独立窗口"功能（存在同步问题），保留角色标签页与单独对话栏']],
  ['P7', '2026-09', ['队长逻辑修复：先提问/商量再出计划（不再"边确认需求边派活"）+ 计划解析三重兜底（含裸数组/别名字段/JSON 模式修复）', '团队角色独立标签页：总览 + 每个角色一页，互不干扰', '修复自动滚动抢占滚动条（用户翻阅时不再被强制拉回底部）', '每个角色独立对话栏：可直接与单个角色聊天；任务中发送即作为中途指令', '团队输入框位置可调（设置：上方/下方）+ 界面间距预设（紧凑/标准/宽松）', '提问卡片显示具体提问角色名']],
  ['P6', '2026-09', ['界面全面重设计（frontend-design 技能规范）：去装饰化、petrol 主题色、滚动条/标签跟随主题', '分栏可拖拽调宽（侧栏 / 历史栏 / 团队面板）', '团队会话新建改为角色配置弹窗（勾选参与角色+工作区+名称）', '新增「视频」面板与 generate_video 工具（百炼 wan 视频）', '新增「开放 API」面板：快捷注册 HTTP 工具供智能体调用', '新增「凭据保险箱」：本地加密保存任意 API + 备注自动识别 + 密码查看', '修复画板删除（仅列表/删文件）与画廊滚动', '侧栏新增「添加 API」入口；移除重复的「规划」页']],
 ['P5.4', '2026-09', ['断线/刷新保护：任务自动暂停 + 心跳检测 +「继续运行/终止」恢复横幅 + 重连回放', '暂停/继续：全局按钮 + 每个角色单独暂停', '出图人工审核：每张图 保留/重画（可改提示词）/删除', '画板画廊重做：滚动、大图查看、多选、删除（仅列表/删文件）、重画（替换/新图）', '工具块 JSON 解析失败自动重试 + 测试不通过自动返工', '主题跟随系统 + 浅色模式覆盖全部输入框/面板']],
 ['P5.3', '2026-09', ['团队会话管理：重命名 / 导出 JSON / 删除', '画板 AI 出图实时提示（谁在调用、提示词、进行中/完成，标签页呼吸灯）', 'ask_user 提问确认（选项+自填，任务暂停等待用户）', 'ask_role 角色间互相商量；generate_image 出图工具（PNG 落盘 artifacts/，可命名）', '中途指令：对单个角色留言 ，队长最终复评估', '团队预设（游戏开发/软件研发）+ 新增游戏技能（素材规范/测试清单/归档）']],
 ['P5.2', '2026-09', ['团队会话：先建会话（选工作区）再下任务，过程记录进会话', '底部角色实时活动栏 + 右侧「角色」面板', '对话右侧历史栏：跳转 / 撤回 / 重新编辑', '步骤确认（允许一次 / 全部允许 / 拒绝）', '四级权限：查看 / 修改 / 受限 / 完全（含风险确认）', '设置页：主题 / 强调色 / 字体大小 / 默认权限', '推理强度设置（防「只思考不回答」烧 token）+ 思考失控安全阀 + 429/5xx 自动重试']],
 ['P5.1', '2026-09', ['对话可直接生成文件、执行命令（工具开关）', '队长计划 JSON 容错解析 + 自动整理 + 兜底', 'AI 思考过程展示与持久化', '团队窗口折叠与防拉伸', '对话历史自动恢复']],
 ['P5', '2026-09', ['按 API 分组的多会话（重命名/归档/导出）', '“/” 命令面板', 'OpenCode Go 订阅窗口显示', '技能市场 / 角色预算 / 任务并发']],
 ['P4', '2026-09', ['更名 Open Agent Team', '自定义角色与技能', '中英文切换', '统计与 JS 插件系统']],
 ['P3', '2026-09', ['桌面壳 Electron', '成本统计', '联网搜索', 'HTTP 插件', 'GitHub 集成', '开发者调试']],
 ['P2', '2026-09', ['模型分类管理', '多智能体团队', '工具协议', '画板', '代码视图']],
 ['P1', '2026-09', ['API 仓库（加密）', '余额中心', '单智能体对话']],
]

/* ══════════════ 状态 ══════════════ */
const state = {
 providers: [], templates: {}, roles: [], settings: {}, skills: [], jsPlugins: [], plugins: [],
 sessions: [], activeSession: null, expanded: new Set(), showArchived: false,
 balances: {}, workspaces: [], activeWorkspace: '',
 chatImage: null, lastUsage: null, runs: [],
  teamSessions: [], teamSessionId: '', roleLive: {}, teamLoaded: false, teamFocus: '', currentTeamTaskId: '', teamTaskCost: 0,
  customPresets: {},
 runPaused: false, agentPaused: new Set(),
 artItems: [], artSel: new Set(), artMulti: false, viewerItem: null, delTargets: [], regenTargets: [],
 vault: { hasPassword: false, items: [] }, vaultPending: null,
 pendingPerm: '', nsKind: 'chat', focusRole: '',
 mm: { models: [], selected: new Set() },
 cmd: { open: false, list: [], index: 0 },
}
const esc = (s) =>String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
/* ★ TAT：手机端设备 token（配对后保存在本机浏览器；电脑本机无需 token） */
let AUTH_TOKEN = localStorage.getItem('oat-token') || ''
const IS_LOCAL_HOST = ['127.0.0.1', 'localhost', '::1', ''].includes(location.hostname)
const authHeaders = () => (AUTH_TOKEN ? { Authorization: 'Bearer ' + AUTH_TOKEN } : {})
const detectDeviceName = () => /Android/i.test(navigator.userAgent) ? 'Android 手机' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone/iPad' : '手机浏览器'
let lastLocalWrite = 0
const api = async (method, url, body) => {
  const res = await fetch(url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders() }, body: body ? JSON.stringify(body) : undefined })
  if (method !== 'GET') lastLocalWrite = Date.now()
  if (res.status === 401 && !IS_LOCAL_HOST) showPairGate('配对已失效，请重新配对（设备可能已被电脑端撤销）')
  return res.json()
}
/* ★ TAT：跨设备同步——订阅统一事件流，其他设备变更时自动刷新列表/提示 */
let tatStream = null
function setupStateStream() {
  if (tatStream) return
  try {
    const url = '/api/stream' + (AUTH_TOKEN ? `?token=${encodeURIComponent(AUTH_TOKEN)}` : '')
    tatStream = new EventSource(url)
    tatStream.onmessage = (e) => { try { const ev = JSON.parse(e.data); if (ev.type === 'changed') onRemoteChange(ev) } catch { /* ignore */ } }
    // ★ Orca 要点②：断线自动重连 + 顶部横幅提示（EventSource 自带重连，这里只做可视化）
    tatStream.onopen = () => hideReconnectBanner()
    tatStream.onerror = () => showReconnectBanner()
  } catch { /* ignore */ }
}
/* ★ Orca 要点②：SSE 重连横幅 */
function showReconnectBanner() {
  let el = document.getElementById('reconnect-banner')
  if (!el) {
    el = document.createElement('div')
    el.id = 'reconnect-banner'
    el.textContent = '连接已断开，正在自动重连…'
    document.body.appendChild(el)
  }
  el.classList.add('show')
}
function hideReconnectBanner() { const el = document.getElementById('reconnect-banner'); if (el) el.classList.remove('show') }
/* ★ Orca 要点①：后台系统通知（页面隐藏时提醒任务完成/待授权/待回答）
 *   优先用浏览器系统通知（需 HTTPS/localhost 且已授权）；不可用时退化为标题闪烁 */
let _titleTimer = null
function flashTitle(msg) {
  try {
    const orig = document.title
    let i = 0
    clearInterval(_titleTimer)
    _titleTimer = setInterval(() => {
      document.title = i % 2 ? orig : msg
      i++
      if (i > 6) { clearInterval(_titleTimer); document.title = orig }
    }, 1500)
    const h = () => { if (!document.hidden) { clearInterval(_titleTimer); document.title = orig; document.removeEventListener('visibilitychange', h) } }
    document.addEventListener('visibilitychange', h)
  } catch { /* ignore */ }
}
function maybeNotify(title, body) {
  try {
    if (localStorage.getItem('oat-notify') !== '1' || !document.hidden) return
    const text = String(body || '').replace(/\s+/g, ' ').slice(0, 160)
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: text, tag: 'oat-team' }) } catch { /* ignore */ }
    flashTitle(`【${title}】${text.slice(0, 40)}`)
  } catch { /* ignore */ }
}
function remoteToast(msg) {
  let el = document.getElementById('remote-toast')
  if (!el) { el = document.createElement('div'); el.id = 'remote-toast'; document.body.appendChild(el) }
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(remoteToast._t)
  remoteToast._t = setTimeout(() => el.classList.remove('show'), 4000)
}
function onRemoteChange(ev) {
  try {
    if (ev.key === 'sessions') { refreshSessions().catch(() => {}); if (state.teamLoaded) refreshTeamSessions(state.teamSessionId).catch(() => {}); checkActiveRuns(true).catch(() => {}) }
    else if (ev.key === 'tasks') { refreshTasks(); checkActiveRuns(true).catch(() => {}); renderSchedules().catch(() => {}) }
    else if (ev.key === 'art') refreshArtGallery()
    else if (ev.key === 'stats') refreshStats()
    else if (['settings', 'roles', 'providers', 'devices'].includes(ev.key) && Date.now() - lastLocalWrite > 3000) remoteToast('另一台设备更新了配置，刷新页面后生效')
  } catch { /* ignore */ }
}
/* ★ TAT：手机端配对（PIN 输入或扫码自动配对后的兜底界面） */
function showPairGate(msg) {
  if (document.getElementById('pair-gate')) { if (msg) document.getElementById('pair-gate-msg').textContent = msg; return }
  const el = document.createElement('div')
  el.id = 'pair-gate'
  el.innerHTML = `<div class="pg-box">
    <h2>Open Agent Team</h2>
    <p class="dim small">${esc(msg || '手机尚未与电脑配对。请在电脑端打开：设置 → 手机连接 → 生成配对码，然后在下方输入 6 位配对码。')}</p>
    <input id="pg-pin" inputmode="numeric" maxlength="6" placeholder="6 位配对码" />
    <input id="pg-name" placeholder="设备名称（可选，如：我的手机）" />
    <button id="pg-btn" class="btn primary">配对连接</button>
    <p id="pair-gate-msg" class="dim small"></p>
  </div>`
  document.body.appendChild(el)
  document.getElementById('pg-btn').onclick = async () => {
    const code = document.getElementById('pg-pin').value.trim()
    if (!/^\d{6}$/.test(code)) { document.getElementById('pair-gate-msg').textContent = '请输入 6 位数字配对码'; return }
    document.getElementById('pair-gate-msg').textContent = '正在配对…'
    const r = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, deviceName: document.getElementById('pg-name').value.trim() || detectDeviceName() }) }).then((x) => x.json()).catch(() => ({}))
    if (r.ok) { localStorage.setItem('oat-token', r.token); location.reload() }
    else document.getElementById('pair-gate-msg').textContent = r.error || '配对失败'
  }
}
const providerById = (id) =>state.providers.find((p) =>p.id === id)
const roleById = (id) =>state.roles.find((r) =>r.id === id)
const isChatCapable = (m) => !(m.tags || []).some((x) =>NON_CHAT.includes(x))
const primaryGroup = (tags = []) =>tags.find((x) =>NON_CHAT.includes(x)) || tags[0] || '对话'

/* 角色提问卡片（ask_user）：每题可选项 + 自填（标题显示提问的角色） */
function appendQuestionCard(container, q, who) {
 const el = document.createElement('div')
 el.className = 'question-box'
 const qs = q.questions || []
 const whoLabel = who && who !== 'chat' ? roleLabel(who) : (who === 'chat' ? 'AI' : (LANG === 'zh' ? '团队' : 'Team'))
 el.innerHTML = `<div class="qf-head">${esc(whoLabel)} ${t('answerTitleSuffix')}</div>` + qs.map((x, i) => `
 <div class="qf-item" data-i="${i}">
 <div class="qf-text">${i + 1}. ${esc(x.question || String(x))}</div>
 ${(x.options || []).length ? `<div class="qf-options">${(x.options || []).map((o, k) => `<label class="chk"><input type="radio" name="q_${esc(q.id)}_${i}" value="${esc(o)}" ${k === 0 ? 'checked' : ''} /> ${esc(o)}</label>`).join('')}</div>` : ''}
 <input class="qf-input" placeholder="${esc(t('optionOr'))}" />
 </div>`).join('') + `<div class="cf-actions">
 <button class="btn primary tiny" data-a="submit"> ${t('answerSubmit')}</button>
 <button class="btn ghost tiny" data-a="skip">${t('skip')}</button>
 </div>`
 container.appendChild(el)
 container.scrollTop = container.scrollHeight
 const finish = async (answer) => {
 await api('POST', '/api/answer', { id: q.id, answer })
 el.classList.add('done')
 el.querySelector('.cf-actions').innerHTML = `<span class="small">${answer ? ' ' + esc(String(answer).slice(0, 90)) : '⏭ ' + t('skip')}</span>`
 }
  el.querySelector('button[data-a="submit"]').onclick = () => {
   const parts = []
   el.querySelectorAll('.qf-item').forEach((it) => {
    const radio = it.querySelector('input[type=radio]:checked')
    const input = it.querySelector('.qf-input').value.trim()
    const text = it.querySelector('.qf-text').textContent.replace(/^\d+\.\s*/, '')
    // ★ 自定义填写优先于预设选项（此前选了预设再填写，结果仍被预设覆盖）
    const ans = input || (radio ? radio.value : '')
    if (ans) parts.push(`${text}\n→ ${ans}`)
   })
   finish(parts.join('\n\n') || '（无具体回答，按你的推荐方案执行）')
  }
 el.querySelector('button[data-a="skip"]').onclick = () =>finish('')
 return el
}
/* 用户中途指令 */
function steerSend(taskId, agent) {
 const msg = prompt(t('steerAsk'))
 if (!msg || !msg.trim()) return
 api('POST', '/api/team/steer', { taskId, agent, message: msg.trim() }).then(() =>alert(t('steerSent')))
}
// ★ 协作气泡：用发言角色自己的颜色
function styleAskBox(el, colorRoleId) {
 const c = roleColor(colorRoleId)
 if (c) el.style.borderLeft = '4px solid ' + c
 return el
}
// ★ 消息/角色块状态标签：思考中 → 回答中 → 已完成/失败；点击可折叠/展开思考过程
function setMsgStatus(bodyEl, st) {
 if (!bodyEl) return
 const block = bodyEl.parentElement
 const head = block?.querySelector('.agent-head')
 if (!head) return
 let el = head.querySelector('.msg-status')
 if (!el) {
  el = document.createElement('span')
  el.className = 'msg-status'
  el.title = t('thinking')
  el.onclick = () => { const d = block.querySelector('.reasoning'); if (d) d.open = !d.open }
  head.appendChild(el)
 }
 if (el.dataset.st === st) return
 el.dataset.st = st
 el.textContent = st === 'done' ? t('stDone') : st === 'failed' ? t('stFailed') : st === 'answering' ? t('stAnswering') + '…' : t('stThinking') + '…'
}
// ★ 上下文占用环形指示器（悬停显示 费用/使用率/Token/缓存命中），用于对话消息与团队角色块
function setCtxBadge(host, pct, cost, tokens, cacheHit) {
 if (!host) return
 const head = host.querySelector('.agent-head') || host
 let el = head.querySelector('.ctx-ring')
 if (!el) { el = document.createElement('span'); head.appendChild(el) }
 const cls = pct >= 85 ? 'hot' : pct >= 60 ? 'warn' : ''
 el.className = 'ctx-ring ' + cls
 const off = Math.max(0, 100 - Math.min(100, Number(pct) || 0))
 el.innerHTML = `<svg viewBox="0 0 36 36"><circle class="ring-bg" cx="18" cy="18" r="15.9155"></circle><circle class="ring-fg" cx="18" cy="18" r="15.9155" stroke-dasharray="100" stroke-dashoffset="${off}"></circle></svg>
 <span class="ctx-tip"><span class="ctx-tip-row"><i>${t('cost')}</i><b>${fmtCost(cost)}</b></span><span class="ctx-tip-row"><i>${t('usageRate')}</i><b>${pct}%</b></span><span class="ctx-tip-row"><i>Token</i><b>${fmtNum(tokens)}</b></span><span class="ctx-tip-row"><i>${t('cache')}</i><b>${fmtNum(cacheHit)}</b></span></span>`
}
// ★ 删除会话弹窗：返回 'cancel' | 'chat' | 'purge'
function askDeleteSession(title, workspace) {
 return new Promise((resolve) => {
  const info = $('del-modal-info')
  info.textContent = `${t('delete')}：${title || '(untitled)'}${workspace ? `\n${t('workspace')}${workspace}` : ''}`
  $('del-modal').classList.remove('hidden')
  const done = (v) => { $('del-modal').classList.add('hidden'); resolve(v) }
  $('btn-del-cancel').onclick = () => done('cancel')
  $('btn-del-chat').onclick = () => done('chat')
  $('btn-del-purge').onclick = () => done('purge')
 })
}
// ★ 显示层移除工具调用原文（```tool 块）。完整原文仍保存在会话里供模型使用
function stripToolFences(s) {
 const str = String(s || '')
 if (!str.includes('```tool')) return str
 let out = str.replace(/```tool[\s\S]*?```/g, '')
 const open = out.lastIndexOf('```tool')
 if (open !== -1) out = out.slice(0, open)
 return out.replace(/\n{3,}/g, '\n\n').trim()
}
// ★ 流式文本：累计原文，只把去除工具块后的内容显示出来
const streamRaw = new WeakMap()
function appendStreamText(el, text) {
 if (!el) return
 const raw = (streamRaw.get(el) || '') + text
 streamRaw.set(el, raw)
 el.textContent = stripToolFences(raw)
}
// ★ 推理等级滑块（拖动调节；等级越高动画越炫）
const EFFORT_LEVELS = [['none', '关闭'], ['low', '低'], ['default', '默认'], ['high', '高'], ['max', '最大']]
function effortIdxOf(v) { const i = EFFORT_LEVELS.findIndex(([x]) => x === v); return i >= 0 ? i : 1 }
function setEffortVisual(id, value) {
 const el = $(id)
 if (!el) return
 const i = effortIdxOf(value)
 const pct = (i / (EFFORT_LEVELS.length - 1)) * 100
 el.dataset.lv = String(i)
 el.style.setProperty('--ec-x', pct + '%')
 el.querySelector('.ec-fill').style.width = pct + '%'
 el.querySelector('.ec-knob').style.left = pct + '%'
 el.querySelector('.ec-label').textContent = EFFORT_LEVELS[i][1]
}
function setupEffortControl(id, getValue, onPick) {
 const el = $(id)
 if (!el) return
 setEffortVisual(id, getValue())
 const pick = (clientX) => {
  const r = el.querySelector('.ec-track').getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
  const i = Math.round(pct * (EFFORT_LEVELS.length - 1))
  setEffortVisual(id, EFFORT_LEVELS[i][0])
  return EFFORT_LEVELS[i][0]
 }
 let dragging = false
 el.addEventListener('pointerdown', (e) => { dragging = true; try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ } pick(e.clientX) })
 el.addEventListener('pointermove', (e) => { if (dragging) pick(e.clientX) })
 el.addEventListener('pointerup', async (e) => {
  if (!dragging) return
  dragging = false
  const v = pick(e.clientX)
  try { await onPick(v) } catch { /* ignore */ }
 })
 el.addEventListener('pointercancel', () => { dragging = false })
}
// ★ 一键到底：滚动容器 + 浮动按钮（有内容且不在底部时显示）
function setupToBottom(streamId, btnId) {
 const stream = $(streamId), btn = $(btnId)
 if (!stream || !btn) return
 const upd = () => btn.classList.toggle('hidden', stream.scrollHeight - stream.scrollTop - stream.clientHeight < 60)
 stream.addEventListener('scroll', upd, { passive: true })
 btn.onclick = () => {
  // ★ 直接用即时滚动：部分环境（无 GPU/Electron 隐藏窗口）不支持 behavior:'smooth'
  stream.scrollTop = stream.scrollHeight
  setTimeout(upd, 100)
 }
 try { new MutationObserver(upd).observe(stream, { childList: true, subtree: true }) } catch { /* ignore */ }
 upd()
}
function steerBox(message, agent) {
 const el = document.createElement('div')
 el.className = 'steer-box'
 el.dataset.agent = agent
  el.innerHTML = `<b>${t('steerTitle')} · ${esc(roleLabel(agent))}</b><div>${esc(message)}</div>`
 return el
}

/* ══════════════ UI 外观（主题/强调色/字体） ══════════════ */
 function applyUi() {
  const ui = state.settings.ui || {}
  const theme = ui.theme || 'dark'
  const sysLight = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
  document.body.classList.toggle('theme-light', theme === 'light' || (theme === 'system' && sysLight))
  // ★ 思维链 / 工具使用情况：可选择显示或隐藏（默认显示）
  document.body.classList.toggle('hide-reasoning', ui.showReasoning === false)
  document.body.classList.toggle('hide-tools', ui.showTools === false)
  if (ui.accent) document.documentElement.style.setProperty('--accent', ui.accent)
  document.documentElement.style.setProperty('--user-bubble', ui.userColor || '#3b82f6')
 const fs = Math.max(10, Math.min(35, Number(ui.fontSize) || 13))
 document.documentElement.style.setProperty('--font-size', fs + 'px')
 // ★ 界面间距与团队输入框位置（设置页可调）
 document.body.dataset.spacing = ui.spacing || 'normal'
 document.body.classList.toggle('team-input-bottom', (ui.teamInputPos || 'bottom') === 'bottom')
}
function renderSettings() {
 const ui = state.settings.ui || {}
 $('set-theme').value = ui.theme || 'dark'
 $('set-accent').value = ui.accent || '#2f9e8f'
 if ($('set-user-color')) $('set-user-color').value = ui.userColor || '#3b82f6'
 if ($('set-show-reasoning')) $('set-show-reasoning').checked = ui.showReasoning !== false
 if ($('set-show-tools')) $('set-show-tools').checked = ui.showTools !== false
 $('set-font').value = Number(ui.fontSize) || 13
 $('set-font-val').textContent = (Number(ui.fontSize) || 13) + 'px'
 $('set-default-perm').value = state.settings.defaultPermission || 'modify'
 $('set-effort').value = state.settings.reasoningEffort || 'low'
 $('set-spacing').value = ui.spacing || 'normal'
 $('set-teampos').value = ui.teamInputPos || 'bottom'
 $('update-current').textContent = 'v' + APP_VERSION
 $('set-update-repo').value = state.settings.updateRepo || ''
  $('set-update-branch').value = state.settings.updateBranch || 'main'
  renderSchedules() // ★ 定时任务列表
  renderKb() // ★ 本地知识库状态
 // ★ 工具调用限制（0=无限、-1=禁止、custom=自定义）
 const tl = state.settings.toolLimits || {}
 for (const [key, selId, numId] of [['chat', 'set-limit-chat', 'set-limit-chat-n'], ['team', 'set-limit-team', 'set-limit-team-n'], ['roleChat', 'set-limit-rolechat', 'set-limit-rolechat-n']]) {
  const sel = $(selId), num = $(numId)
  if (!sel || !num) continue
  sel.innerHTML = `<option value="0">${t('tlUnlimited')}</option><option value="-1">${t('tlOff')}</option><option value="custom">${t('tlCustom')}</option>`
  const v = Number(tl[key] ?? 0)
  if (v === -1) sel.value = '-1'
  else if (v > 0) { sel.value = 'custom'; num.value = v }
  else sel.value = '0'
  const upd = () => num.classList.toggle('hidden', sel.value !== 'custom')
  sel.onchange = () => { upd(); saveToolLimit(key, sel, num) }
  num.onchange = () => saveToolLimit(key, sel, num)
  upd()
 }
 $('changelog').innerHTML = `<div class="dim small" style="margin-bottom:6px">v${APP_VERSION}</div>` + CHANGELOG.map(([v, date, items]) => `
 <div class="cl-block"><div class="cl-head"><b>${esc(v)}</b><span class="dim small">${esc(date)}</span></div>
 <ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')
 renderMobileCard()
}
// ★ TAT：设置页「手机连接」面板（局域网监听 / 配对码+二维码 / 设备管理）
async function renderMobileCard() {
 const tgl = $('set-lan-listen')
 if (!tgl) return
 const info = await api('GET', '/api/net/info').catch(() => ({}))
 tgl.checked = !!state.settings.lanListen
 // ★ 优先真实网卡（WLAN/以太网），排除虚拟网卡（VirtualBox/VMware/VPN 等）
 const NOISY = /virtualbox|vmware|hyper-v|radmin|loopback|vpn|zerotier|tailscale|hamachi|docker/i
  const ips = (info.ips || []).filter((x) => x.family === 'IPv4')
  const cands = ips.filter((x) => !NOISY.test(x.iface || ''))
  $('mob-ips').textContent = ips.length ? `本机地址：${ips.map((x) => `${x.iface || ''} ${x.address}`.trim()).join('、')}（端口 ${info.port || 3411}）` : '未检测到局域网地址'
  // ★ Orca 要点③：IPv6 地址显示（全局地址可直连；fe80 链路本地需带区域且不便使用，故过滤）
  const ipv6s = (info.ips || []).filter((x) => x.family === 'IPv6' && !/^fe80/i.test(x.address) && x.address !== '::1').map((x) => x.address.split('%')[0])
  const ipv6El = $('mob-ipv6'), ipv6Btn = $('btn-mob-copy-ipv6')
  renderMobileCard._ipv6 = ipv6s[0] ? `http://[${ipv6s[0]}]:${info.port || 3411}` : ''
  if (ipv6El) ipv6El.textContent = ipv6s.length ? `IPv6：${ipv6s.join('、')}（端口 ${info.port || 3411}，浏览器访问需带方括号）` : 'IPv6：未检测到可用全局地址'
  if (ipv6Btn) {
    ipv6Btn.classList.toggle('hidden', !renderMobileCard._ipv6)
    ipv6Btn.onclick = async () => {
      const url = renderMobileCard._ipv6
      if (!url) return
      try { await navigator.clipboard.writeText(url); ipv6Btn.textContent = '已复制 ✓'; setTimeout(() => { ipv6Btn.textContent = '复制 IPv6 地址' }, 1500) }
      catch { $('mob-pair-msg').textContent = url }
    }
  }
  // ★ Orca 要点①：后台系统通知开关（浏览器需 HTTPS/localhost 才能授权系统通知；否则用标题闪烁）
  const ntf = $('set-notify')
  if (ntf) {
    ntf.checked = localStorage.getItem('oat-notify') === '1'
    ntf.onchange = async () => {
      if (!ntf.checked) { localStorage.setItem('oat-notify', '0'); return }
      try {
        if ('Notification' in window) {
          const p = await Notification.requestPermission()
          localStorage.setItem('oat-notify', p === 'granted' ? '1' : '1') // 未授权也开启：退回标题闪烁
        } else localStorage.setItem('oat-notify', '1')
      } catch { localStorage.setItem('oat-notify', '1') }
    }
  }
 $('btn-mob-restart').classList.toggle('hidden', state.settings.lanListen === info.listeningAll)
 tgl.onchange = async () => {
  state.settings.lanListen = tgl.checked
  await api('PUT', '/api/settings', { lanListen: tgl.checked })
  renderMobileCard()
 }
 $('btn-mob-restart').onclick = async () => {
  if (!confirm('重启服务？正在运行的团队任务会中断。')) return
  await api('POST', '/api/restart')
  $('mob-pair-msg').textContent = '正在重启…几秒后刷新页面'
 }
 $('btn-mob-pair').onclick = async () => {
  const pc = await api('GET', '/api/pair/new')
  if (!pc.ok) { $('mob-pair-msg').textContent = pc.error || '生成失败'; return }
  $('mob-pair-msg').textContent = ''
  $('mob-pair-box').classList.remove('hidden')
  $('mob-pin').textContent = pc.code
  const pool = cands.length ? cands : ips
  // ★ 优先默认路由主 IP（真正联网的网卡），保证手机扫码地址可用
  const privateRe = /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./
  const ipv4 = (info.primary && privateRe.test(info.primary) ? info.primary : null) || pool.map((x) => x.address).find(privateRe) || pool[0]?.address || '127.0.0.1'
  const url = `http://${ipv4}:${info.port || 3411}/?pair=${pc.token}`
  try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('mob-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 }) } catch { $('mob-qr').innerHTML = '' }
  $('mob-urls').textContent = url
  clearInterval(renderMobileCard._timer)
  const tick = () => {
   const left = Math.max(0, Math.round((pc.expires - Date.now()) / 1000))
   $('mob-pair-exp').textContent = left > 0 ? `剩余有效时间 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '配对码已过期，请重新生成'
   if (left <= 0) clearInterval(renderMobileCard._timer)
  }
  tick(); renderMobileCard._timer = setInterval(tick, 1000)
 }
 const dv = await api('GET', '/api/devices').catch(() => ({}))
 const list = dv.devices || []
 $('mob-device-list').innerHTML = list.length ? list.map((d) => `
 <div class="mob-dev-row" data-id="${d.id}">
 <b>${esc(d.name)}</b>
 <select class="mini-sel mob-perm"><option value="read">只读</option><option value="operate">可对话/操作</option><option value="approve">可批准</option><option value="config">可配置</option></select>
 <span class="dim small">${d.lastSeen ? '最近在线 ' + new Date(d.lastSeen).toLocaleString() : '从未在线'}</span>
 <button class="btn danger tiny mob-revoke">撤销</button>
 </div>`).join('') : t('mobNoDevices')
 $('mob-device-list').querySelectorAll('.mob-dev-row').forEach((row) => {
  const id = row.dataset.id
  const sel = row.querySelector('.mob-perm')
  sel.value = list.find((x) => x.id === id)?.perm || 'approve'
  sel.onchange = () => api('PUT', '/api/devices/' + id, { perm: sel.value }).then(() => renderMobileCard())
  row.querySelector('.mob-revoke').onclick = async () => {
   if (!confirm('撤销该设备？手机将立即失去访问权限。')) return
   await api('DELETE', '/api/devices/' + id)
   renderMobileCard()
  }
 })
 // ★ EasyTier 组网（检测/下载/启动/停止）
 const et = await api('GET', '/api/easytier/status').catch(() => ({}))
 const ecfg = { ...(et.config || {}), ...(state.settings.easytier || {}) }
 if ($('et-name')) {
  $('et-name').value = ecfg.networkName || ''
  $('et-secret').value = ecfg.networkSecret || ''
  $('et-ip').value = ecfg.virtualIp || '10.126.126.1'
  const saveEt = async () => {
   state.settings.easytier = { ...ecfg, networkName: $('et-name').value.trim(), networkSecret: $('et-secret').value.trim(), virtualIp: $('et-ip').value.trim() }
   await api('PUT', '/api/settings', { easytier: state.settings.easytier })
  }
  $('et-name').onchange = saveEt; $('et-secret').onchange = saveEt; $('et-ip').onchange = saveEt
  $('et-msg').textContent = `${et.installed ? '已安装' : '未安装'} · ${et.running ? '运行中' : '未运行'}`
  $('btn-et-download').onclick = async () => {
   $('et-msg').textContent = '正在从官方 Release 下载（视网络情况可能需几分钟）…'
   const r = await api('POST', '/api/easytier/download')
   $('et-msg').textContent = r.ok ? r.message : (r.error || '下载失败')
   renderMobileCard()
  }
  $('btn-et-start').onclick = async () => {
   await saveEt()
   $('et-msg').textContent = '正在请求启动（请在电脑上确认管理员授权）…'
   const r = await api('POST', '/api/easytier/start')
   $('et-msg').textContent = r.ok ? (r.message || '已启动') : (r.error || '启动失败')
   setTimeout(renderMobileCard, 3000)
  }
  $('btn-et-stop').onclick = async () => {
   const r = await api('POST', '/api/easytier/stop')
   $('et-msg').textContent = r.running ? '仍在运行' : '已停止'
  }
 }
 // ★ 防火墙提示（复制命令）
 if ($('btn-fw-hint')) $('btn-fw-hint').onclick = async () => {
  const cmd = `netsh advfirewall firewall add rule name="Open Agent Team" dir=in action=allow protocol=TCP localport=${info.port || 3411}`
  try { await navigator.clipboard.writeText(cmd) } catch { /* ignore */ }
  alert('手机连不上时，请检查 Windows 防火墙：\n\n① 首次启动时若弹出"允许访问"提示，请勾选「专用网络」并允许；\n② 或右键"以管理员身份"运行命令提示符，粘贴并执行（已复制到剪贴板）：\n\n' + cmd)
 }
}
async function saveToolLimit(key, sel, num) {
 const v = sel.value === 'custom' ? Math.max(1, Math.min(999, Number(num.value) || 50)) : Number(sel.value)
 if (sel.value === 'custom') num.value = v
 state.settings.toolLimits = { ...(state.settings.toolLimits || {}), [key]: v }
 await api('PUT', '/api/settings', { toolLimits: state.settings.toolLimits })
}
async function saveUi(patch) {
 state.settings.ui = { ...(state.settings.ui || {}), ...patch }
 applyUi()
 await api('PUT', '/api/settings', { ui: state.settings.ui })
}

/* ══════════════ 步骤确认卡片 ══════════════ */
const CONF_CAT = { read: '读取', write: '写入文件', exec: '执行命令', other: '外部调用' }
function appendConfirmCard(container, conf) {
 const el = document.createElement('div')
 el.className = 'confirm-box'
 el.innerHTML = `<div class="cf-head"> ${t('confirmNeed')} · <b>${esc(conf.tool)}</b> <span class="badge">${esc(CONF_CAT[conf.category] || conf.category)}</span></div>
 <div class="cf-detail dim small">${esc(conf.detail || '')}</div>
 ${conf.preview ? `<pre class="cf-preview">${esc(String(conf.preview).slice(0, 400))}</pre>` : ''}
 <div class="cf-actions">
 <button class="btn primary tiny" data-d="once"> ${t('confirmOnce')}</button>
 <button class="btn ghost tiny" data-d="all"> ${t('confirmAll')}</button>
 <button class="btn danger tiny" data-d="deny"> ${t('confirmDeny')}</button>
 </div>`
 container.appendChild(el)
 container.scrollTop = container.scrollHeight
 el.querySelectorAll('button[data-d]').forEach((b) => {
 b.onclick = async () => {
 const decision = b.dataset.d
 await api('POST', '/api/confirm', { id: conf.id, decision })
 el.classList.add(decision === 'deny' ? 'denied' : 'done')
 el.querySelector('.cf-actions').innerHTML = `<span class="small">${decision === 'deny' ? ' ' + t('confirmDenied') : (decision === 'all' ? ' ' + t('confirmAllDone') : ' ' + t('confirmDone'))}</span>`
 }
 })
 return el
}
// ★ 权限申请卡片（AI 主动申请工具权限：允许一次 / 本任务全部允许 / 拒绝）
function appendPermReqCard(container, ev, agent) {
 const p = ev.permreq || ev
 const el = document.createElement('div')
 el.className = 'confirm-box permreq-box'
 if (agent && agent !== 'chat') el.dataset.agent = agent
 el.innerHTML = `<div class="cf-head"><b>${t('permTitle')}</b> · <b>${esc(p.tool)}</b> <span class="badge">${esc(CONF_CAT[p.category] || p.category || '')}</span></div>
 <div class="cf-detail dim small">${esc(p.reason || '')}</div>
 <div class="cf-actions">
 <button class="btn primary tiny" data-d="once">${t('permOnce')}</button>
 <button class="btn ghost tiny" data-d="all">${t('permAll')}</button>
 <button class="btn danger tiny" data-d="deny">${t('permDeny')}</button>
 </div>`
 container.appendChild(el)
 container.scrollTop = container.scrollHeight
 el.querySelectorAll('button[data-d]').forEach((b) => {
  b.onclick = async () => {
   await api('POST', '/api/permreq', { id: p.id, decision: b.dataset.d })
   el.classList.add(b.dataset.d === 'deny' ? 'denied' : 'done')
   el.querySelector('.cf-actions').innerHTML = `<span class="small">${b.dataset.d === 'deny' ? t('permDenied') : t('permGranted')}</span>`
  }
 })
 return el
}
// ★ 系统提示条（工具次数上限/禁用等）
function appendNotice(container, text, agent) {
 const el = document.createElement('div')
 el.className = 'notice-box'
 if (agent && agent !== 'chat') el.dataset.agent = agent
 el.textContent = text
 container.appendChild(el)
 container.scrollTop = container.scrollHeight
 return el
}
const fmtCost = (c) => (c == null ? '--' : `¥${Number(c).toFixed(4)}`)
const fmtNum = (n) =>Number(n || 0).toLocaleString()
function fmtRemain(iso) {
 if (!iso) return ''
 const ms = new Date(iso).getTime() - Date.now()
 if (!isFinite(ms)) return ''
 if (ms <= 0) return '即将重置'
 const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
 if (h >= 24) return `${Math.floor(h / 24)}天${h % 24}小时`
 if (h >= 1) return `${h}小时${m}分`
 return `${m}分钟`
}
function applyI18n() {
 document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n) })
 document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh) })
 document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en'
}
function groupedModelSelect(provider, selected, { chatOnly = false, filterTags = null } = {}) {
 if (!provider) return '<option value="">--</option>'
 const groups = {}
 for (const m of provider.models || []) {
 if (chatOnly && !isChatCapable(m)) continue
 if (filterTags && !(m.tags || []).some((x) =>filterTags.includes(x))) continue
 ;(groups[primaryGroup(m.tags)] ||= []).push(m)
 }
 let html = ''
 for (const [g, list] of Object.entries(groups)) {
 html += `<optgroup label="${esc(g)}（${list.length}）">`
 for (const m of list) html += `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.id)}</option>`
 html += '</optgroup>'
 }
 return html || '<option value="">--</option>'
}
const modelTags = (p, id) => (p?.models || []).find((m) =>m.id === id)?.tags || []

/* ══════════════ 余额 / 订阅 ══════════════ */
function balanceText(p) {
 const b = state.balances[p.id]
 if (!b) return { text: '--', cls: 'dim' }
 if (!b.ok) return { text: `${t('failure')}: ${b.note || ''}`, cls: 'err' }
 if (b.kind === 'subscription' && Array.isArray(b.windows)) return { text: b.windows.map((w) => `${w.label} ${w.usedPercent ?? '?'}%`).join(' · '), cls: 'ok' }
 if (b.kind === 'balance' && b.amount != null) return { text: `${b.currency === 'USD' ? '$' : '¥'}${Number(b.amount).toFixed(2)}`, cls: Number(b.amount) <= 5 ? 'warn' : 'ok' }
 if (b.kind === 'quota' && Array.isArray(b.windows)) return { text: b.windows.map((w) => `${w.label} ${w.usedPercent ?? '?'}%`).join(' · '), cls: 'ok' }
 return { text: b.note || '', cls: 'dim' }
}
function subscriptionHTML(p) {
 const b = state.balances[p.id]
 if (!b || !b.ok || b.kind !== 'subscription' || !Array.isArray(b.windows)) return ''
 return `<div class="sub-rows">` + b.windows.map((w) => `<div class="sub-row">
 <span class="dim small">${esc(w.label)}</span>
 <div class="bar"><i style="width:${Math.min(100, Number(w.usedPercent) || 0)}%"></i></div>
 <span class="small">${w.usedPercent ?? '-'}%${w.resetsAt ? ` · ${esc(fmtRemain(w.resetsAt))}后重置` : ''}</span>
 </div>`).join('') + `</div>`
}

/* ══════════════ 侧栏（API + 会话树） ══════════════ */
function renderSidebar() {
 $('provider-count').textContent = state.providers.length
 const list = $('provider-list')
 list.innerHTML = state.providers.length ? state.providers.map((p) => {
 const bt = balanceText(p)
 const expanded = state.expanded.has(p.id)
 const list2 = state.sessions.filter((s) =>s.providerId === p.id && (s.kind || 'chat') !== 'team' && (state.showArchived || !s.archived))
 const sessionsHTML = expanded ? `<div class="sessions-block">
 <button class="btn ghost tiny new-session" data-pid="${p.id}">＋ ${t('newSession')}</button>
 ${list2.map((s) => `<div class="session-item ${s.id === state.activeSession?.id ? 'active' : ''} ${s.archived ? 'archived' : ''}" data-sid="${s.id}">
 <div class="s-title">${esc(s.title || '(untitled)')}</div>
 <div class="s-meta dim small">${new Date(s.updatedAt).toLocaleDateString()} · ${s.messageCount} · ${fmtCost(s.cost)}</div>
 <span class="sess-tip ctx-tip">
 <span class="ctx-tip-row"><i>${t('cost')}</i><b>${fmtCost(s.cost)}</b></span>
 <span class="ctx-tip-row"><i>${t('usageRate')}</i><b>${s.contextLimit ? Math.min(999, Math.round((s.lastPrompt || 0) / s.contextLimit * 100)) + '%' : '--'}</b></span>
 <span class="ctx-tip-row"><i>Token</i><b>${fmtNum(s.lastPrompt)}${s.contextLimit ? '/' + fmtNum(s.contextLimit) : ''}</b></span>
 <span class="ctx-tip-row"><i>${t('cache')}</i><b>${fmtNum(s.cacheHitTokens)}</b></span>
 </span>
 <span class="s-actions">
 <button class="mini" data-act="rename" data-sid="${s.id}" title="rename">✎</button>
  <button class="mini" data-act="archive" data-sid="${s.id}" title="archive">${s.archived ? '↩' : '▣'}</button>
 <button class="mini" data-act="export" data-sid="${s.id}" title="export">⤓</button>
 <button class="mini" data-act="del" data-sid="${s.id}" title="delete">✕</button>
 </span>
 </div>`).join('') || `<div class="dim small" style="padding:4px 8px">${t('noSessions')}</div>`}
 </div>` : ''
 return `<div class="provider-card ${p.id === state.selectedId ? 'selected' : ''}" data-id="${p.id}">
 <div class="name"><span class="exp">${expanded ? '▾' : '▸'}</span> ${esc(p.name)} ${p.hasKey ? '' : `<span class="badge">${t('noKey')}</span>`}</div>
 <div class="meta">${esc(p.baseUrl || '')}</div>
 <div class="badges">${(p.capabilities || []).map((c) => `<span class="badge">${esc(c)}</span>`).join('')}<span class="badge">${t('models')} ${(p.models || []).filter(isChatCapable).length}</span></div>
 <div class="balance-line"><span class="amount ${bt.cls}">${esc(bt.text)}</span></div>
 ${subscriptionHTML(p)}
 </div>${sessionsHTML}`
 }).join('') : `<div class="dim small">${t('addApi')}</div>`

 // 事件绑定
 list.querySelectorAll('.provider-card').forEach((el) => {
 el.onclick = () => {
 const id = el.dataset.id
 const p = providerById(id)
 state.selectedId = id
 // 展开当前 API 的会话并自动折叠其它 API
 if (state.expanded.has(id)) state.expanded.delete(id)
 else { state.expanded = new Set([id]); if (p?.models?.length) $('chat-model').innerHTML = groupedModelSelect(p, null, { chatOnly: true }) }
 renderSidebar(); renderChatToolbar()
 }
 })
 list.querySelectorAll('.new-session').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); openSessionModal(b.dataset.pid) } })
 list.querySelectorAll('.session-item').forEach((el) => {
 el.onclick = () =>openSession(el.dataset.sid)
 el.querySelectorAll('.mini').forEach((m) => {
 m.onclick = async (e) => {
 e.stopPropagation()
 const sid = m.dataset.sid, act = m.dataset.act
 if (act === 'rename') { const s = state.sessions.find((x) =>x.id === sid); const v = prompt('Title', s?.title || ''); if (v != null) await api('PUT', `/api/sessions/${sid}`, { title: v }) }
 else if (act === 'archive') { const s = state.sessions.find((x) =>x.id === sid); await api('PUT', `/api/sessions/${sid}`, { archived: !s?.archived }) }
 else if (act === 'export') { window.open(`/api/sessions/${sid}/export`, '_blank') ; return }
  else if (act === 'del') {
   const sDel = state.sessions.find((x) => x.id === sid)
   const choice = await askDeleteSession(sDel?.title, sDel?.workspace)
   if (choice === 'cancel') return
   await api('DELETE', `/api/sessions/${sid}${choice === 'purge' ? '?purge=1' : ''}`)
   if (state.activeSession?.id === sid) { state.activeSession = null; localStorage.removeItem('oat-last-session'); renderChatMessages() }
  }
  await refreshSessions()
 }
 })
 })
}
function renderChatToolbar() {
 const ps = $('chat-provider')
 ps.innerHTML = state.providers.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') || '<option value="">--</option>'
 const sess = state.activeSession
 if (sess?.providerId) ps.value = sess.providerId
 else if (state.selectedId) ps.value = state.selectedId
 const p = providerById(ps.value)
 $('chat-model').innerHTML = groupedModelSelect(p, sess?.model, { chatOnly: true })
 const upd = () => { $('chat-model-tags').innerHTML = modelTags(providerById(ps.value), $('chat-model').value).map((x) => `<span class="badge">${esc(x)}</span>`).join('') }
 upd()
 // 工具开关 & 当前工作区提示
 if ($('chat-tools')) $('chat-tools').checked = state.settings.chatTools !== false
 if ($('chat-ws')) $('chat-ws').textContent = state.activeWorkspace ? ` ${state.activeWorkspace}` : ''
 // 会话权限显示
  if ($('chat-perm')) $('chat-perm').value = sess?.permission || state.settings.defaultPermission || 'modify'
  setEffortVisual('chat-effort', sess?.effort || state.settings.reasoningEffort || 'default')
  ps.onchange = async () => { state.selectedId = ps.value; if (sess) { await api('PUT', `/api/sessions/${sess.id}`, { providerId: ps.value }); await refreshSessions() } renderChatToolbar() }
 $('chat-model').onchange = async () => { upd(); if (sess) { await api('PUT', `/api/sessions/${sess.id}`, { model: $('chat-model').value }); await refreshSessions() } }
}
function renderChatMessages() {
 const box = $('chat-messages')
 const sess = state.activeSession
 if (!sess) { box.innerHTML = `<div class="empty-tip">${t('chatEmpty')}</div>`; renderChatRail(); return }
 box.innerHTML = ''
 let midx = 0
 for (const m of sess.messages || []) {
 // 工具消息：渲染为工具盒（历史回放）
 if (m.role === 'tool') {
 const el = document.createElement('div')
 el.className = 'tool-box'
 el.dataset.idx = midx++
  el.innerHTML = `<b>${esc(t('toolLabel'))} · ${esc(m.tool || 'tool')}</b> <span class="dim">${esc(m.detail || '')}</span><pre>${esc(String(m.content || '').slice(0, 3000))}</pre>`
 box.appendChild(el)
 appendMediaCard(box, m.content)
 continue
 }
  const shownText = typeof m.content === 'string' ? (m.role === 'assistant' ? stripToolFences(m.content) : m.content) : '[image]'
  const contentEl = appendMsg(m.role, shownText, m, midx++)
 // 持久化的思考过程：折叠展示
 if (m.role === 'assistant' && m.reasoning) {
 const el = document.createElement('details')
 el.className = 'reasoning'
 el.innerHTML = `<summary>${t('thoughtDone')}（${m.reasoning.length}）</summary><div class="reasoning-body"></div>`
 el.querySelector('.reasoning-body').textContent = m.reasoning
 contentEl.parentElement.parentElement.insertBefore(el, contentEl.parentElement)
 }
 }
 if (!sess.messages?.length) box.innerHTML = `<div class="empty-tip">${t('chatEmpty')}</div>`
 box.scrollTop = box.scrollHeight
 renderChatRail()
}
/* 右侧历史栏：本会话消息（跳转/撤回/编辑）+ 历史会话 */
function renderChatRail() {
 const list = $('chat-msg-list'); const sl = $('chat-session-list')
 if (!list || !sl) return
 const sess = state.activeSession
 const msgs = sess?.messages || []
 list.innerHTML = msgs.length ? msgs.map((m, i) => {
 if (m.role === 'tool') return `<div class="rail-item tool" data-idx="${i}"> <span class="rail-text dim small">${esc(m.tool || '')} ${esc(String(m.detail || '').slice(0, 26))}</span></div>`
 const text = typeof m.content === 'string' ? m.content : '[image]'
 const who = m.role === 'user' ? '' : ''
 const btns = m.role === 'user' ? `<span class="rail-acts"><button class="mini" data-act="wd" data-i="${i}" title="${t('withdraw')}">↺</button><button class="mini" data-act="ed" data-i="${i}" title="${t('reEdit')}">✎</button></span>` : ''
 return `<div class="rail-item ${m.role}" data-idx="${i}">${who} <span class="rail-text">${esc(text.slice(0, 60))}</span>${btns}</div>`
 }).join('') : `<div class="dim small" style="padding:4px 8px">--</div>`
 list.querySelectorAll('.rail-item').forEach((el) => {
 el.onclick = (e) => {
 if (e.target.closest('button')) return
 const target = $('chat-messages').querySelector(`[data-idx="${el.dataset.idx}"]`)
 if (target) { target.scrollIntoView({ block: 'center' }); target.classList.add('flash'); setTimeout(() =>target.classList.remove('flash'), 1200) }
 }
 })
 list.querySelectorAll('button[data-act]').forEach((b) => {
 b.onclick = async (e) => {
 e.stopPropagation()
 const i = Number(b.dataset.i)
 const content = typeof msgs[i]?.content === 'string' ? msgs[i].content : ''
 if (b.dataset.act === 'wd') {
 if (!confirm(`${t('withdraw')}：${content.slice(0, 30)}…?`)) return
 await api('POST', `/api/sessions/${sess.id}/truncate`, { index: i })
 await reloadActiveSession()
 } else {
 await api('POST', `/api/sessions/${sess.id}/truncate`, { index: i })
 await reloadActiveSession()
 $('chat-text').value = content
 $('chat-text').focus()
 onChatInput()
 }
 }
 })
 const others = state.sessions.filter((s) => (s.kind || 'chat') !== 'team')
 sl.innerHTML = others.length ? others.map((s) => `<div class="rail-item sess ${s.id === sess?.id ? 'active' : ''}" data-sid="${s.id}">
 <div class="rail-text"><b>${esc(s.title || '(untitled)')}</b></div>
 <div class="dim small">${new Date(s.updatedAt).toLocaleDateString()} · ${s.messageCount} · ${fmtCost(s.cost)}</div>
 </div>`).join('') : `<div class="dim small" style="padding:4px 8px">${t('noSessions')}</div>`
 sl.querySelectorAll('.rail-item.sess').forEach((el) => { el.onclick = () =>openSession(el.dataset.sid) })
}

/* ══════════════ 会话 ══════════════ */
async function refreshSessions() {
 const r = await api('GET', '/api/sessions')
 if (r.ok) state.sessions = r.sessions
 renderSidebar()
}
function openSessionModal(pid, kind = 'chat') {
 state.nsKind = kind
 const modal = $('session-modal')
 const h2 = modal.querySelector('h2')
 if (h2) h2.textContent = t(kind === 'team' ? 'newTeamSession' : 'newSession')
 const ps = $('ns-provider')
 ps.innerHTML = state.providers.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
 const refreshModels = () => { $('ns-model').innerHTML = groupedModelSelect(providerById(ps.value), null, { chatOnly: true }) }
 ps.onchange = refreshModels; refreshModels()
 $('ns-workspace').innerHTML = state.workspaces.map((w) => `<option value="${esc(w.path)}" ${w.path === state.activeWorkspace ? 'selected' : ''}>${esc(w.path)}</option>`).join('') || `<option value="">${esc(state.activeWorkspace)}</option>`
 $('ns-title').value = ''
 $('ns-msg').textContent = ''
 modal.classList.remove('hidden')
}
async function createSessionFromModal() {
 const body = { kind: state.nsKind || 'chat', providerId: $('ns-provider').value, model: $('ns-model').value, workspace: $('ns-workspace').value || state.activeWorkspace, title: $('ns-title').value.trim() }
 if (body.kind === 'chat') body.permission = state.pendingPerm || state.settings.defaultPermission || 'modify'
 const r = await api('POST', '/api/sessions', body)
 if (!r.ok) { $('ns-msg').textContent = r.error || 'fail'; return }
 $('session-modal').classList.add('hidden')
 await refreshSessions()
 if (body.kind === 'team') {
 state.teamSessionId = r.session.id
 await refreshTeamSessions(r.session.id)
 renderTeamSession()
 switchView('team')
 return
 }
 state.expanded = new Set([body.providerId])
 state.selectedId = body.providerId
 await openSession(r.session.id)
}
async function openSession(id) {
 const r = await api('GET', `/api/sessions/${id}`)
 if (!r.ok) return
 state.activeSession = r.session
 state.selectedId = r.session.providerId
 localStorage.setItem('oat-last-session', id)
 // 会话自带工作区：自动切换
 if (r.session.workspace && r.session.workspace !== state.activeWorkspace) {
 await api('PUT', '/api/workspaces/active', { path: r.session.workspace })
 await refreshWorkspaces(); refreshWorkspace(); refreshArtGallery()
 }
 renderSidebar(); renderChatToolbar(); renderChatMessages()
 switchView('chat')
}
async function reloadActiveSession() {
 if (!state.activeSession) return
 const r = await api('GET', `/api/sessions/${state.activeSession.id}`)
 if (r.ok) { state.activeSession = r.session; renderChatMessages() }
 await refreshSessions()
}

/* ══════════════ 对话 ══════════════ */
function appendMsg(role, content, meta, idx) {
 const box = $('chat-messages')
 box.querySelector('.empty-tip')?.remove()
 const el = document.createElement('div')
 el.className = `msg ${role}`
 if (idx != null) el.dataset.idx = idx
 el.innerHTML = `<div class="who">${role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'SYS'}</div><span class="content"></span>`
 el.querySelector('.content').textContent = content
 if (meta?.usage) {
  const hit = meta.usage.prompt_cache_hit_tokens || 0
  // ★ 历史消息同样显示环形占用指示器（悬停：成本/使用率/Token）
  const metaEl = document.createElement('div')
  metaEl.className = 'msg-meta dim small'
  const pct = meta.contextLimit ? Math.min(999, Math.round((meta.usage.prompt_tokens || 0) / meta.contextLimit * 100)) : null
  if (pct != null) setCtxBadge(metaEl, pct, meta.cost, (meta.usage.prompt_tokens || 0) + (meta.usage.completion_tokens || 0), hit)
  metaEl.insertAdjacentHTML('beforeend', ` <span>${t('tokens')} ${fmtNum(meta.usage.prompt_tokens)}/${fmtNum(meta.usage.completion_tokens)} · ${t('cache')} ${fmtNum(hit)} · ${t('cost')} ${fmtCost(meta.cost)}</span>`)
  el.appendChild(metaEl)
 }
 box.appendChild(el); box.scrollTop = box.scrollHeight
 return el.querySelector('.content')
}
/* ══════════════ ★ 拖拽上传（对话 / 团队任务通用） ══════════════ */
function fileToBase64(file) {
 return new Promise((resolve, reject) => {
  const fr = new FileReader()
  fr.onload = () => resolve(String(fr.result).split(',')[1] || '')
  fr.onerror = () => reject(fr.error)
  fr.readAsDataURL(file)
 })
}
async function uploadFiles(files, insertTarget) {
 for (const f of files) {
  try {
   const data = await fileToBase64(f)
   const r = await api('POST', '/api/upload', { name: f.name, data })
   if (!r.ok) continue
   const ta = insertTarget
   const mention = `[文件已上传: ${r.path}] `
   if (ta) ta.value = (ta.value ? ta.value + ' ' : '') + mention
   // 单张图片：同时作为对话附件（视觉模型可直接看图）
   if (r.isImage && files.length === 1 && ta === $('chat-text')) {
    const fr = new FileReader()
    fr.onload = () => setChatImage(fr.result, r.name)
    fr.readAsDataURL(f)
   }
  } catch { /* ignore */ }
 }
}
function setupDropzone(el, targetInput) {
 if (!el) return
 let depth = 0
 el.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; el.classList.add('dragging') })
 el.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' })
 el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.classList.remove('dragging') } })
 el.addEventListener('drop', async (e) => {
  e.preventDefault(); depth = 0; el.classList.remove('dragging')
  const files = [...(e.dataTransfer?.files || [])]
  if (!files.length) return
  // ★ targetInput 可以是函数：在拖放时动态决定输入框（如团队任务 vs 角色单独对话）
  const ta = typeof targetInput === 'function' ? targetInput() : targetInput
  await uploadFiles(files, ta)
 })
}

/* ★ 只有用户本来就在底部时才自动滚动——否则会"抢"滚动条（多角色同时输出时无法翻阅） */
function scrollIfNearBottom(el, force) {
 if (!el) return
 const near = el.scrollHeight - el.scrollTop - el.clientHeight < 160
 if (force || near) el.scrollTop = el.scrollHeight
}
/* 思考流批量刷新：推理模型一次可产出数万条增量，逐条更新 DOM 会卡死界面 */
const reasonBuf = { el: null, text: '', timer: null }
function flushReason() {
 if (reasonBuf.el && reasonBuf.text) { reasonBuf.el.textContent += reasonBuf.text; reasonBuf.text = '' }
}
function queueReason(el, text) {
 if (reasonBuf.el !== el) { flushReason(); reasonBuf.el = el }
 reasonBuf.text += text
 if (!reasonBuf.timer) reasonBuf.timer = setTimeout(() => { reasonBuf.timer = null; flushReason() }, 120)
}
function setChatImage(dataUrl, name) {
 state.chatImage = dataUrl
 $('chat-attach-chip').classList.remove('hidden')
 $('chat-attach-chip').innerHTML = ` ${esc(name)} <button class="btn ghost tiny" id="btn-detach">✕</button>`
 $('btn-detach').onclick = () => { state.chatImage = null; $('chat-attach-chip').classList.add('hidden') }
}
async function sendChat() {
 const text = $('chat-text').value.trim()
 if (!text && !state.chatImage) return
 const providerId = $('chat-provider').value, model = $('chat-model').value
 if (!providerId || !model) return alert(t('addApi'))
 // 没有会话则自动创建一个（使用当前工作区 + 默认/待定权限）
 if (!state.activeSession) {
 const cr = await api('POST', '/api/sessions', { providerId, model, workspace: state.activeWorkspace, permission: state.pendingPerm || state.settings.defaultPermission || 'modify' })
 if (cr.ok) { state.activeSession = cr.session; state.expanded = new Set([providerId]); await refreshSessions() }
 }
 const tags = modelTags(providerById(providerId), model)
 const content = state.chatImage && tags.includes('视觉') ? [{ type: 'text', text: text || 'see image' }, { type: 'image_url', image_url: { url: state.chatImage } }] : (text || '')
 $('chat-text').value = ''
 appendMsg('user', text + (state.chatImage ? ' [image]' : ''))
 if (state.activeSession) { state.activeSession.messages.push({ role: 'user', content }) }
 state.chatImage = null; $('chat-attach-chip').classList.add('hidden')
 const tools = $('chat-tools').checked
 const box = $('chat-messages')
 let target = null, thinkBox = null, turn = -1
 const ensureTurn = (j) => {
 if (j.turn != null && j.turn !== turn) { turn = j.turn; target = null; thinkBox = null }
 if (!target) target = appendMsg('assistant', '')
 }
 const ensureReasoning = () => {
 if (!thinkBox) {
 const el = document.createElement('details')
 el.className = 'reasoning'
 el.open = true // 思考时展开实时显示，回答开始时自动收起
 el.innerHTML = `<summary>${t('thinking')}</summary><div class="reasoning-body"></div>`
 target.parentElement.insertBefore(el, target)
 thinkBox = el
 }
 return thinkBox.querySelector('.reasoning-body')
 }
 $('btn-send').disabled = true
 try {
 const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ sessionId: state.activeSession?.id, providerId, model, content, tools }) })
 const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''
 while (true) {
 const { done, value } = await reader.read()
 if (done) break
 buf += dec.decode(value, { stream: true })
 const lines = buf.split('\n'); buf = lines.pop() || ''
 for (const line of lines) {
 const s = line.trim(); if (!s.startsWith('data:')) continue
 try {
 const j = JSON.parse(s.slice(5).trim())
          if (j.confirm) appendConfirmCard(box, j.confirm)
          if (j.permreq) { appendPermReqCard(box, { permreq: j.permreq }, 'chat'); maybeNotify('对话待授权', j.permreq?.tool || '') }
          if (j.notice) appendNotice(box, j.notice)
          if (j.question) { appendQuestionCard(box, j.question, 'chat'); maybeNotify('AI 等待你的回答', j.question?.questions?.[0]?.question || '') }
          if (j.imagereview) appendImageReviewCard(box, j.imagereview)
 if (j.image) setArtCallout({ who: 'AI', ...j.image })
 if (j.reasoning) { ensureTurn(j); const rb = ensureReasoning(); queueReason(rb, j.reasoning); scrollIfNearBottom(box) }
 if (j.delta) {
 ensureTurn(j)
 flushReason()
 if (thinkBox) { thinkBox.open = false; thinkBox.querySelector('summary').textContent = ` ${t('thoughtDone')}（${thinkBox.querySelector('.reasoning-body').textContent.length}）` }
  appendStreamText(target, j.delta)
  scrollIfNearBottom(box)
  }
 if (j.tool) {
 // 工具调用：插入工具盒，后续回复另起气泡
 const el = document.createElement('div')
 el.className = 'tool-box'
 el.innerHTML = `<b>${esc(t('toolLabel'))} · ${esc(j.tool)}</b> <span class="dim">${esc(j.detail || '')}</span><pre>${esc(j.result || '')}</pre>`
 box.appendChild(el)
 if (j.tool === 'generate_image' || j.tool === 'generate_video') appendMediaCard(box, j.result)
 target = null; thinkBox = null
 scrollIfNearBottom(box)
 }
 if (j.error) { ensureTurn(j); target.parentElement.className = 'msg error'; target.textContent = j.error }
  if (j.usage) {
   ensureTurn(j)
   state.lastUsage = { prompt: j.usage.prompt_tokens || 0, limit: j.contextLimit || 0 }
   const pctNum = j.contextLimit ? Math.min(999, Math.round((j.usage.prompt_tokens || 0) / j.contextLimit * 100)) : null
   $('chat-context').textContent = `${t('context')}: ${fmtNum(state.lastUsage.prompt)}/${fmtNum(state.lastUsage.limit)}${pctNum != null ? ` (${pctNum}%)` : ''}`
   // ★ 消息内环形占用指示器（悬停显示 成本/使用率/Token 卡片）
   let meta = target.parentElement.querySelector('.msg-meta')
   if (!meta) { meta = document.createElement('div'); meta.className = 'msg-meta dim small'; target.parentElement.appendChild(meta) }
   meta.innerHTML = ''
   if (pctNum != null) setCtxBadge(meta, pctNum, j.cost, (j.usage.prompt_tokens || 0) + (j.usage.completion_tokens || 0), j.cacheHit)
   meta.insertAdjacentHTML('beforeend', ` <span>${t('tokens')} ${fmtNum(j.usage.prompt_tokens)}/${fmtNum(j.usage.completion_tokens)} · ${t('cache')} ${fmtNum(j.cacheHit)} · ${t('cost')} ${fmtCost(j.cost)}</span>`)
  }
 } catch {}
 }
 }
 } catch (e) { if (target) { target.parentElement.className = 'msg error'; target.textContent = t('failure') + ': ' + e.message } }
 finally { $('btn-send').disabled = false; await reloadActiveSession(); await refreshSessions() }
}

/* ══════════════ "/" 命令面板 ══════════════ */
const COMMANDS = [
 { cmd: '/new', desc: '新建会话', run: () =>openSessionModal($('chat-provider').value) },
 { cmd: '/compact', desc: '压缩当前会话上下文（生成摘要）', run: async () => { if (!state.activeSession) return; const r = await api('POST', `/api/sessions/${state.activeSession.id}/compact`); if (!r.ok) alert(r.error); await reloadActiveSession() } },
 { cmd: '/undo', desc: '撤销上一条消息', run: async () => { if (!state.activeSession) return; await api('POST', `/api/sessions/${state.activeSession.id}/undo`); await reloadActiveSession() } },
 { cmd: '/clear', desc: '清空当前会话消息', run: async () => { if (!state.activeSession) return; if (!confirm(t('clear'))) return; await api('POST', `/api/sessions/${state.activeSession.id}/clear`); await reloadActiveSession() } },
 { cmd: '/rename', desc: '重命名当前会话', run: async () => { if (!state.activeSession) return; const v = prompt('Title', state.activeSession.title || ''); if (v != null) { await api('PUT', `/api/sessions/${state.activeSession.id}`, { title: v }); await reloadActiveSession() } } },
 { cmd: '/archive', desc: '归档当前会话', run: async () => { if (!state.activeSession) return; await api('PUT', `/api/sessions/${state.activeSession.id}`, { archived: true }); state.activeSession = null; renderChatMessages(); await refreshSessions() } },
 { cmd: '/export', desc: '导出当前会话 JSON', run: () => { if (state.activeSession) window.open(`/api/sessions/${state.activeSession.id}/export`, '_blank') } },
 { cmd: '/model', desc: '切换模型', run: async () => { const m = prompt('Model', $('chat-model').value); if (m && state.activeSession) { await api('PUT', `/api/sessions/${state.activeSession.id}`, { model: m }); await reloadActiveSession() } } },
 { cmd: '/workspace', desc: '切换工作区', run: async () => { const p = prompt('Workspace path:\n' + state.workspaces.map((w) =>w.path).join('\n'), state.activeWorkspace); if (p) { await api('PUT', '/api/workspaces/active', { path: p }); await refreshWorkspaces(); refreshWorkspace() } } },
 { cmd: '/agent', desc: '以某个团队角色身份对话', run: () => { const rs = state.roles.filter((r) =>r.enabled !== false); const i = prompt('Role:\n' + rs.map((r, k) => `${k + 1}. ${r.label}`).join('\n'), '1'); const r2 = rs[Number(i) - 1]; if (r2) $('chat-text').value += `现在请以【${r2.label}】的身份工作：${r2.desc || ''}。` } },
 { cmd: '/review', desc: '插入代码审查提示词', run: () => { $('chat-text').value += '请严格审查本项目代码：逐文件检查正确性/边界/资源释放/错误处理，输出“文件:行、问题、修复建议”清单。' } },
 { cmd: '/goal', desc: '插入目标提示词', run: () => { $('chat-text').value += '设定目标：<填写目标>。请拆解步骤并逐步执行，完成前不要停下来问我，除非遇到无法解决的外部阻塞。' } },
 { cmd: '/init', desc: '插入项目说明生成提示词', run: () => { $('chat-text').value += '请阅读当前工作区项目，生成 AGENTS.md：项目结构、构建/运行命令、代码规范、注意事项。' } },
 { cmd: '/help', desc: '显示全部命令', run: () => { state.cmd.open = true; state.cmd.list = COMMANDS; renderCmdPalette() } },
]
function renderCmdPalette() {
 const box = $('cmd-palette')
 if (!state.cmd.open || !state.cmd.list.length) { box.classList.add('hidden'); return }
 box.classList.remove('hidden')
 box.innerHTML = state.cmd.list.map((c, i) => `<div class="cmd-row ${i === state.cmd.index ? 'active' : ''}" data-i="${i}"><b>${esc(c.cmd)}</b><span class="dim small">${esc(c.desc)}</span></div>`).join('')
 box.querySelectorAll('.cmd-row').forEach((row) => { row.onmousedown = (e) => { e.preventDefault(); runCommand(state.cmd.list[Number(row.dataset.i)]) } })
}
function runCommand(c) {
 state.cmd.open = false; $('cmd-palette').classList.add('hidden')
 const v = $('chat-text').value
 if (v.startsWith('/')) $('chat-text').value = ''
 c.run()
 setTimeout(() => $('chat-text').focus(), 50)
}
function onChatInput() {
 const v = $('chat-text').value
 if (v.startsWith('/')) {
 const kw = v.split(/\s/)[0].toLowerCase()
 state.cmd.list = COMMANDS.filter((c) =>c.cmd.startsWith(kw))
 state.cmd.open = state.cmd.list.length > 0
 state.cmd.index = 0
 } else state.cmd.open = false
 renderCmdPalette()
}

/* ══════════════ 团队任务（并发） ══════════════ */
function roleColor(id) { return roleById(id)?.color || '#888' }
function roleLabel(id) { return roleById(id)?.label || id }
function createRunBox(task) {
 $('team-stream').querySelector('.empty-tip')?.remove()
 const box = document.createElement('div')
 box.className = 'run-box'
 box.innerHTML = `<div class="run-head"><span class="run-caret">▾</span><b>${esc(task.slice(0, 80))}</b><span class="run-status dim small">${t('running')}</span></div><div class="run-body"></div><div class="run-foot dim small"></div>`
 box.querySelector('.run-head').onclick = () =>box.classList.toggle('collapsed')
 $('team-stream').appendChild(box)
 $('team-stream').scrollTop = $('team-stream').scrollHeight
 const run = { task, root: box, body: box.querySelector('.run-body'), foot: box.querySelector('.run-foot'), cost: 0, status: box.querySelector('.run-status') }
 state.runs.push(run)
 return run
}
function runBlock(run, agent, label, subtitle) {
 const box = document.createElement('div')
 box.className = 'agent-block'
 box.dataset.agent = agent
 box.style.borderLeftColor = roleColor(agent)
  const steerBtn = state.currentTeamTaskId ? `<button class="btn ghost tiny steer-btn" title="${esc(t('steerTitle'))}">${esc(t('steerTitle'))}</button>` : ''
  const pauseBtn = state.currentTeamTaskId ? `<button class="btn ghost tiny pause-btn" title="${esc(t('pause'))}/${esc(t('resume'))}">${state.agentPaused.has(agent) ? '▷' : '‖'}</button>` : ''
 box.innerHTML = `<div class="agent-head"><span class="agent-name" style="color:${roleColor(agent)}">${esc(label)}</span><span class="agent-sub dim small">${esc(subtitle || '')}</span>${steerBtn}${pauseBtn}</div><div class="agent-body"></div>`
 const sb = box.querySelector('.steer-btn')
 if (sb) sb.onclick = (e) => { e.stopPropagation(); steerSend(state.currentTeamTaskId, agent) }
 const pb = box.querySelector('.pause-btn')
 if (pb) pb.onclick = async (e) => {
 e.stopPropagation()
  const paused = state.agentPaused.has(agent)
  if (paused) { state.agentPaused.delete(agent); pb.textContent = '‖' } else { state.agentPaused.add(agent); pb.textContent = '▷' }
  const r = await api('POST', '/api/team/control', { taskId: state.currentTeamTaskId, action: paused ? 'resumeAgent' : 'pauseAgent', agent })
  if (r.ok && Array.isArray(r.pausedAgents)) { state.agentPaused = new Set(r.pausedAgents); pb.textContent = state.agentPaused.has(agent) ? '▷' : '‖' }
 }
 run.body.appendChild(box)
 scrollIfNearBottom(document.getElementById('team-stream'))
 return box.querySelector('.agent-body')
}
/* 团队会话：先建会话（选工作区）再下任务 */
async function refreshTeamSessions(selectId) {
 await refreshSessions()
 state.teamSessions = state.sessions.filter((s) => (s.kind || 'chat') === 'team')
 const sel = $('team-session')
 if (!sel) return
 if (!state.teamSessions.length) {
 sel.innerHTML = `<option value="">${t('noTeamSessions')}</option>`
 state.teamSessionId = ''
 $('team-session-ws').textContent = ''
 return
 }
 if (selectId) state.teamSessionId = selectId
 if (!state.teamSessionId || !state.teamSessions.some((s) =>s.id === state.teamSessionId)) state.teamSessionId = state.teamSessions[0].id
  // ★ 不再显示消息条数后缀（容易被误解为"第几个会话"序号）
  sel.innerHTML = state.teamSessions.map((s) => `<option value="${s.id}" ${s.id === state.teamSessionId ? 'selected' : ''}>${esc(s.title || '(untitled)')}</option>`).join('')
 sel.value = state.teamSessionId
 const cur = state.teamSessions.find((s) =>s.id === state.teamSessionId)
 $('team-session-ws').textContent = cur?.workspace ? ` ${cur.workspace}` : ''
  setEffortVisual('team-effort', cur?.effort || state.settings.reasoningEffort || 'default') // ★ 推理等级滑块跟随团队会话
  // ★ Paperclip：自动续跑设置跟随团队会话
  if ($('team-auto-continue')) $('team-auto-continue').value = String(cur?.autoContinue || 0)
}
// ★ 预算实时显示：本次任务已花费 + 剩余额度（修改预算数字即时预览）
function renderTeamBudget() {
 const el = $('team-budget-left')
 if (!el) return
 const budget = Number($('team-budget')?.value) || 0
 const spent = Number(state.teamTaskCost) || 0
 if (!budget) {
  el.textContent = spent > 0 ? `${t('budgetSpent')} ${fmtCost(spent)}${t('budgetNoLimit')}` : ''
  el.classList.remove('over')
  return
 }
 const left = Math.max(0, budget - spent)
 el.textContent = `${t('budgetSpent')} ${fmtCost(spent)} · ${t('budgetLeft')} ${fmtCost(left)}`
 el.classList.toggle('over', left <= 0)
}
// ★ 历史回放：角色单独对话（用户气泡 + AI 回复）
function renderRoleChatHistory(container, m) {
 const agent = m.agent || 'leader'
 let box = [...container.querySelectorAll('.role-chat')].filter((x) => x.dataset.agent === agent).pop()
 if (m.side === 'user' || !box) {
  box = document.createElement('div')
  box.className = 'role-chat agent-block'
  box.dataset.agent = agent
  box.style.borderLeftColor = roleColor(agent)
  box.innerHTML = `<div class="agent-head"><span class="agent-name">你 → ${esc(roleLabel(agent))}</span></div><div class="rc-user"></div><div class="rc-ai"></div>`
  container.appendChild(box)
 }
 if (m.side === 'user') box.querySelector('.rc-user').textContent = m.content || ''
 else {
  box.querySelector('.rc-ai').textContent = stripToolFences(m.content || '')
  setMsgStatus(box.querySelector('.rc-ai'), 'done')
 }
}
// ★ 历史回放：协作询问/回复
function renderAskHistory(container, m) {
 const el = document.createElement('div')
 const done = m.kind === 'team-ask-done'
 el.className = 'ask-box' + (done ? ' done' : '')
 el.dataset.agent = `${m.from || ''},${m.to || ''}`
 el.innerHTML = done
  ? `<b>${t('askReply')}</b> <b style="color:${roleColor(m.to)}">${esc(roleLabel(m.to))}</b> → <b style="color:${roleColor(m.from)}">${esc(roleLabel(m.from))}</b><div>${esc(String(m.answer || '').slice(0, 600))}</div>`
  : `<b>${t('askLabel')}</b> <b style="color:${roleColor(m.from)}">${esc(roleLabel(m.from))}</b> → <b style="color:${roleColor(m.to)}">${esc(roleLabel(m.to))}</b><div>${esc(m.question || '')}</div>`
 styleAskBox(el, done ? m.to : m.from)
 container.appendChild(el)
}
async function renderTeamSession() {
 const stream = $('team-stream')
 if (!stream) return
 stream.innerHTML = ''
 state.runs = []
 if (!state.teamSessionId) { stream.innerHTML = `<div class="empty-tip">${t('teamEmpty')}</div>`; return }
 const r = await api('GET', `/api/sessions/${state.teamSessionId}`)
 if (!r.ok) return
 let run = null
 for (const m of r.session.messages || []) {
 // ★ 角色单独对话 / 协作记录（可能出现在任务之外，先于 run 判断）
 if (m.kind === 'role-chat') { renderRoleChatHistory(stream, m); continue }
 if (m.kind === 'team-ask' || m.kind === 'team-ask-done') { renderAskHistory(stream, m); continue }
 if (m.kind === 'team-task') { run = createRunBox(m.content || ''); run.status.textContent = 'history'; continue }
 if (!run) continue
 if (m.kind === 'team-plan') {
 const box = document.createElement('div')
 box.className = 'plan-box'
 box.dataset.agent = 'leader'
 box.innerHTML = `<b>${t('planLabel')}</b><div class="dim small">${esc(m.summary || '')}</div><ol>${(m.steps || []).map((s) => `<li><b>${esc(roleLabel(s.agent))}</b>：${esc(s.title || '')}</li>`).join('')}</ol>`
 run.body.appendChild(box); continue
 }
  if (m.kind === 'team-step') { runBlock(run, m.agent, roleLabel(m.agent) + (m.title ? ' · ' + m.title : ''), '(history)').textContent = stripToolFences(m.content || ''); continue }
  if (m.kind === 'team-final') { runBlock(run, 'leader', roleLabel('leader') + ' · final', '(history)').textContent = stripToolFences(m.content || ''); continue }
 if (m.kind === 'team-steer') { run.body.appendChild(steerBox(m.content || '', m.agent)); continue }
  if (m.kind === 'team-meta') {
   run.foot.textContent = m.content || ''
   const cm = /费用 ¥([\d.]+)/.exec(m.content || '') // ★ 从历史记录恢复"本次已花"用于预算显示
   if (cm) state.teamTaskCost = Number(cm[1]) || 0
   continue
  }
 }
 if (!(r.session.messages || []).length) stream.innerHTML = `<div class="empty-tip">${t('teamEmpty')}</div>`
 stream.scrollTop = stream.scrollHeight
 renderTeamBudget()
 applyTeamFilter()
}

/* 角色实时活动（底部活动栏 + 右侧「角色」面板） */
const STATUS_KEY = { idle: 'stIdle', thinking: 'stThinking', acting: 'stActing', final: 'stFinal', done: 'stDone', failed: 'stFailed', needs: 'stNeeds' }
// ★ 状态文本带标记：✓ 完成 / ! 需授权 / ✗ 失败
function stLabel(st) {
 const base = t(STATUS_KEY[st] || st)
 if (st === 'done') return '✓ ' + base
 if (st === 'needs') return '! ' + base
 if (st === 'failed') return '✗ ' + base
 return base
}
function resetRoleLive() {
 state.roleLive = {}
 for (const r of state.roles.filter((x) =>x.enabled !== false)) {
 state.roleLive[r.id] = { status: 'idle', label: r.label, color: r.color || '#888', model: '', sub: '', snippet: '', acc: '', tools: [], textEl: null, toolsEl: null, subEl: null, chipSnip: null, chipSt: null }
 }
 renderRoleActivity(); renderRolesLive()
}
function roleLiveOf(id) {
 if (!state.roleLive[id]) {
 const r = roleById(id)
 state.roleLive[id] = { status: 'idle', label: r?.label || roleLabel(id), color: r?.color || '#888', model: '', sub: '', snippet: '', acc: '', tools: [], textEl: null, toolsEl: null, subEl: null, chipSnip: null, chipSt: null }
 }
 return state.roleLive[id]
}
function liveEls(id) {
 const rl = roleLiveOf(id)
 if (!rl.textEl || !document.contains(rl.textEl)) {
 const col = document.querySelector(`.role-col[data-role="${id}"]`)
 rl.textEl = col?.querySelector('.rc-text') || null
 rl.toolsEl = col?.querySelector('.rc-tools') || null
 rl.subEl = col?.querySelector('.rc-sub') || null
 }
 if (!rl.chipSnip || !document.contains(rl.chipSnip)) rl.chipSnip = document.querySelector(`.role-chip[data-role="${id}"] .rc-snip`)
 if (!rl.chipSt || !document.contains(rl.chipSt)) rl.chipSt = document.querySelector(`.role-chip[data-role="${id}"] .rc-status`)
 return rl
}
function roleSetStatus(id, st, patch = {}) {
 const rl = liveEls(id)
 rl.status = st
 if (patch.model != null) rl.model = patch.model
 if (patch.sub != null) rl.sub = patch.sub
 if (patch.snippet != null) { rl.snippet = patch.snippet; if (rl.chipSnip) rl.chipSnip.textContent = String(patch.snippet).slice(-70) }
 if (rl.chipSt) rl.chipSt.textContent = stLabel(st)
 if (rl.subEl) rl.subEl.textContent = [rl.model, rl.sub].filter(Boolean).join(' · ')
 const colSt = document.querySelector(`.role-col[data-role="${id}"] .rc-head-status`)
 if (colSt) colSt.textContent = stLabel(st)
 const col = document.querySelector(`.role-col[data-role="${id}"]`)
 if (col) col.dataset.st = st
}
function roleAppend(id, text) {
 const rl = liveEls(id)
 rl.acc += text
 if (rl.textEl) queueReason(rl.textEl, text)
 roleSetStatus(id, rl.status === 'idle' ? 'thinking' : rl.status, { snippet: rl.acc.slice(-80) })
}
function roleAddTool(id, call, detail, result) {
 const rl = liveEls(id)
 rl.tools.push({ call, detail })
 roleSetStatus(id, 'acting', { sub: ` ${call} ${detail || ''}`.slice(0, 60) })
 if (rl.toolsEl) {
 const el = document.createElement('div')
 el.className = 'rc-tool'
 el.textContent = ` ${call} ${detail || ''}\n${String(result || '').slice(0, 160)}`
 rl.toolsEl.appendChild(el)
 rl.toolsEl.scrollTop = rl.toolsEl.scrollHeight
 }
}
function renderRoleActivity() {
 const box = $('team-activity')
 if (!box) return
 const roles = state.roles.filter((r) =>r.enabled !== false)
 box.innerHTML = `<button id="btn-team-overview" class="role-chip overview ${state.teamFocus ? '' : 'active'}" title="${esc(t('teamOverview'))}"> ${esc(t('teamOverview'))}</button>` + roles.map((r) => {
 const rl = state.roleLive[r.id] || {}
 return `<div class="role-chip ${state.teamFocus === r.id ? 'active' : ''}" data-role="${r.id}" data-st="${rl.status || 'idle'}" title="${esc(r.label)}：${esc(t('focusHint'))}">
 <span class="role-dot" style="background:${esc(r.color || '#888')}"></span>
  <span class="rc-name">${esc(r.label)}</span>
  <span class="rc-status">${esc(stLabel(rl.status || 'idle'))}</span>
 <span class="rc-snip dim small">${esc((rl.snippet || '').slice(-70))}</span>
 </div>`
 }).join('')
 $('btn-team-overview').onclick = () => { state.teamFocus = ''; applyTeamFilter() }
 box.querySelectorAll('.role-chip[data-role]').forEach((el) => { el.onclick = () => { setTeamFocus(el.dataset.role); switchSubtab('roles') } })
 renderTeamTabs()
}
// ★ 角色卡片指标行：费用 / 使用率 / Token / 缓存命中（与环形提示一致）
function roleStatsHtml(id) {
 const st = (state.roleLive[id] || {}).stats
 if (!st || (!st.prompt && !st.cost)) return ''
 const pct = st.ctxLimit ? Math.round((st.lastPrompt || 0) / st.ctxLimit * 100) + '%' : '--'
 return `费用 ${fmtCost(st.cost)} · 使用率 ${pct} · Token ${fmtNum(st.prompt)}/${fmtNum(st.completion)} · ${t('cache')} ${fmtNum(st.cacheHit)}`
}
function updateRoleStatsEl(id) {
 const el = document.querySelector(`.role-col[data-role="${id}"] .rc-stats`)
 if (el) el.textContent = roleStatsHtml(id)
}
function renderRolesLive() {
 const box = $('roles-live')
 if (!box) return
 const roles = state.roles.filter((r) =>r.enabled !== false)
 box.innerHTML = roles.map((r) => {
 const rl = state.roleLive[r.id] || {}
 return `<div class="role-col" data-role="${r.id}" data-st="${rl.status || 'idle'}">
 <div class="rc-head"><span class="role-dot" style="background:${esc(r.color || '#888')}"></span><b>${esc(r.label)}</b><span class="rc-head-status dim small">${esc(stLabel(rl.status || 'idle'))}</span></div>
 <div class="rc-sub dim small">${esc([rl.model, rl.sub].filter(Boolean).join(' · '))}</div>
 <div class="rc-stats dim small">${esc(roleStatsHtml(r.id))}</div>
 <div class="rc-tools">${(rl.tools || []).map((x) => `<div class="rc-tool"> ${esc(x.call)} ${esc(x.detail || '')}</div>`).join('')}</div>
 <div class="rc-text">${esc(rl.acc || '')}</div>
 </div>`
 }).join('')
}
function focusRoleCol(id) {
 const el = document.querySelector(`.role-col[data-role="${id}"]`)
 if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(() =>el.classList.remove('flash'), 1200) }
}
/* 暂停/继续（全局） */
function updatePauseUI() {
 const b = $('btn-team-pause')
 if (!b) return
 b.disabled = !state.currentTeamTaskId
 b.innerHTML = state.runPaused ? ` <span>${t('resume')}</span>` : ` <span>${t('pause')}</span>`
 b.classList.toggle('primary', state.runPaused)
}
/* 检测未完成任务：断线/刷新后询问是否继续 */
async function checkActiveRuns(silent) {
 try {
 const r = await api('GET', '/api/team/runs')
 const banner = $('team-resume-banner')
 if (!banner) return
 const runs = (r.runs || []).filter((x) =>x.id !== state.currentTeamTaskId)
 if (!runs.length) { banner.classList.add('hidden'); return }
 const run = runs[0]
 banner.classList.remove('hidden')
 banner.innerHTML = ` ${t('resumeAsk')}<b>${esc(run.task)}</b>${run.paused ? esc(t('resumePausedHint')) : ''}
 <button class="btn primary tiny" id="btn-run-attach">${run.paused ? t('resumeResume') : t('resumeContinue')}</button>
 <button class="btn danger tiny" id="btn-run-stop">${t('resumeStop')}</button>`
 $('btn-run-attach').onclick = () =>attachTeamRun(run)
 $('btn-run-stop').onclick = async () => {
 if (!confirm(t('stopConfirm'))) return
 await api('POST', '/api/team/control', { taskId: run.id, action: 'stop' })
 setTimeout(() =>checkActiveRuns(true), 1200)
 }
 } catch { /* ignore */ }
}
function attachTeamRun(runMeta) {
 state.teamSessionId = runMeta.sessionId || state.teamSessionId
 switchView('team')
 const stream = $('team-stream')
 stream.innerHTML = ''
 state.runs = []
 state.currentTeamTaskId = runMeta.id
 state.agentPaused = new Set(runMeta.pausedAgents || [])
 state.runPaused = !!runMeta.paused
 updatePauseUI()
 if (state.teamSessionId) refreshTeamSessions(state.teamSessionId)
 const src = new EventSource(`/api/team/attach?taskId=${encodeURIComponent(runMeta.id)}&token=${encodeURIComponent(AUTH_TOKEN)}`)
 let run = null, ref = null
 src.onmessage = (e) => {
 let ev
 try { ev = JSON.parse(e.data) } catch { return }
 if (ev.ping) return
 if (ev.type === 'attached') {
 run = createRunBox(ev.task || t('resumeContinue'))
 ref = { id: ev.taskId, stepBoxes: {}, leaderBox: null, finalBox: null }
 state.runPaused = !!ev.paused
 state.agentPaused = new Set(ev.pausedAgents || [])
 if (ev.paused) run.status.textContent = t('pausedState')
 updatePauseUI()
 return
 }
 if (!run) return
 try { handleTeamEvent(ev, run, ref) } catch { /* ignore */ }
 }
 src.onerror = () => { try { src.close() } catch { /* ignore */ } ; setTimeout(() =>checkActiveRuns(true), 1500) }
 $('team-resume-banner').classList.add('hidden')
 if (runMeta.paused) setTimeout(() =>api('POST', '/api/team/control', { taskId: runMeta.id, action: 'resume' }).then(updatePauseUI), 600)
}
/* 出图审核卡片 */
function appendImageReviewCard(container, r) {
 const el = document.createElement('div')
 el.className = 'review-box'
 el.innerHTML = `<div class="cf-head"> ${t('reviewTitle')} <span class="dim small">${esc(t('reviewHint'))}</span></div>
 <div class="review-imgs">${(r.urls || []).map((u) => `<img src="${esc(u)}" />`).join('')}</div>
 <input class="qf-input" value="${esc(r.prompt || '')}" />
 <div class="cf-actions">
 <button class="btn primary tiny" data-a="keep"> ${t('keepImg')}</button>
 <button class="btn ghost tiny" data-a="regen"> ${t('regenImg')}</button>
 <button class="btn danger tiny" data-a="delete"> ${t('delImg')}</button>
 </div>`
 container.appendChild(el)
 container.scrollTop = container.scrollHeight
 el.querySelectorAll('button[data-a]').forEach((b) => {
 b.onclick = async () => {
 const prompt = el.querySelector('.qf-input').value
 await api('POST', '/api/review', { id: r.id, action: b.dataset.a, prompt })
 el.classList.add('done')
 el.querySelector('.cf-actions').innerHTML = `<span class="small">${b.dataset.a === 'keep' ? ' ' + t('keepImg') : b.dataset.a === 'delete' ? ' ' + t('delImg') : ' ' + t('regenDone') + '…'}</span>`
 }
 })
 return el
}
/* 总揽全局 / 角色聚焦：聚焦后主消息框只显示该角色的内容块 */
function setTeamFocus(id) {
 state.teamFocus = state.teamFocus === id ? '' : id
 applyTeamFilter()
}
// ★ 角色栏快捷设置：该角色的权限 + 工具调用次数（保存到角色配置，角色设置优先于全局）
function renderRoleQuickSettings() {
 const r = roleById(state.teamFocus)
 const ps = $('role-perm-quick'), ls = $('role-limit-quick')
 if (!r || !ps || !ls) return
 ps.innerHTML = `<option value="">${t('permFollow')}</option><option value="view">${t('permView')}</option><option value="modify">${t('permModify')}</option><option value="limited">${t('permLimited')}</option><option value="full">${t('permFullOpt')}</option>`
 ps.value = r.permission || ''
 const lv = (r.toolLimit === '' || r.toolLimit == null) ? '' : String(r.toolLimit)
 ls.innerHTML = `<option value="">${t('limitFollow')}</option><option value="-1">${t('tlOff')}</option><option value="0">${t('tlUnlimited')}</option><option value="20">20</option><option value="50">50</option><option value="100">100</option><option value="custom">${t('tlCustom')}</option>`
 ls.value = ['', '-1', '0', '20', '50', '100'].includes(lv) ? lv : 'custom'
 if (ls.value === 'custom') ls.dataset.num = lv
 ps.onchange = () => saveRoleQuick({ permission: ps.value })
 ls.onchange = () => {
  let v = ls.value
  if (v === 'custom') {
   const n = prompt(t('limitCustomAsk'), ls.dataset.num || '50')
   if (n == null) { renderRoleQuickSettings(); return }
   v = String(Math.max(1, Math.min(999, Number(n) || 50)))
  }
  saveRoleQuick({ toolLimit: v === '' ? '' : Number(v) })
 }
}
async function saveRoleQuick(patch) {
 const roles = state.roles.map((x) => (x.id === state.teamFocus ? { ...x, ...patch } : x))
 const res = await api('PUT', '/api/roles', roles)
 if (res.ok) { state.roles = roles; renderRoleSummary(); renderRoleQuickSettings() }
}
function applyTeamFilter() {
 const stream = $('team-stream')
 if (!stream) return
  stream.querySelectorAll('[data-agent]').forEach((el) => {
   // ★ 支持 "角色A,角色B"：协作消息在双方的视图里都能看到
   const owners = String(el.dataset.agent || '').split(',')
   el.classList.toggle('hidden', !!state.teamFocus && !owners.includes(state.teamFocus))
  })
 document.querySelectorAll('#team-activity .role-chip').forEach((el) => el.classList.toggle('active', el.dataset.role === state.teamFocus))
 document.querySelectorAll('#role-summary .role-item').forEach((el) => el.classList.toggle('active', el.dataset.role === state.teamFocus))
 document.querySelectorAll('#team-tabs .team-tab').forEach((el) => el.classList.toggle('active', el.dataset.role === (state.teamFocus || '')))
 const ov = $('btn-team-overview')
 if (ov) ov.classList.toggle('active', !state.teamFocus)
 // ★ 角色标签页激活时，底部显示"单独对话栏"
  const bar = $('team-role-bar')
  if (bar) {
   bar.classList.toggle('hidden', !state.teamFocus)
   if (state.teamFocus) {
    $('team-role-bar-name').textContent = `${roleLabel(state.teamFocus)}：`
    $('team-role-text').placeholder = t('roleChatAsk')
    renderRoleQuickSettings()
   }
  }
}
/* ★ 角色标签页（总览 + 每个角色一个独立标签，互不干扰） */
function renderTeamTabs() {
 const box = $('team-tabs')
 if (!box) return
 const roles = state.roles.filter((r) => r.enabled !== false)
 box.innerHTML = `<button class="team-tab ${state.teamFocus ? '' : 'active'}" data-role="">${t('teamOverview')}</button>` +
 roles.map((r) => `<button class="team-tab ${state.teamFocus === r.id ? 'active' : ''}" data-role="${r.id}"><span class="role-dot" style="background:${esc(r.color || '#888')}"></span>${esc(r.label)}</button>`).join('')
 box.querySelectorAll('.team-tab').forEach((el) => {
  el.onclick = () => { state.teamFocus = state.teamFocus === el.dataset.role || !el.dataset.role ? '' : el.dataset.role; applyTeamFilter(); switchSubtab('roles') }
 })
}
/* ★ 与该角色直接对话（任务进行中同时作为中途指令发送） */
async function roleChatSend() {
 const roleId = state.teamFocus
 const text = $('team-role-text').value.trim()
 if (!roleId || !text) return
 $('team-role-text').value = ''
 const box = document.createElement('div')
 box.className = 'role-chat agent-block'
 box.dataset.agent = roleId
 box.style.borderLeftColor = roleColor(roleId)
  // ★ 用户消息与 AI 回复分属两个气泡：AI 回复不再覆盖用户发言
  box.innerHTML = `<div class="agent-head"><span class="agent-name">你 → ${esc(roleLabel(roleId))}</span></div><div class="rc-user"></div><div class="rc-ai"></div>`
  box.querySelector('.rc-user').textContent = text
  $('team-stream').appendChild(box)
 applyTeamFilter()
 scrollIfNearBottom($('team-stream'), true)
 // 任务进行中：同时作为中途指令发给该角色（它会真正采纳）
 if (state.currentTeamTaskId) api('POST', '/api/team/steer', { taskId: state.currentTeamTaskId, agent: roleId, message: text }).catch(() => {})
 const target = box.querySelector('.rc-ai')
 setMsgStatus(target, 'thinking') // ★ 状态：思考中
 let first = true, finished = false
 try {
  const res = await fetch('/api/role/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ roleId, message: text, sessionId: state.teamSessionId || '' }) })
  if (!res.ok) { const er = await res.json().catch(() => ({})); target.textContent = t('failure') + ': ' + (er.error || res.status); setMsgStatus(target, 'failed'); return }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''
  while (true) {
   const { done, value } = await reader.read(); if (done) break
   buf += dec.decode(value, { stream: true })
   const lines = buf.split('\n'); buf = lines.pop() || ''
   for (const line of lines) {
    const s = line.trim(); if (!s.startsWith('data:')) continue
    try {
     const j = JSON.parse(s.slice(5))
     // ★ 思考过程：可折叠的独立框（与对话页一致）
     if (j.reasoning) {
      let d = box.querySelector('details.reasoning')
      if (!d) { d = document.createElement('details'); d.className = 'reasoning'; d.open = true; d.innerHTML = `<summary>${t('thinking')}</summary><div class="reasoning-body"></div>`; box.insertBefore(d, target) }
      queueReason(d.querySelector('.reasoning-body'), j.reasoning)
     }
     if (j.delta) {
      if (first) { first = false }
      const d = box.querySelector('details.reasoning')
      if (d && !d.dataset.done) { d.dataset.done = '1'; d.open = false; d.querySelector('summary').textContent = ` ${t('thoughtDone')}（${d.querySelector('.reasoning-body').textContent.length}）` }
      appendStreamText(target, j.delta); setMsgStatus(target, 'answering'); scrollIfNearBottom($('team-stream'))
     }
     if (j.error) { target.textContent = t('failure') + ': ' + j.error; setMsgStatus(target, 'failed'); finished = true }
     if (j.done) { setMsgStatus(target, 'done'); finished = true; maybeNotify('角色对话完成', roleLabel(roleId)) }
     // ★ 单角色对话中的工具与协作事件（ask_role 联系队友等）
     if (j.question) { appendQuestionCard(box, j.question, roleId); maybeNotify('AI 等待你的回答', j.question?.questions?.[0]?.question || '') }
     if (j.confirm) appendConfirmCard(box, j.confirm)
     if (j.permreq) { appendPermReqCard(box, { permreq: j.permreq }, roleId); maybeNotify('对话待授权', j.permreq?.tool || '') }
     if (j.notice) appendNotice(box, j.notice, roleId)
     if (j.ask) {
      // ★ 协作消息挂在总流上并标记双方，切换任一角色视图都能看到；气泡用发言者角色色
      const el = document.createElement('div')
      el.className = 'ask-box'
      el.dataset.agent = `${j.ask.from || roleId},${j.ask.to || ''}`
      el.innerHTML = `<b>${t('askLabel')}</b> <b style="color:${roleColor(j.ask.from)}">${esc(roleLabel(j.ask.from))}</b> → <b style="color:${roleColor(j.ask.to)}">${esc(roleLabel(j.ask.to))}</b><div>${esc(j.ask.question || '')}</div>`
      styleAskBox(el, j.ask.from)
      $('team-stream').appendChild(el); applyTeamFilter()
      if (j.ask.to) roleSetStatus(j.ask.to, 'thinking', { sub: `${roleLabel(j.ask.from)} ${t('asking')}` })
     }
     if (j.ask_done) {
      const el = document.createElement('div')
      el.className = 'ask-box done'
      el.dataset.agent = `${j.ask_done.from || roleId},${j.ask_done.to || ''}`
      el.innerHTML = `<b>${t('askReply')}</b> <b style="color:${roleColor(j.ask_done.to)}">${esc(roleLabel(j.ask_done.to))}</b> → <b style="color:${roleColor(j.ask_done.from)}">${esc(roleLabel(j.ask_done.from))}</b><div>${esc(String(j.ask_done.answer || '').slice(0, 400))}</div>`
      styleAskBox(el, j.ask_done.to)
      $('team-stream').appendChild(el); applyTeamFilter()
     }
     if (j.tool && j.tool !== 'ask_role') {
      // ★ 工具调用：可折叠的独立框（点击展开/收起）
      const el = document.createElement('details')
      el.className = 'ask-box tool-note'
      el.innerHTML = `<summary>${t('toolLabel')} · ${esc(j.tool)}</summary><div>${esc(String(j.result || '').slice(0, 1500))}</div>`
      box.appendChild(el)
     }
     if (j.usage && j.contextLimit) setCtxBadge(box, Math.round((j.usage.prompt_tokens || 0) / j.contextLimit * 100), j.cost, (j.usage.prompt_tokens || 0) + (j.usage.completion_tokens || 0), j.cacheHit)
     if (j.question || j.confirm || j.ask || j.ask_done || j.tool) scrollIfNearBottom($('team-stream'))
    } catch { /* ignore */ }
   }
   }
   // ★ 流结束但未收到 done/error：有正文视为完成，否则标记失败（避免状态卡在"思考中"）
   if (!finished) {
    if (target.textContent.trim()) setMsgStatus(target, 'done')
    else { target.textContent = t('failure') + ': ' + t('noReply'); setMsgStatus(target, 'failed') }
   }
  } catch (e) { target.textContent = t('failure') + ': ' + e.message; setMsgStatus(target, 'failed') }
}


async function runTeam() {
 const task = $('team-task').value.trim()
 if (!task) return alert(t('teamPlaceholder'))
 if (!state.providers.length) return alert(t('addApi'))
  if (!state.teamSessionId) { openTeamSessionModal(); return }
 $('team-task').value = ''
 state.teamFocus = '' // 新任务默认回到「总揽全局」
 resetRoleLive()
 const run = createRunBox(task)
 const runRef = { id: null, stepBoxes: {}, leaderBox: null, finalBox: null }
 try {
  const res = await fetch('/api/team/run', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ task, sessionId: state.teamSessionId }) })
 const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''
 while (true) {
 const { done, value } = await reader.read()
 if (done) break
 buf += dec.decode(value, { stream: true })
 const lines = buf.split('\n'); buf = lines.pop() || ''
 for (const line of lines) { const s = line.trim(); if (!s.startsWith('data:')) continue; try { handleTeamEvent(JSON.parse(s.slice(5).trim()), run, runRef) } catch {} }
 }
 } catch (e) { runBlock(run, 'system', 'ERROR', e.message).textContent = e.message }
 finally { refreshWorkspace(); refreshArtGallery(); refreshTasks(); refreshStats(); await refreshTeamSessions(state.teamSessionId) }
}
function handleTeamEvent(ev, run, ref) {
 if (ev.type === 'session') { ref.id = ev.taskId; state.currentTeamTaskId = ev.taskId; state.teamTaskCost = 0; renderTeamBudget(); updatePauseUI(); return }
 if (ev.type === 'confirm') { appendConfirmCard(run.body, ev.confirm); return }
 if (ev.type === 'permreq') { appendPermReqCard(run.body, ev, ev.agent); applyTeamFilter(); maybeNotify('团队任务待授权', `${roleLabel(ev.agent)} 请求授权：${ev.permreq?.tool || ''}`); return }
 if (ev.type === 'notice') { appendNotice(run.body, ev.text || '', ev.agent); applyTeamFilter(); return }
 if (ev.type === 'role_status') { roleSetStatus(ev.agent, ev.status, { sub: ev.sub || '' }); return }
 if (ev.type === 'question') { appendQuestionCard(run.body, ev, ev.agent); maybeNotify('AI 等待你的回答', ev.question?.questions?.[0]?.question || ''); return }
 if (ev.type === 'imagereview') { appendImageReviewCard(run.body, ev); applyTeamFilter(); return }
 if (ev.type === 'ask') {
 const box = document.createElement('div')
 box.className = 'ask-box'
 box.dataset.agent = `${ev.from || ''},${ev.to || ''}` // ★ 询问双方视图里都能看到
 box.innerHTML = `<b>${t('askLabel')}</b> <b style="color:${roleColor(ev.from)}">${esc(roleLabel(ev.from))}</b> → <b style="color:${roleColor(ev.to)}">${esc(roleLabel(ev.to))}</b><div>${esc(ev.question || '')}</div>`
 styleAskBox(box, ev.from)
 run.body.appendChild(box); applyTeamFilter()
 if (ev.to) roleSetStatus(ev.to, 'thinking', { sub: `${roleLabel(ev.from)} ${t('asking')}` })
 return
 }
 if (ev.type === 'ask_done') {
 const box = document.createElement('div')
 box.className = 'ask-box done'
 box.dataset.agent = `${ev.from || ''},${ev.to || ''}`
 box.innerHTML = `<b>${t('askReply')}</b> <b style="color:${roleColor(ev.to)}">${esc(roleLabel(ev.to))}</b> → <b style="color:${roleColor(ev.from)}">${esc(roleLabel(ev.from))}</b><div>${esc(String(ev.answer || '').slice(0, 600))}</div>`
 styleAskBox(box, ev.to)
 run.body.appendChild(box); applyTeamFilter()
 return
 }
 if (ev.type === 'image') { setArtCallout({ who: roleLabel(ev.agent), ...ev }); return }
 if (ev.type === 'paused') {
 state.runPaused = ev.paused !== false
 if (Array.isArray(ev.pausedAgents)) state.agentPaused = new Set(ev.pausedAgents)
 run.status.textContent = t('pausedState') + (ev.reason === 'disconnect' ? '（断线）' : '')
 if (ev.agent) roleSetStatus(ev.agent, 'idle', { sub: t('pausedState') })
 updatePauseUI()
 return
 }
 if (ev.type === 'resumed') {
 state.runPaused = false
 if (Array.isArray(ev.pausedAgents)) state.agentPaused = new Set(ev.pausedAgents)
 run.status.textContent = t('running')
 updatePauseUI()
 return
 }
 if (ev.type === 'stopped') { run.status.textContent = t('stopped'); updatePauseUI(); return }
 if (ev.type === 'steer') {
 run.body.appendChild(steerBox(ev.message, ev.agent))
 applyTeamFilter()
 return
 }
 if (ev.type === 'agent_start') {
 roleSetStatus(ev.agent, ev.final ? 'final' : 'thinking', { model: ev.model || '', sub: '' })
  const body = runBlock(run, ev.agent, (ev.label || roleLabel(ev.agent)) + (ev.final ? ' · final' : ''), ev.model)
  setMsgStatus(body, 'thinking') // ★ 状态：思考中
  if (ev.final) ref.finalBox = body; else if (ev.agent === 'leader') ref.leaderBox = body
  return
 }
 if (ev.type === 'plan') {
 const box = document.createElement('div')
 box.className = 'plan-box'
 box.dataset.agent = 'leader'
 box.innerHTML = `<b>${t('planLabel')}</b><div class="dim small">${esc(ev.summary || '')}</div><ol>${ev.steps.map((s) => `<li><b>${esc(roleLabel(s.agent))}</b>：${esc(s.title || '')}</li>`).join('')}</ol>`
 run.body.appendChild(box); applyTeamFilter(); return
 }
 if (ev.type === 'step_start') {
 roleSetStatus(ev.agent, 'acting', { model: ev.model || '', sub: `${ev.index + 1}. ${ev.title || ''}` })
 ref.stepBoxes[ev.index] = { body: runBlock(run, ev.agent, `${ev.label || roleLabel(ev.agent)} · ${ev.index + 1}: ${ev.title || ''}`, ev.model), agent: ev.agent }
 applyTeamFilter()
 return
 }
 const evTarget = () =>ev.final ? ref.finalBox : ev.agent === 'leader' ? ref.leaderBox : Object.values(ref.stepBoxes).filter((s) =>s.agent === ev.agent).pop()?.body
 if (ev.type === 'reasoning') {
 const host = evTarget()
 if (host) {
 let el = host.parentElement.querySelector('.reasoning')
 if (!el) {
 host.parentElement.insertAdjacentHTML('afterbegin', `<details class="reasoning" open><summary>${t('thinking')}</summary><div class="reasoning-body"></div></details>`)
 el = host.parentElement.querySelector('.reasoning')
 }
 queueReason(el.querySelector('.reasoning-body'), ev.text)
 scrollIfNearBottom(document.getElementById('team-stream'))
 }
 return
 }
 if (ev.type === 'delta') {
 const target = evTarget()
 if (target) {
 flushReason()
 const rEl = target.parentElement.querySelector('.reasoning')
 if (rEl && !rEl.dataset.done) { rEl.dataset.done = '1'; rEl.open = false; rEl.querySelector('summary').textContent = ` ${t('thoughtDone')}（${rEl.querySelector('.reasoning-body').textContent.length}）` }
  appendStreamText(target, ev.text)
  setMsgStatus(target, 'answering') // ★ 状态：回答中
  scrollIfNearBottom(document.getElementById('team-stream'))
  }
  roleAppend(ev.agent, ev.text)
 return
 }
 if (ev.type === 'tool') {
 roleAddTool(ev.agent, ev.call, ev.detail, ev.result)
 const box = document.createElement('div')
 box.className = 'tool-box'
 box.dataset.agent = ev.agent
 box.innerHTML = `<b>${esc(ev.call)}</b> <span class="dim">${esc(ev.detail || '')}</span><pre>${esc(ev.result || '')}</pre>`
 run.body.appendChild(box)
 if (ev.call === 'generate_image' || ev.call === 'generate_video') appendMediaCard(run.body, ev.result)
 applyTeamFilter(); return
 }
   if (ev.type === 'usage') {
    if (ev.cost) { run.cost += ev.cost; run.foot.textContent = ` ${fmtCost(run.cost)} · ${t('tokens')} ${fmtNum(ev.usage?.prompt_tokens)}/${fmtNum(ev.usage?.completion_tokens)} · ${t('cache')} ${fmtNum(ev.cacheHit)}` }
    state.teamTaskCost = ev.totalCost != null ? Number(ev.totalCost) : (Number(state.teamTaskCost) || 0) + (Number(ev.cost) || 0)
    renderTeamBudget()
    // ★ 团队角色卡片指标累计（费用/使用率/Token/缓存命中）
    try {
     const rl = roleLiveOf(ev.agent)
     rl.stats = rl.stats || { cost: 0, prompt: 0, completion: 0, cacheHit: 0, lastPrompt: 0, ctxLimit: 0 }
     rl.stats.cost += Number(ev.cost) || 0
     rl.stats.prompt += ev.usage?.prompt_tokens || 0
     rl.stats.completion += ev.usage?.completion_tokens || 0
     rl.stats.cacheHit += Number(ev.cacheHit) || 0
     if (ev.usage?.prompt_tokens) rl.stats.lastPrompt = ev.usage.prompt_tokens
     if (ev.contextLimit) rl.stats.ctxLimit = ev.contextLimit
     updateRoleStatsEl(ev.agent)
    } catch { /* ignore */ }
    const last = Object.values(ref.stepBoxes).filter((s) =>s.agent === ev.agent).pop()
    if (last?.body) last.body.parentElement.insertAdjacentHTML('beforeend', `<div class="dim small"> ${fmtNum(ev.usage?.prompt_tokens)}/${fmtNum(ev.usage?.completion_tokens)} · ${t('cache')} ${fmtNum(ev.cacheHit)} · ${fmtCost(ev.cost)}</div>`)
   // ★ 每个角色块的上下文占用环形指示器
   if (ev.usage && ev.contextLimit) {
    const pct = Math.min(999, Math.round((ev.usage.prompt_tokens || 0) / ev.contextLimit * 100))
    const host = last?.body ? last.body.parentElement : (ev.agent === 'leader' && ref.finalBox ? ref.finalBox.parentElement : null)
    setCtxBadge(host, pct, ev.cost, (ev.usage.prompt_tokens || 0) + (ev.usage.completion_tokens || 0), ev.cacheHit)
   }
   return
  }
 if (ev.type === 'limit') {
 if (ev.agent) roleSetStatus(ev.agent, 'failed', { sub: ev.message })
 const box = document.createElement('div')
 box.className = 'agent-block err'
 if (ev.agent) box.dataset.agent = ev.agent
 box.innerHTML = `<div class="agent-head"><span class="agent-name"> ${t('stopped')}</span></div><div class="agent-body">${esc(ev.message)}</div>`
 run.body.appendChild(box); applyTeamFilter(); return
 }
  if (ev.type === 'step_done') { roleSetStatus(ev.agent, 'done', { sub: ev.title || '' }); setMsgStatus(ref.stepBoxes[ev.index]?.body, 'done') }
 if (ev.type === 'step_done' && ev.agent === 'artist') {
 const prompts = (ev.result || '').split('\n').filter((l) =>l.includes('IMAGE_PROMPT:')).map((l) =>l.split('IMAGE_PROMPT:')[1].trim()).filter(Boolean)
 for (const pr of prompts) {
 const div = document.createElement('div')
 div.className = 'prompt-row'
 div.dataset.agent = ev.agent
 div.innerHTML = `<span class="prompt-text">${esc(pr)}</span><button class="btn ghost tiny"> ${t('generate')}</button>`
 div.querySelector('button').onclick = () => { $('art-prompt').value = pr; switchSubtab('art'); btnArtGen() }
 run.body.appendChild(div)
 }
 applyTeamFilter()
 return
 }
  if (ev.type === 'error') {
  const box = document.createElement('div')
  box.className = 'agent-block err'
  box.dataset.agent = ev.agent || 'leader'
  box.innerHTML = `<div class="agent-head"><span class="agent-name">ERROR</span></div><div class="agent-body">${esc(ev.message)}</div>`
  run.body.appendChild(box); applyTeamFilter()
  if (ev.agent) { const last = Object.values(ref.stepBoxes).filter((s) => s.agent === ev.agent).pop(); setMsgStatus(last?.body, 'failed') }
  return
  }
 if (ev.type === 'done') {
  if (ev.cost != null) { state.teamTaskCost = Number(ev.cost) || 0; renderTeamBudget() }
  maybeNotify(ev.budgetStopped || ev.aborted ? '团队任务已停止' : '团队任务完成', `费用 ¥${Number(ev.cost || 0).toFixed(4)} · 工具 ${ev.toolCalls || 0} 次`)
  setTimeout(() => checkActiveRuns(true).catch(() => {}), 3500) // ★ 自动续跑：稍后检测新任务并弹出「接回任务」
  run.status.textContent = ev.budgetStopped || ev.aborted ? t('stopped') : `${t('done')} · ${t('toolCalls')} ${ev.toolCalls || 0}`
  run.foot.textContent = ` ${fmtCost(ev.cost)} · ${t('tokens')} ${fmtNum((ev.usage?.prompt_tokens || 0) + (ev.usage?.completion_tokens || 0))} · ${t('cache')} ${fmtNum(ev.cacheHitTokens)}`
  if (ref.finalBox) setMsgStatus(ref.finalBox, ev.budgetStopped || ev.aborted ? 'failed' : 'done')
  if (!ev.budgetStopped && !ev.aborted) roleSetStatus('leader', 'done')
 if (state.currentTeamTaskId === ev.taskId) { state.currentTeamTaskId = ''; state.runPaused = false; state.agentPaused = new Set(); updatePauseUI() }
 refreshTasks()
 }
}

/* ══════════════ 画板 / 代码 / 历史 ══════════════ */
function renderArtSelectors() {
 const ps = $('art-provider')
 const img = state.providers.filter((p) => (p.models || []).some((m) => (m.tags || []).includes('出图')))
 const src = img.length ? img : state.providers
 ps.innerHTML = src.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') || '<option value="">--</option>'
 if (state.settings.artProvider && src.some((p) =>p.id === state.settings.artProvider)) ps.value = state.settings.artProvider
 const wantModel = ps.value === state.settings.artProvider ? state.settings.artModel : null
 let html = groupedModelSelect(providerById(ps.value), wantModel, { filterTags: ['出图'] })
 if (!/<option value="[^"]+"/.test(html)) html = groupedModelSelect(providerById(ps.value), null)
 $('art-model').innerHTML = html
 ps.onchange = () => { saveArtSel(); renderArtSelectors() }
 $('art-model').onchange = saveArtSel
}
function saveArtSel() {
 state.settings.artProvider = $('art-provider').value
 state.settings.artModel = $('art-model').value
 api('PUT', '/api/settings', { artProvider: state.settings.artProvider, artModel: state.settings.artModel })
}
/* 画板/视频 生成状态提示（AI 调用可见） */
function setArtCallout(info) {
  if (!info) return
  const isVideo = info.kind === 'video'
  const box = $(isVideo ? 'video-callout' : 'art-callout')
  const tab = document.querySelector(`.subtab[data-panel="${isVideo ? 'video' : 'art'}"]`)
  if (!box) return
  const { who, phase, prompt: pr, ok } = info
  box.classList.remove('hidden')
  const label = isVideo ? '视频' : t('artPromptLabel')
  if (phase === 'start') {
    tab?.classList.add('busy')
    box.className = 'art-callout working'
    box.innerHTML = `<b>${esc(who || 'AI')}</b> ${t('artCalling')}…<div class="dim small">${isVideo ? '提示词' : t('artPromptLabel')}：${esc(pr || '')}</div>`
    switchSubtab(isVideo ? 'video' : 'art')
  } else {
    tab?.classList.remove('busy')
    box.className = 'art-callout done'
    box.innerHTML = `<b>${esc(who || 'AI')}</b> ${t('artCalloutDone')}${ok ? '' : '（失败）'}<div class="dim small">${isVideo ? '提示词' : t('artPromptLabel')}：${esc(pr || '')}</div>`
    refreshArtGallery()
  }
}
function switchSubtab(name) {
 document.querySelectorAll('.subtab').forEach((x) =>x.classList.toggle('active', x.dataset.panel === name))
 document.querySelectorAll('.subpanel').forEach((p) =>p.classList.toggle('active', p.id === `panel-${name}`))
}
async function btnArtGen() {
 const providerId = $('art-provider').value, model = $('art-model').value, prompt = $('art-prompt').value.trim()
 if (!providerId || !model || !prompt) return alert(t('artPrompt'))
 saveArtSel()
 setArtCallout({ who: '你', phase: 'start', prompt })
 $('btn-art-gen').disabled = true; $('art-status').textContent = '…'
 const r = await api('POST', '/api/images/generate', { providerId, model, prompt })
 $('btn-art-gen').disabled = false
 $('art-status').textContent = r.ok ? '✓' : (r.error || 'fail')
 setArtCallout({ who: '你', phase: 'done', prompt, ok: r.ok })
}
async function refreshArtGallery() {
  let items = []
  try { items = (await api('GET', '/api/art')).items || [] } catch { /* ignore */ }
  state.artItems = items
  refreshVideoGallery()
 const box = $('art-gallery')
 if (!box) return
 box.innerHTML = items.length ? items.map((it) => `
 <div class="art-item ${state.artSel.has(it.file) ? 'sel' : ''}" data-file="${esc(it.file)}">
 ${state.artMulti ? `<input type="checkbox" class="art-check" ${state.artSel.has(it.file) ? 'checked' : ''} />` : ''}
 <img src="${esc(it.url)}&t=${it.t || 0}" loading="lazy" />
 <div class="art-cap dim small">${esc(it.file)}</div>
 </div>`).join('') : '<div class="dim small">--</div>'
 box.querySelectorAll('.art-item').forEach((el) => {
 const file = el.dataset.file
 const item = items.find((x) =>x.file === file) || { file, url: '', t: 0 }
 el.onclick = (e) => {
 const toggled = () => {
 if (state.artSel.has(file)) state.artSel.delete(file); else state.artSel.add(file)
 el.classList.toggle('sel', state.artSel.has(file))
 const cb = el.querySelector('.art-check'); if (cb) cb.checked = state.artSel.has(file)
 updateArtSelInfo()
 }
 if (e.target.classList.contains('art-check')) { toggled(); return }
 if (state.artMulti) { toggled(); return }
 openArtViewer(item)
 }
 })
 updateArtSelInfo()
}
function updateArtSelInfo() {
 const n = state.artSel.size
 const info = $('art-sel-info'); if (info) info.textContent = n ? `${t('selectedCount')} ${n}` : ''
 $('btn-art-regen-sel')?.classList.toggle('hidden', !state.artMulti || !n)
 $('btn-art-del-sel')?.classList.toggle('hidden', !state.artMulti || !n)
 $('btn-art-multi')?.classList.toggle('primary', state.artMulti)
}
function openArtViewer(item) {
 state.viewerItem = item
 $('viewer-img').src = `${item.url}&t=${Date.now()}`
 $('viewer-prompt').textContent = item.prompt ? `提示词：${item.prompt}` : '（该图没有记录提示词）'
 $('art-viewer').classList.remove('hidden')
}
function openDelModal(items) {
 state.delTargets = items
 $('art-del-count').textContent = `共 ${items.length} 张：${items.slice(0, 5).map((x) =>x.file).join('、')}${items.length > 5 ? '…' : ''}`
 $('art-del-modal').classList.remove('hidden')
}
function openRegenModal(items) {
 state.regenTargets = items
 $('art-regen-count').textContent = `共 ${items.length} 张（各自使用原提示词）`
 $('art-regen-prompt').value = items.length === 1 ? (items[0].prompt || '') : ''
 $('art-regen-prompt').placeholder = t('regenPromptPh')
 $('art-regen-modal').classList.remove('hidden')
}
async function doRegen(items, replace) {
 const promptOverride = items.length === 1 ? $('art-regen-prompt').value : ''
 let ok = 0, fail = 0
 for (const it of items) {
 const r = await api('POST', '/api/art/regenerate', { file: it.file, prompt: promptOverride, replace })
 if (r.ok) ok++; else fail++
 }
 $('art-regen-modal').classList.add('hidden')
 state.artSel.clear()
 await refreshArtGallery()
 if (fail) alert(`${t('regenDone')}: ${ok}/${items.length}${fail ? `（失败 ${fail}）` : ''}`)
}
async function refreshWorkspace() {
 const r = await api('GET', '/api/workspace/tree')
 const entries = r.entries || []
 if (r.root) state.activeWorkspace = r.root
 renderWorkspaces()
 $('code-tree').innerHTML = entries.length ? entries.map((e) => `<div class="tree-row ${e.dir ? 'dir' : ''}" data-path="${esc(e.path)}" data-dir="${e.dir}">${e.dir ? '' : ''} ${esc(e.path)}</div>`).join('') : '<div class="dim small">--</div>'
 $('code-tree').querySelectorAll('.tree-row').forEach((row) => {
 row.onclick = async () => {
 if (row.dataset.dir === 'true') return
 const f = await api('GET', `/api/workspace/file?path=${encodeURIComponent(row.dataset.path)}`)
 if (!f.ok) { $('code-view').textContent = t('failure') + ': ' + f.error; return }
 // ★ 原始字节 → 依次尝试 UTF-8 / GBK 解码（修复中文源码乱码）
 let text = ''
try {
const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))
try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
catch { try { text = new TextDecoder('gbk').decode(bytes) } catch { text = new TextDecoder('utf-8').decode(bytes) } }
} catch (e) { text = t('failure') + ': ' + e.message }
$('code-view').textContent = text.slice(0, 200000)
 }
 })
 const dirs = entries.filter((e) =>e.dir && !e.path.includes('/'))
 const sel = $('gh-publish-dir'); const cur = sel.value
 sel.innerHTML = (dirs.length ? dirs : [{ path: '.', name: 'workspace' }]).map((d) => `<option value="${esc(d.path)}">${esc(d.path)}</option>`).join('')
 if (cur) sel.value = cur
}
async function refreshTasks() {
 const r = await api('GET', '/api/tasks')
 const tasks = r.tasks || []
 $('task-list').innerHTML = tasks.length ? tasks.map((x) => `<div class="task-item" data-id="${x.id}">
 <div class="task-title">${x.status === 'running' ? ' ' : ''}${esc(x.task.slice(0, 60))}</div>
 <div class="dim small">${esc(x.summary || '')} · ${x.steps} · ${fmtCost(x.cost)} · ${t('tokens')} ${fmtNum(x.tokens)} · ${t('cache')} ${fmtNum(x.cacheHitTokens)} · ${t('toolCalls')} ${x.toolCalls || 0}${x.status && x.status !== 'done' ? ' · ' + x.status : ''}</div>
 </div>`).join('') : `<div class="dim small">${t('noTasks')}</div>`
 $('task-list').querySelectorAll('.task-item').forEach((el) => {
 el.onclick = async () => {
 const r2 = await api('GET', `/api/tasks/${el.dataset.id}`)
 if (!r2.ok) return
 const task = r2.task
 const run = createRunBox(task.task)
 run.status.textContent = 'history'
 const box = document.createElement('div')
 box.className = 'plan-box'
 box.dataset.agent = 'leader'
 box.innerHTML = `<b>${t('planLabel')}</b><div class="dim small">${esc(task.plan?.summary || '')}</div>`
 run.body.appendChild(box)
 for (const res of task.results) runBlock(run, res.agent, `${roleLabel(res.agent)} · ${res.title || ''}`, `(history) ${fmtCost(task.roleUsage?.[res.agent]?.cost)}`).textContent = res.result
 applyTeamFilter()
 }
 })
}

/* ══════════════ 团队配置（预设/角色/技能/市场） ══════════════ */
// ★ 预设选择项解析：内置 + 自定义
function presetOf(value) {
 if (!value) return null
 if (value.startsWith('custom:')) {
  const cp = (state.customPresets || {})[value.slice(7)]
  return cp ? { custom: true, key: value.slice(7), label: cp.label, roles: cp.roles } : null
 }
 const p = TEAM_PRESETS[value]
 return p ? { custom: false, key: value, label: p.label, roles: p.roles, skillIds: p.skillIds } : null
}
function presetOptionsHtml(includeCurrent) {
 const built = Object.entries(TEAM_PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('')
 const cust = Object.entries(state.customPresets || {}).map(([k, p]) => `<option value="custom:${k}">${t('presetCustomPrefix')}${esc(p.label)}</option>`).join('')
 return `${includeCurrent ? `<option value="">${t('presetCurrent')}</option>` : ''}${built}${cust ? `<optgroup label="${t('presetCustomGroup')}">${cust}</optgroup>` : ''}`
}
function renderPresetSelect() {
 const sel = $('preset-select')
 if (!sel) return
 const cur = sel.value
 sel.innerHTML = presetOptionsHtml(false)
 if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur
 syncPresetButtons()
}
function syncPresetButtons() {
 const isCustom = ($('preset-select')?.value || '').startsWith('custom:')
 if ($('btn-del-preset')) $('btn-del-preset').classList.toggle('hidden', !isCustom)
}
async function applyTeamPreset(opts = {}) {
 const p = presetOf(opts.value != null ? opts.value : $('preset-select').value)
 if (!p) return false
 if (!opts.silent && !confirm(t('presetConfirm'))) return false
 if ($('preset-msg')) $('preset-msg').textContent = '…'
 let newRoles
 if (p.custom) {
  // 自定义预设：按保存的原样应用（含保存时的 API/模型）
  newRoles = (p.roles || []).map((r) => ({ ...r }))
 } else {
  // 1) 导入配套技能（技能市场 → 技能库）
  await api('POST', '/api/skills/market/import', { ids: p.skillIds })
  const [mk, all] = await Promise.all([api('GET', '/api/skills/market'), api('GET', '/api/skills')])
  const mkList = mk.skills || []
  const localByName = new Map((all.skills || []).map((s) => [s.name, s.id]))
  const skillIdOf = (mid) => localByName.get((mkList.find((x) => x.id === mid) || {}).name)
  // 2) 合并角色：保留同 id 已配置的 API/模型；★ 新角色继承队长已配置的 API/模型
  const leaderOld = roleById('leader')
  const fbProvider = leaderOld?.providerId || ''
  const fbModel = leaderOld?.model || ''
  newRoles = p.roles.map((pr) => {
   const old = roleById(pr.id)
   return { ...pr, providerId: old?.providerId || fbProvider, model: old?.model || fbModel, skills: (pr.skills || []).map(skillIdOf).filter(Boolean) }
  })
 }
 const r = await api('PUT', '/api/roles', newRoles)
 if (r.ok) {
  if ($('preset-msg')) $('preset-msg').textContent = t('presetApplied')
  await loadState(); renderRolesEditor(); renderRoleSummary(); renderPresetSelect()
 } else if ($('preset-msg')) $('preset-msg').textContent = r.error || 'fail'
 return !!r.ok
}
// ★ 把当前编辑器的角色配置保存为自定义预设
async function saveCustomPreset() {
 if (!$('roles-list')?.querySelector('.role-edit-row')) return
 const label = prompt(t('presetNameAsk'), '')
 if (label == null) return
 const roles = collectRolesEditor()
 const r = await api('POST', '/api/presets', { label: label.trim() || t('presetCustomDefault'), roles })
 if (!r.ok) { if ($('preset-msg')) $('preset-msg').textContent = r.error || 'fail'; return }
 await loadState(); renderPresetSelect()
 $('preset-select').value = 'custom:' + r.key
 syncPresetButtons()
 if ($('preset-msg')) $('preset-msg').textContent = t('presetSaved')
}
async function deleteCustomPreset() {
 const v = $('preset-select')?.value || ''
 if (!v.startsWith('custom:')) return
 if (!confirm(t('presetDeleteConfirm'))) return
 await api('DELETE', '/api/presets/' + v.slice(7))
 await loadState(); renderPresetSelect()
 if ($('preset-msg')) $('preset-msg').textContent = t('presetDeleted')
}
function renderRoleSummary() {
 $('role-summary').innerHTML = state.roles.filter((r) =>r.enabled !== false).map((r) => {
 const p = providerById(r.providerId)
 const rl = state.roleLive[r.id] || {}
 return `<div class="role-item ${state.teamFocus === r.id ? 'active' : ''}" data-role="${r.id}" style="cursor:pointer" title="${esc(t('focusHint'))}"><span class="role-dot" style="background:${esc(r.color || '#888')}"></span><b>${esc(r.label)}</b><span class="dim small">${p ? esc(p.name.split('（')[0]) + ' / ' + esc(r.model || '') : t('notConfigured')}</span><span class="dim small" style="margin-left:auto">${t(STATUS_KEY[rl.status || 'idle'] || 'stIdle')}</span></div>`
 }).join('')
 $('role-summary').querySelectorAll('.role-item').forEach((el) => {
 el.onclick = () => {
 switchView('team')
 setTeamFocus(el.dataset.role)
 switchSubtab('roles')
 focusRoleCol(el.dataset.role)
 }
 })
}
function renderRolesEditor() {
 $('roles-list').innerHTML = state.roles.map((r, i) => `
 <div class="role-edit-row" data-i="${i}">
 <div class="re-line">
 <input type="color" class="re-color" value="${esc(r.color || '#888888')}" />
 <input class="re-label" value="${esc(r.label || '')}" placeholder="${t('roleName')}" />
 <input class="re-desc" value="${esc(r.desc || '')}" placeholder="${t('roleDesc')}" />
 <label class="chk" title="${t('budget')}"><span class="small">${t('budget')}</span><input class="re-budget" type="number" min="0" step="1" value="${r.budgetCost || ''}" style="width:80px" placeholder="0" /></label>
 <label class="chk"><input type="checkbox" class="re-enabled" ${r.enabled !== false ? 'checked' : ''} /> ${t('enabled')}</label>
 <button class="btn danger tiny re-del" data-i="${i}">✕</button>
 </div>
 <div class="re-line">
 <select class="re-provider">${state.providers.map((p) => `<option value="${p.id}" ${p.id === r.providerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('') || '<option value="">--</option>'}</select>
 <select class="re-model">${groupedModelSelect(providerById(r.providerId), r.model)}</select>
 <select class="re-perm" title="${t('rolePerm')}">
 <option value="" ${!r.permission ? 'selected' : ''}>${t('permFollow')}</option>
 <option value="view" ${r.permission === 'view' ? 'selected' : ''}>${t('permView')}</option>
 <option value="modify" ${r.permission === 'modify' ? 'selected' : ''}>${t('permModify')}</option>
 <option value="limited" ${r.permission === 'limited' ? 'selected' : ''}>${t('permLimited')}</option>
 <option value="full" ${r.permission === 'full' ? 'selected' : ''}>${t('permFullOpt')}</option>
 </select>
 </div>
 <textarea class="re-prompt" rows="2" placeholder="${t('rolePromptPh')}">${esc(r.systemPrompt || '')}</textarea>
 <div class="re-skills">${state.skills.length ? state.skills.map((s) => `<label class="chk"><input type="checkbox" class="re-skill" value="${esc(s.id)}" ${(r.skills || []).includes(s.id) ? 'checked' : ''} /> ${esc(s.name)}</label>`).join('') : `<span class="dim small">${t('noSkills')}</span>`}</div>
 </div>`).join('')
 $('roles-list').querySelectorAll('.role-edit-row').forEach((row) => {
 const ps = row.querySelector('.re-provider'), ms = row.querySelector('.re-model')
 ps.onchange = () => { ms.innerHTML = groupedModelSelect(providerById(ps.value), null) }
 row.querySelector('.re-del').onclick = async () => {
 const i = Number(row.dataset.i)
 if (!confirm(`${t('delete')} ${state.roles[i]?.label}?`)) return
 state.roles.splice(i, 1)
 await api('PUT', '/api/roles', state.roles)
 await loadState(); renderRolesEditor()
 }
 })
}
// ★ 从编辑器收集当前（可能未保存）的角色配置
function collectRolesEditor() {
 return [...$('roles-list').querySelectorAll('.role-edit-row')].map((row) => {
  const old = state.roles[Number(row.dataset.i)] || {}
  return {
   id: old.id || crypto.randomUUID(),
   label: row.querySelector('.re-label').value.trim() || 'Role',
   color: row.querySelector('.re-color').value,
   desc: row.querySelector('.re-desc').value.trim(),
   enabled: row.querySelector('.re-enabled').checked,
   budgetCost: Number(row.querySelector('.re-budget').value) || 0,
   providerId: row.querySelector('.re-provider').value,
   model: row.querySelector('.re-model').value,
   permission: row.querySelector('.re-perm').value,
   systemPrompt: row.querySelector('.re-prompt').value,
   skills: [...row.querySelectorAll('.re-skill:checked')].map((cb) => cb.value),
  }
 })
}
async function saveRolesEditor() {
 const out = collectRolesEditor()
 const r = await api('PUT', '/api/roles', out)
 $('roles-msg').textContent = r.ok ? t('savedOk') : (r.error || 'fail')
 $('roles-msg').className = 'modal-msg ' + (r.ok ? 'ok' : 'err')
 if (r.ok) { await loadState(); renderRolesEditor(); renderRoleSummary() }
}
function renderSkillsList() {
 $('skills-list').innerHTML = state.skills.length ? state.skills.map((s, i) => `
 <div class="skill-row" data-i="${i}">
 <input class="sk-name" value="${esc(s.name)}" />
 <input class="sk-desc" value="${esc(s.description || '')}" />
 <textarea class="sk-prompt" rows="2">${esc(s.prompt || '')}</textarea>
 <button class="btn ghost tiny sk-save">${t('save')}</button>
 <button class="btn danger tiny sk-del">✕</button>
 </div>`).join('') : `<div class="dim small">${t('noSkills')}</div>`
 $('skills-list').querySelectorAll('.skill-row').forEach((row) => {
 const id = state.skills[Number(row.dataset.i)].id
 row.querySelector('.sk-save').onclick = async () => {
 await api('PUT', `/api/skills/${id}`, { name: row.querySelector('.sk-name').value, description: row.querySelector('.sk-desc').value, prompt: row.querySelector('.sk-prompt').value })
 await loadState(); renderSkillsList()
 }
 row.querySelector('.sk-del').onclick = async () => { if (confirm(t('delete'))) { await api('DELETE', `/api/skills/${id}`); await loadState(); renderSkillsList() } }
 })
}
async function renderMarket() {
 const r = await api('GET', '/api/skills/market')
 const box = $('market-list')
 if (!r.ok) { box.innerHTML = ''; return }
 box.innerHTML = `<div class="gh-row" style="margin-bottom:8px"><button class="btn ghost" id="btn-market-all">＋ ${t('importAll')}</button></div>` + r.skills.map((s) => `
 <div class="market-card">
 <div><b>${esc(s.name)}</b> <span class="badge">${esc((s.tags || []).join('/'))}</span></div>
 <div class="dim small">${esc(s.description)}</div>
 <button class="btn ghost tiny" data-id="${esc(s.id)}">${t('importOne')}</button>
 </div>`).join('')
 $('btn-market-all').onclick = async () => { await api('POST', '/api/skills/market/import', { ids: r.skills.map((s) =>s.id) }); await loadState(); renderSkillsList() }
 box.querySelectorAll('button[data-id]').forEach((b) => { b.onclick = async () => { await api('POST', '/api/skills/market/import', { id: b.dataset.id }); await loadState(); renderSkillsList() } })
}
async function addSkill() {
 const name = $('sk-name').value.trim(), prompt = $('sk-prompt').value.trim()
 if (!name || !prompt) return alert('name & prompt required')
 await api('POST', '/api/skills', { name, description: $('sk-desc').value.trim(), prompt })
 $('sk-name').value = ''; $('sk-desc').value = ''; $('sk-prompt').value = ''
 await loadState(); renderSkillsList()
}
async function importSkills(url) {
 const r = await api('POST', '/api/skills/import', url ? { url } : { json: $('sk-import-json').value })
 $('skills-msg').textContent = r.ok ? `${t('skillImportDone')}: ${r.imported}` : (r.error || 'fail')
 if (r.ok) { await loadState(); renderSkillsList() }
}

/* ══════════════ API 弹窗 / 插件 / GitHub / 统计 / 调试 ══════════════ */
let editingId = null
function openModal(id = null) {
 editingId = id
 const p = id ? providerById(id) : null
 $('modal-title').textContent = p ? `${t('edit')}: ${p.name}` : t('addProvider')
 $('f-template').value = p?.template || 'deepseek'
 $('f-name').value = p?.name || ''
 $('f-baseurl').value = p?.baseUrl || state.templates['deepseek']?.baseUrl || ''
 $('f-apikey').value = ''
 $('f-capabilities').value = (p?.capabilities || state.templates['deepseek']?.capabilities || []).join(', ')
 $('f-note').value = p?.note || ''
 $('f-price-in').value = p?.defaultPrice?.inMiss ?? ''
 $('f-price-out').value = p?.defaultPrice?.out ?? ''
 state.mm.models = p?.models?.length ? p.models.map((m) => ({ ...m })) : (state.templates[$('f-template').value]?.models || []).map((x) => ({ id: x, tags: [] }))
 state.mm.selected = new Set(state.mm.models.map((m) =>m.id))
 renderModelManager()
 $('modal-msg').textContent = ''
 $('modal').classList.remove('hidden')
}
function renderModelManager() {
 const kw = $('mm-search').value.trim().toLowerCase()
 const list = state.mm.models.filter((m) => !kw || m.id.toLowerCase().includes(kw))
 $('mm-count').textContent = `${state.mm.selected.size}/${state.mm.models.length}`
 $('mm-list').innerHTML = list.slice(0, 400).map((m) => `
 <label class="mm-row"><input type="checkbox" data-model="${esc(m.id)}" ${state.mm.selected.has(m.id) ? 'checked' : ''} />
 <span class="mm-id">${esc(m.id)}</span>
 <span class="mm-tags">${(m.tags || []).map((x) => `<span class="badge t-${esc(x)}">${esc(x)}</span>`).join('')}</span></label>`).join('') || '<div class="dim small" style="padding:8px">--</div>'
 $('mm-list').querySelectorAll('input[type=checkbox]').forEach((cb) => { cb.onchange = () => { cb.checked ? state.mm.selected.add(cb.dataset.model) : state.mm.selected.delete(cb.dataset.model); $('mm-count').textContent = `${state.mm.selected.size}/${state.mm.models.length}` } })
}
async function saveModal() {
 const models = state.mm.models.filter((m) =>state.mm.selected.has(m.id))
 const pin = parseFloat($('f-price-in').value), pout = parseFloat($('f-price-out').value)
 const body = { template: $('f-template').value, name: $('f-name').value.trim(), baseUrl: $('f-baseurl').value.trim(), apiKey: $('f-apikey').value.trim(), models, capabilities: $('f-capabilities').value, note: $('f-note').value.trim(), defaultPrice: (isFinite(pin) || isFinite(pout)) ? { inMiss: isFinite(pin) ? pin : 0, out: isFinite(pout) ? pout : 0 } : null }
 const r = editingId ? await api('PUT', `/api/providers/${editingId}`, body) : await api('POST', '/api/providers', body)
 if (!r.ok) { $('modal-msg').textContent = r.error || 'fail'; return }
 $('modal').classList.add('hidden')
 await loadState()
}
function renderJsPlugins() {
 $('jp-list').innerHTML = state.jsPlugins.length ? state.jsPlugins.map((p) => `<div class="plugin-item"><div class="plugin-head"><b>${esc(p.name)}</b><span class="badge">${esc(p.file)}</span>
 <label class="chk"><input type="checkbox" data-en="${esc(p.file)}" ${p.enabled ? 'checked' : ''} /> ${t('enabled')}</label>
 <span class="dim small">${p.tools.map((x) => `${esc(x)}`).join(' ') || (p.error ? ' ' + esc(p.error) : '')}</span>
 <button class="btn danger tiny" data-del="${esc(p.file)}">✕</button></div></div>`).join('') : '<div class="dim small">--</div>'
 $('jp-list').querySelectorAll('input[data-en]').forEach((cb) => { cb.onchange = async () => { await api('PUT', `/api/jsplugins/${encodeURIComponent(cb.dataset.en)}`, { enabled: cb.checked }); await loadState(); renderJsPlugins() } })
 $('jp-list').querySelectorAll('button[data-del]').forEach((b) => { b.onclick = async () => { if (confirm(t('delete'))) { await api('DELETE', `/api/jsplugins/${encodeURIComponent(b.dataset.del)}`); await loadState(); renderJsPlugins() } } })
}
async function importJsPlugin(url) {
 $('jp-msg').textContent = '…'
 const r = await api('POST', '/api/jsplugins/import', url ? { url, name: $('jp-name').value.trim() || undefined } : { code: $('jp-code').value, name: $('jp-name').value.trim() || 'plugin' })
 $('jp-msg').textContent = r.ok ? `${t('importDone')}: ${r.file}` : (r.error || 'fail')
 if (r.ok) { $('jp-code').value = ''; await loadState(); renderJsPlugins() }
}
function renderPlugins() {
 $('plugin-list').innerHTML = state.plugins.length ? state.plugins.map((p) => `<div class="plugin-item"><div class="plugin-head"><b>${esc(p.name)}</b><span class="badge">${esc(p.method)}</span><span class="dim small">${esc(p.description || '')}</span><button class="btn danger tiny" data-del="${p.id}">✕</button></div><div class="dim small">${esc(p.url)}</div></div>`).join('') : '<div class="dim small">--</div>'
 $('plugin-list').querySelectorAll('button[data-del]').forEach((b) => { b.onclick = async () => { await api('DELETE', `/api/plugins/${b.dataset.del}`); await loadState(); renderPlugins() } })
}
async function addPlugin() {
 let headers = {}
 try { headers = $('pl-headers').value.trim() ? JSON.parse($('pl-headers').value) : {} } catch { return alert('Headers JSON invalid') }
 const body = { name: $('pl-name').value.trim(), description: $('pl-desc').value.trim(), method: $('pl-method').value, url: $('pl-url').value.trim(), params: $('pl-params').value, headers, body: $('pl-body').value.trim() }
 if (!body.name || !body.url) return alert('name & url required')
 await api('POST', '/api/plugins', body)
 ;['pl-name', 'pl-desc', 'pl-url', 'pl-params', 'pl-headers', 'pl-body'].forEach((id) => ($(id).value = ''))
 await loadState(); renderPlugins()
}
async function refreshGithub() {
 const st = await api('GET', '/api/github/status')
 $('gh-status').textContent = st.hasToken ? `${st.login || '...'}` : t('notConfigured')
 if (!st.hasToken) { $('gh-repos').innerHTML = ''; return }
 const r = await api('GET', '/api/github/repos')
 $('gh-repos').innerHTML = r.ok ? r.repos.slice(0, 60).map((x) => `<span class="repo-chip" data-repo="${esc(x.full_name)}">${x.private ? '' : ''} ${esc(x.full_name)}</span>`).join('') : esc(r.error || '')
 $('gh-repos').querySelectorAll('.repo-chip').forEach((c) => { c.onclick = () => { $('gh-clone-repo').value = c.dataset.repo } })
}
async function ghClone() {
 const repo = $('gh-clone-repo').value.trim(); if (!repo) return
 $('gh-publish-result').textContent = '…'
 const r = await api('POST', '/api/github/clone', { repo, dir: $('gh-clone-dir').value.trim() })
 $('gh-publish-result').textContent = r.ok ? `✓ workspace/${r.dir}` : (t('failure') + ': ' + r.error)
 refreshWorkspace()
}
async function ghPublish() {
 $('gh-publish-result').textContent = '…'
 const r = await api('POST', '/api/github/publish', { dir: $('gh-publish-dir').value, repoName: $('gh-publish-name').value.trim(), isPrivate: $('gh-publish-private').checked, message: 'Update from Open Agent Team' })
 $('gh-publish-result').textContent = r.ok ? ` ${r.files} files → ${r.url}` : (t('failure') + ': ' + r.error)
}
function statCard(label, value, sub) { return `<div class="stat-card"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div>${sub ? `<div class="dim small">${esc(sub)}</div>` : ''}</div>` }
async function refreshStats() {
 const r = await api('GET', '/api/stats'); if (!r.ok) return
 const s = r.stats
 const hitRate = s.promptTokens ? ((s.cacheHitTokens / s.promptTokens) * 100).toFixed(1) + '%' : '--'
 $('st-cards').innerHTML = [statCard('Calls', fmtNum(s.calls)), statCard(`${t('tokens')} ${t('input')}`, fmtNum(s.promptTokens)), statCard(`${t('tokens')} ${t('output')}`, fmtNum(s.completionTokens)), statCard(t('cache'), `${fmtNum(s.cacheHitTokens)} (${hitRate})`), statCard(t('cost'), fmtCost(s.cost)), statCard(t('toolCalls'), fmtNum(s.toolCalls))].join('')
 const lu = state.lastUsage
 $('st-context').textContent = lu ? `${t('context')}: ${fmtNum(lu.prompt)} / ${fmtNum(lu.limit)} (${lu.limit ? ((lu.prompt / lu.limit) * 100).toFixed(1) + '%' : '-'})` : ''
 const row = (k, v) => `<div class="stat-row"><b>${esc(k)}</b><span>${fmtNum(v.promptTokens)}/${fmtNum(v.completionTokens)}</span><span>${t('cache')} ${fmtNum(v.cacheHitTokens)}</span><span>${fmtCost(v.cost)}</span><span>${t('toolCalls')} ${v.toolCalls || 0}</span></div>`
 $('st-roles').innerHTML = Object.entries(s.byRole || {}).map(([k, v]) =>row(roleLabel(k), v)).join('') || '<div class="dim small">--</div>'
 $('st-models').innerHTML = Object.entries(s.byModel || {}).map(([k, v]) =>row(k, v)).join('') || '<div class="dim small">--</div>'
 const tr = await api('GET', '/api/tasks')
 $('st-tasks').innerHTML = (tr.tasks || []).slice(0, 20).map((x) => `<div class="stat-row"><b>${esc(x.task.slice(0, 36))}</b><span>${t('tokens')} ${fmtNum(x.tokens)}</span><span>${t('cache')} ${fmtNum(x.cacheHitTokens)}</span><span>${fmtCost(x.cost)}</span><span>${t('toolCalls')} ${x.toolCalls || 0}</span></div>`).join('') || '<div class="dim small">--</div>'
}
function renderDebugSettings() {
 $('dbg-developer').checked = !!state.settings.developerMode
 $('dbg-exe').checked = !!state.settings.exeEnabled
 const list = state.settings.exeAllowlist || []
 $('exe-allowlist').innerHTML = list.length ? list.map((p, i) => `<div>${esc(p)} <button class="btn ghost tiny" data-i="${i}">✕</button></div>`).join('') : '--'
 $('exe-allowlist').querySelectorAll('button[data-i]').forEach((b) => { b.onclick = async () => { const arr = [...list]; arr.splice(Number(b.dataset.i), 1); await api('PUT', '/api/settings', { exeAllowlist: arr }); await loadState(); renderDebugSettings() } })
}
async function refreshDebugEvents() {
 const r = await api('GET', '/api/debug/events?limit=120')
 $('debug-events').innerHTML = (r.events || []).map((e) => `<div class="dbg-row"><span class="dim">${new Date(e.t).toLocaleTimeString()}</span> <b>${esc(e.type)}</b> <span class="dim small">${esc(JSON.stringify(e.data)).slice(0, 200)}</span></div>`).join('') || '<div class="dim small">--</div>'
}
async function refreshDebug() { renderDebugSettings(); refreshDebugEvents() }

/* ══════════════ 工作区 ══════════════ */
async function refreshWorkspaces() {
 const r = await api('GET', '/api/workspaces')
 if (r.ok) { state.workspaces = r.workspaces; state.activeWorkspace = r.active }
 renderWorkspaces()
}
function renderWorkspaces() {
 $('workspace-select').innerHTML = (state.workspaces || []).map((w) => `<option value="${esc(w.path)}" ${w.path === state.activeWorkspace ? 'selected' : ''}> ${esc(w.path)}${w.exists ? '' : ' (missing)'}</option>`).join('') || '<option value="">--</option>'
 $('code-ws-path').textContent = t('workspace') + (state.activeWorkspace || '-')
 if ($('chat-ws')) $('chat-ws').textContent = state.activeWorkspace ? ` ${state.activeWorkspace}` : ''
}
async function addWorkspace() {
 const btn = $('btn-workspace-add'); const old = btn.textContent
 btn.disabled = true; btn.textContent = '…'
 $('ws-pick-hint').classList.remove('hidden')
 const r = await api('POST', '/api/workspaces/pick').catch(() =>null)
 btn.disabled = false; btn.textContent = old
 $('ws-pick-hint').classList.add('hidden')
 if (r && r.ok && !r.canceled) { await refreshWorkspaces(); refreshWorkspace(); refreshArtGallery(); return }
 if (r && r.canceled) return
 manualAddWorkspace(r && r.error)
}
async function manualAddWorkspace(errMsg) {
 const p = prompt((errMsg ? errMsg + '\n\n' : '') + 'Path / 绝对路径：')
 if (!p) return
 const r2 = await api('POST', '/api/workspaces', { path: p.trim() })
 if (!r2.ok) return alert(r2.error || 'fail')
 await refreshWorkspaces(); refreshWorkspace(); refreshArtGallery()
}
async function removeWorkspace() {
 if (!state.activeWorkspace) return
 if (!confirm(state.activeWorkspace)) return
 const r = await api('DELETE', '/api/workspaces', { path: state.activeWorkspace })
 if (!r.ok) return alert(r.error || 'fail')
 await refreshWorkspaces(); refreshWorkspace(); refreshArtGallery()
}

/* ══════════════ 视图 ══════════════ */
function switchView(name) {
 document.body.classList.remove('rail-open') // ★ TAT 移动端：切换页面时收起侧栏抽屉
 document.querySelectorAll('.tab').forEach((x) =>x.classList.toggle('active', x.dataset.view === name))
 document.querySelectorAll('.view').forEach((v) =>v.classList.toggle('active', v.id === `view-${name}`))
 $('sidebar-providers').classList.toggle('hidden', name !== 'chat')
 $('sidebar-roles').classList.toggle('hidden', name !== 'team')
  if (name === 'providers') { renderProviderCards(); refreshVault() }
  if (name === 'team') {
    renderRoleSummary(); refreshArtGallery(); refreshWorkspace(); refreshTasks(); refreshStats()
    renderRoleActivity(); renderRolesLive(); renderVideoSelectors(); renderOpenApi()
    if (!state.teamLoaded) { state.teamLoaded = true; refreshTeamSessions().then(() => renderTeamSession()) }
  }
  if (name === 'settings') renderSettings()
 if (name === 'teamconfig') { renderRolesEditor(); renderSkillsList(); renderMarket() }
 if (name === 'plugins') { renderJsPlugins(); renderPlugins() }
 if (name === 'github') refreshGithub()
 if (name === 'stats') refreshStats()
 if (name === 'debug') refreshDebug()
 renderWorkspaces()
}
function renderProviderCards() {
 const box = $('provider-cards')
 box.innerHTML = state.providers.length ? state.providers.map((p) => {
 const bt = balanceText(p)
 const tagCount = {}
 for (const m of p.models || []) for (const x of m.tags || []) tagCount[x] = (tagCount[x] || 0) + 1
 return `<div class="provider-detail">
 <h3>${esc(p.name)}</h3>
 <div class="row">${esc(state.templates[p.template]?.label || p.template)} · ${esc(p.keyMasked || t('notConfigured'))}</div>
 <div class="row">${esc(p.baseUrl || '-')}</div>
 <div class="row">${t('balance')}: <span class="amount ${bt.cls}">${esc(bt.text)}</span>${p.defaultPrice ? `　¥${p.defaultPrice.inMiss || 0}/${p.defaultPrice.out || 0} per M` : ''}</div>
 ${subscriptionHTML(p)}
 <div class="row">${t('models')}(${(p.models || []).length}): ${esc(Object.entries(tagCount).map(([x, n]) => `${x} ${n}`).join(' / ') || '-')}</div>
 <div class="actions">
 <button class="btn ghost" data-act="models" data-id="${p.id}">${t('manageModels')}</button>
 <button class="btn ghost" data-act="test" data-id="${p.id}">${t('test')}</button>
 <button class="btn ghost" data-act="use" data-id="${p.id}">${t('useForChat')}</button>
 <button class="btn ghost" data-act="edit" data-id="${p.id}">${t('edit')}</button>
 <button class="btn danger" data-act="del" data-id="${p.id}">${t('delete')}</button>
 </div></div>`
 }).join('') : `<p class="dim">${t('none2')}</p>`
 box.querySelectorAll('button[data-act]').forEach((btn) => {
 btn.onclick = async () => {
 const id = btn.dataset.id, act = btn.dataset.act
 if (act === 'test') { btn.textContent = '…'; const r = await api('POST', `/api/providers/${id}/test`); state.balances[id] = r.result; renderSidebar(); renderProviderCards() }
 else if (act === 'models' || act === 'edit') openModal(id)
 else if (act === 'use') { state.selectedId = id; state.expanded = new Set([id]); renderSidebar(); renderChatToolbar(); switchView('chat') }
 else if (act === 'del') { if (confirm(`${t('delete')} ${providerById(id)?.name}?`)) { await api('DELETE', `/api/providers/${id}`); await loadState() } }
 }
 })
}
async function refreshAllBalances() {
 if (!state.providers.length) return
 $('btn-refresh-all').textContent = '…'
 const r = await api('GET', '/api/balances')
 if (r.ok) state.balances = { ...state.balances, ...r.balances }
 $('btn-refresh-all').textContent = t('refreshBalance')
 renderSidebar(); renderProviderCards()
 $('balance-summary').textContent = `${state.providers.length} APIs`
}

/* ══════════════ 可拖拽分栏 ══════════════ */
function initSplitters() {
  const setup = (id, cssVar, min, max, invert) => {
    const el = $(id)
    if (!el) return
    const saved = localStorage.getItem('oat-split-' + id)
    if (saved) document.documentElement.style.setProperty(cssVar, saved + 'px')
    let startX = 0, startW = 0
    const onMove = (e) => {
      const dx = (e.clientX - startX) * (invert ? -1 : 1)
      let w = startW + dx
      w = Math.max(min, Math.min(max, w))
      document.documentElement.style.setProperty(cssVar, w + 'px')
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing')
      const w = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
      if (w) localStorage.setItem('oat-split-' + id, parseInt(w, 10))
    }
    el.onmousedown = (e) => {
      e.preventDefault()
 const target = cssVar === '--sidebar-w' ? document.querySelector('.sidebar')
 : cssVar === '--rail-w' ? $('chat-rail')
 : cssVar === '--codetree-w' ? $('code-tree')
 : document.querySelector('.team-side')
      if (!target) return
      startX = e.clientX
      startW = target.getBoundingClientRect().width
      document.body.classList.add('resizing')
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
  }
 setup('split-sidebar', '--sidebar-w', 220, 560, false)
 setup('split-rail', '--rail-w', 200, 520, true)
 setup('split-team', '--teamsize-w', 300, 720, true)
 setup('split-code', '--codetree-w', 130, 420, false)
}

/* ══════════════ 对话/团队内联媒体展示（生成结果直接可见） ══════════════ */
const ART_URL_RE = /\/api\/artifact\?path=[^\s"'<>)]+/g
function appendMediaCard(container, text) {
  const urls = [...new Set(String(text || '').match(ART_URL_RE) || [])]
  if (!urls.length) return
  const el = document.createElement('div')
  el.className = 'media-card'
  el.innerHTML = urls.map((u) => {
    const isVideo = /\.(mp4|webm)(&|$)/i.test(u) || decodeURIComponent(u).match(/\.(mp4|webm)$/i)
    const file = decodeURIComponent(u.replace('/api/artifact?path=', '')).split('/').pop()
    return isVideo
      ? `<figure><video src="${esc(u)}" controls preload="metadata"></video><figcaption class="dim small">${esc(file)}</figcaption></figure>`
      : `<figure><img src="${esc(u)}" loading="lazy" /><figcaption class="dim small">${esc(file)}</figcaption></figure>`
  }).join('')
  container.appendChild(el)
  el.querySelectorAll('img').forEach((img) => {
    img.onclick = () => openArtViewer({ url: img.src.split('&t=')[0], file: img.alt || '', prompt: '', t: 0 })
  })
  const box = container.closest('.chat-messages') || container.closest('.run-body') || container
  box.scrollTop = box.scrollHeight
  return el
}

/* ══════════════ 新建团队会话（角色配置 + 工作区 + 名称） ══════════════ */
function renderTsRoles() {
  $('ts-roles').innerHTML = state.roles.map((r) => `
    <label class="ts-role">
      <input type="checkbox" class="ts-role-ck" data-id="${r.id}" ${r.enabled !== false ? 'checked' : ''} />
      <span class="role-dot" style="background:${esc(r.color || '#888')}"></span>
      <b>${esc(r.label)}</b>
      <span class="dim small">${esc((providerById(r.providerId)?.name || '').split('（')[0] || t('notConfigured'))}${r.model ? ' / ' + esc(r.model) : ''}</span>
    </label>`).join('')
}
function openTeamSessionModal() {
  $('ts-workspace').innerHTML = state.workspaces.map((w) => `<option value="${esc(w.path)}" ${w.path === state.activeWorkspace ? 'selected' : ''}>${esc(w.path)}</option>`).join('') || `<option value="">${esc(state.activeWorkspace)}</option>`
  // ★ 预设下拉：选中后直接套用该预设的角色（含自定义预设），并刷新角色勾选列表
  $('ts-preset').innerHTML = presetOptionsHtml(true)
  $('ts-preset').value = ''
  $('ts-preset').onchange = async () => {
    const v = $('ts-preset').value
    if (!v) { renderTsRoles(); return }
    $('ts-msg').textContent = '…'
    const ok = await applyTeamPreset({ silent: true, value: v })
    $('ts-msg').textContent = ok ? t('presetApplied') : t('failure')
    renderTsRoles()
  }
  renderTsRoles()
  $('ts-title').value = ''
  $('ts-msg').textContent = ''
  $('team-session-modal').classList.remove('hidden')
}
async function createTeamSessionFromModal() {
  const rolesNext = state.roles.map((r) => ({ ...r, enabled: $(`ts-roles`).querySelector(`.ts-role-ck[data-id="${r.id}"]`)?.checked !== false }))
  const r = await api('PUT', '/api/roles', rolesNext)
  if (!r.ok) { $('ts-msg').textContent = r.error || 'fail'; return }
  const body = { kind: 'team', workspace: $('ts-workspace').value || state.activeWorkspace, title: $('ts-title').value.trim(), providerId: state.providers[0]?.id || '', model: state.providers[0]?.models?.[0]?.id || '' }
  const cr = await api('POST', '/api/sessions', body)
  if (!cr.ok) { $('ts-msg').textContent = cr.error || 'fail'; return }
  $('team-session-modal').classList.add('hidden')
  await loadState()
  state.teamSessionId = cr.session.id
  await refreshTeamSessions(cr.session.id)
  renderTeamSession()
  switchView('team')
}

/* ══════════════ 视频生成（与画板同构） ══════════════ */
function renderVideoSelectors() {
  const ps = $('video-provider')
  if (!ps) return
  const vids = state.providers.filter((p) => (p.models || []).some((m) => (m.tags || []).includes('视频')))
  const src = vids.length ? vids : state.providers
  ps.innerHTML = src.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') || '<option value="">--</option>'
  if (state.settings.videoProvider && src.some((p) => p.id === state.settings.videoProvider)) ps.value = state.settings.videoProvider
  const wantModel = ps.value === state.settings.videoProvider ? state.settings.videoModel : null
  let html = groupedModelSelect(providerById(ps.value), wantModel, { filterTags: ['视频'] })
  if (!/<option value="[^"]+"/.test(html)) html = groupedModelSelect(providerById(ps.value), null)
  $('video-model').innerHTML = html
  ps.onchange = () => { saveVideoSel(); renderVideoSelectors() }
  $('video-model').onchange = saveVideoSel
}
function saveVideoSel() {
  state.settings.videoProvider = $('video-provider').value
  state.settings.videoModel = $('video-model').value
  api('PUT', '/api/settings', { videoProvider: state.settings.videoProvider, videoModel: state.settings.videoModel })
}
async function btnVideoGen() {
  const providerId = $('video-provider').value, model = $('video-model').value, prompt = $('video-prompt').value.trim()
  if (!providerId || !model || !prompt) return alert(t('videoPromptPh'))
  saveVideoSel()
  setArtCallout({ who: '你', phase: 'start', prompt, kind: 'video' })
  $('btn-video-gen').disabled = true; $('video-status').textContent = '生成中（视频通常需要几分钟）…'
  const r = await api('POST', '/api/videos/generate', { providerId, model, prompt })
  $('btn-video-gen').disabled = false
  $('video-status').textContent = r.ok ? '完成' : (r.error || 'failed')
  setArtCallout({ who: '你', phase: 'done', prompt, ok: r.ok, kind: 'video' })
}
async function refreshVideoGallery() {
  const items = (state.artItems || []).filter((x) => x.kind === 'video')
  const box = $('video-gallery')
  if (!box) return
  box.innerHTML = items.length ? items.map((it) => `
    <div class="art-item" data-file="${esc(it.file)}">
      <video src="${esc(it.url)}&t=${it.t || 0}" controls preload="metadata"></video>
      <div class="art-cap dim small">${esc(it.file)}</div>
    </div>`).join('') : '<div class="dim small">--</div>'
}

/* ══════════════ 开放 API（团队内快捷注册 HTTP 工具） ══════════════ */
async function renderOpenApi() {
  const box = $('oa-list')
  if (!box) return
  const r = await api('GET', '/api/plugins')
  const list = r.plugins || []
  box.innerHTML = list.length ? list.map((p) => `
    <div class="plugin-item">
      <div class="plugin-head"><b>${esc(p.name)}</b><span class="badge">${esc(p.method || 'GET')}</span><span class="dim small">${esc(p.description || '')}</span></div>
      <div class="dim small">${esc(p.url || '')}${(p.params || []).length ? ' · 参数：' + esc((p.params || []).join(', ')) : ''}</div>
    </div>`).join('') : `<div class="dim small">${t('oaEmpty')}</div>`
  const jr = await api('GET', '/api/jsplugins')
  const tools = (jr.plugins || []).flatMap((p) => (p.tools || []).map((x) => `${x}（${p.name}）`))
  $('oa-jslist').innerHTML = tools.length ? tools.map((x) => `<span class="badge">${esc(x)}</span>`).join(' ') : '--'
  $('oa-list').onclick = null
}

/* ══════════════ 凭据保险箱 ══════════════ */
async function refreshVault() {
  const r = await api('GET', '/api/vault')
  const box = $('vault-list')
  if (!box) return
  state.vault = { hasPassword: !!r.hasPassword, items: r.items || [] }
  box.innerHTML = (r.items || []).length ? r.items.map((it) => `
    <div class="vault-item">
      <div class="vault-head"><b>${esc(it.name)}</b>${it.note ? `<span class="badge">${esc(it.note)}</span>` : ''}<span class="dim small">${esc(it.baseUrl || '')}</span><span class="dim small">${esc(it.keyMasked || '')}</span>
        <span class="vault-acts">
          <button class="btn ghost tiny" data-vact="show" data-id="${it.id}">查看</button>
          <button class="btn ghost tiny" data-vact="del" data-id="${it.id}">删除</button>
        </span>
      </div>
    </div>`).join('') : `<div class="dim small">${t('vaultEmpty')}</div>`
  box.querySelectorAll('button[data-vact]').forEach((b) => {
    b.onclick = async () => {
      const it = (r.items || []).find((x) => x.id === b.dataset.id)
      if (!it) return
      if (b.dataset.vact === 'del') {
        if (!confirm(`${t('delete')} ${it.name}?`)) return
        await api('DELETE', `/api/vault/${it.id}`)
        await refreshVault()
        return
      }
      if (state.vault.hasPassword) {
        state.vaultPending = it
        $('vr-name').textContent = it.name
        $('vr-pass').value = ''
        $('vr-msg').textContent = ''
        $('vault-reveal-modal').classList.remove('hidden')
      } else {
        const rv = await api('POST', '/api/vault/reveal', { id: it.id, password: '' })
        if (rv.ok) showVaultItem(it, rv.key)
      }
    }
  })
}
function showVaultItem(it, key) {
  $('vs-name').value = it.name
  $('vs-url').value = it.baseUrl || ''
  $('vs-key').value = key || ''
  $('vs-note').value = it.note || ''
  $('vault-show-modal').classList.remove('hidden')
}

/* ══════════════ GitHub 热更新 ══════════════ */
async function doUpdateCheck(manual) {
 const st = $('update-status')
 if (st) st.textContent = '…'
 const r = await api('GET', '/api/update/check').catch(() => ({ ok: false, error: t('updateFailed') }))
 if (!r.ok) {
  if (st) st.textContent = r.error || t('updateFailed')
  $('btn-update-apply')?.classList.add('hidden')
  return r
 }
 if (st) st.textContent = r.newer ? `${t('updateNew')} v${r.latest}${r.notes ? '：' + r.notes : ''}` : `${t('updateUpToDate')}（v${r.current}）`
 $('btn-update-apply')?.classList.toggle('hidden', !r.newer)
 if (r.newer) {
  const dismissed = localStorage.getItem('oat-update-dismissed')
  if (manual || dismissed !== r.latest) showUpdateBanner(r)
 }
 return r
}
function showUpdateBanner(r) {
 const b = $('update-banner')
 if (!b) return
 b.classList.remove('hidden')
 b.innerHTML = `<span class="ub-text">${t('updateNew')} <b>v${esc(r.latest)}</b>（当前 v${esc(r.current)}）${r.notes ? '：' + esc(r.notes) : ''}</span>
  <button class="btn primary tiny" id="ub-apply">${t('updateApply')}</button>
  <button class="btn ghost tiny" id="ub-dismiss">${t('updateDismiss')}</button>`
 $('ub-apply').onclick = doUpdateApply
 $('ub-dismiss').onclick = () => { localStorage.setItem('oat-update-dismissed', r.latest); b.classList.add('hidden') }
}
async function doUpdateApply() {
 const st = $('update-status')
 const ub = $('ub-apply'); if (ub) ub.disabled = true
 $('btn-update-apply')?.classList.add('hidden')
 if (st) st.textContent = t('updateDownloading')
 const r = await api('POST', '/api/update/apply', {}).catch(() => ({ ok: false, error: t('updateFailed') }))
 if (!r.ok) { if (st) st.textContent = `${t('updateFailed')}：${r.error}`; const b = $('update-banner'); if (b) b.classList.add('hidden'); return }
 if (st) st.textContent = `${t('updateDoneRestart')}（v${r.from} → v${r.to}）`
 const b = $('update-banner'); if (b) b.classList.add('hidden')
 setTimeout(() => location.reload(), 6500)
}

/* ══════════════ 初始化 ══════════════ */
/* ★ 本地知识库（RAG）：设置页状态渲染（文件数/分块数/更新时间） */
async function renderKb() {
 try {
  const box = $('kb-stats'); if (!box) return
  const r = await api('GET', '/api/kb/stats').catch(() => ({ ok: false }))
  if (!r.ok) { box.textContent = '读取失败'; return }
  box.textContent = r.exists
    ? `索引：${r.files} 个文件 / ${r.chunks} 段 · 更新于 ${new Date(r.builtAt).toLocaleString('zh-CN', { hour12: false })}`
    : '（尚未建立索引：点「重建索引」或等首次自动检索时建立）'
  if ($('kb-auto')) $('kb-auto').checked = r.auto !== false
 } catch { /* ignore */ }
}
/* ★ 定时任务/心跳：设置页列表渲染（启用开关 / 下次运行 / 上次状态 / 删除） */
async function renderSchedules() {
 try {
  const box = $('sched-list'); if (!box) return
  const r = await api('GET', '/api/schedules').catch(() => ({ ok: false }))
  if (!r.ok) { box.textContent = '读取失败'; return }
  const sel = $('sched-session')
  if (sel) {
   const cur = sel.value
   sel.innerHTML = `<option value="">（使用当前激活工作区）</option>` + (state.teamSessions || []).map((s) => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${esc(s.title || '(未命名会话)')}</option>`).join('')
  }
  const list = r.schedules || []
  if (!list.length) { box.textContent = '（暂无定时任务）'; return }
  box.innerHTML = list.map((s) => {
   const freq = s.kind === 'daily' ? `每天 ${esc(s.at || '09:00')}` : `每隔 ${s.intervalMinutes || 60} 分钟`
   const next = s.enabled && s.nextRun ? new Date(s.nextRun).toLocaleString('zh-CN', { hour12: false }) : '—'
   const st = s.running ? '运行中…' : (s.lastStatus === 'done' ? `上次成功 ¥${Number(s.lastCost || 0).toFixed(4)}` : s.lastStatus === 'failed' ? `上次失败${s.consecutiveFails ? `（连续 ${s.consecutiveFails} 次）` : ''}` : s.lastStatus === 'stopped' ? '上次被终止' : '未运行')
   return `<div class="sched-row" data-id="${s.id}">
   <label class="chk"><input type="checkbox" class="sch-en" ${s.enabled ? 'checked' : ''} /></label>
   <div class="sch-info"><b>${esc(s.name)}</b> <span class="dim">${freq} · 下次 ${next}</span><div class="dim small">${esc(String(s.task).slice(0, 70))}${String(s.task).length > 70 ? '…' : ''}</div></div>
   <span class="dim small">${st}</span>
   <button class="btn ghost tiny sch-del">删除</button>
   </div>`
  }).join('')
  box.querySelectorAll('.sched-row').forEach((row) => {
   const id = row.dataset.id
   row.querySelector('.sch-en').onchange = async (e) => { await api('PUT', `/api/schedules/${id}`, { enabled: e.target.checked }); renderSchedules() }
   row.querySelector('.sch-del').onclick = async () => { if (confirm('删除该定时任务？')) { await api('DELETE', `/api/schedules/${id}`); renderSchedules() } }
  })
 } catch { /* ignore */ }
}
/* ★ 首启向导：未配置任何 API 时在对话页顶部显示三步引导（配置后或点"不再提示"自动消失） */
const ONBOARD_DEMO_TASK = '团队热身任务：在工作区创建 demo 文件夹，写一个单文件欢迎页 demo/index.html（纯 HTML+CSS、无任何外链），用于介绍 Open Agent Team；写完后由测试核验文件真实存在且内容正确，最后队长汇总。'
function renderOnboarding() {
 try {
  const box = $('chat-messages'); if (!box) return
  const hasApi = (state.providers || []).length > 0
  const dismissed = localStorage.getItem('oat-welcome') === 'off'
  const card = document.getElementById('onboard-card')
  if (hasApi || dismissed) { if (card) card.remove(); return }
  if (card) return
  const el = document.createElement('div')
  el.id = 'onboard-card'
  el.className = 'onboard-card'
  el.innerHTML = `<div class="ob-head">欢迎使用 Open Agent Team</div>
  <div class="ob-sub dim small">三步开跑：接入你的 AI API → 选一个团队 → 下达第一个任务（全程数据在本机）</div>
  <div class="ob-step"><span class="ob-num">1</span><div class="ob-body"><b>添加 API</b><div class="dim small">支持 DeepSeek / 百炼 / OpenAI / Claude / 智谱 / Kimi / OpenCode Zen 等十多家，Key 本机加密保存</div></div><button class="btn primary tiny" data-a="api">去添加</button></div>
  <div class="ob-step"><span class="ob-num">2</span><div class="ob-body"><b>选择团队</b><div class="dim small">游戏开发 / 软件研发 / 小说写作 / 视频制作等预设，一键带出角色与技能</div></div><button class="btn ghost tiny" data-a="team">选预设</button></div>
  <div class="ob-step"><span class="ob-num">3</span><div class="ob-body"><b>下达示例任务</b><div class="dim small">用内置热身任务体验"队长规划 → 角色干活 → 测试核验 → 汇总"全流程</div></div><button class="btn ghost tiny" data-a="demo">试用示例</button></div>
  <div class="ob-foot"><a href="#" data-a="off" class="dim small">不再提示</a></div>`
  box.prepend(el)
  el.querySelector('[data-a="api"]').onclick = () => { switchView('providers'); const b = $('btn-add-provider'); if (b) b.click() }
  el.querySelector('[data-a="team"]').onclick = () => { switchView('team'); const b = $('btn-team-session-new'); if (b) b.click() }
  el.querySelector('[data-a="demo"]').onclick = () => {
   switchView('team')
   if (!state.teamSessions || !state.teamSessions.length) { const b = $('btn-team-session-new'); if (b) b.click() }
   const ta = $('team-task'); if (ta) { ta.value = ONBOARD_DEMO_TASK; ta.focus() }
  }
  el.querySelector('[data-a="off"]').onclick = (e) => { e.preventDefault(); localStorage.setItem('oat-welcome', 'off'); el.remove() }
 } catch { /* ignore */ }
}
async function loadState() {
 const r = await api('GET', '/api/state')
 if (r.ok) {
 state.providers = r.providers; state.roles = r.roles || []; state.settings = r.settings || {}; state.plugins = r.plugins || []
  state.skills = r.skills || []; state.jsPlugins = r.jsPlugins || []
  try { const pr = await api('GET', '/api/presets'); state.customPresets = pr.presets || {} } catch { state.customPresets = {} }
 if (!state.selectedId && state.providers.length) state.selectedId = state.providers[0].id
 }
 await refreshSessions()
 renderChatToolbar(); renderProviderCards(); renderRoleSummary(); renderArtSelectors(); renderPlugins(); renderJsPlugins(); renderDebugSettings()
 $('balance-summary').textContent = `${state.providers.length} APIs`
 $('team-budget').value = state.settings.taskBudgetCost || ''
 renderTeamBudget()
 await refreshWorkspaces()
 applyUi(); renderSettings()
 // 自动恢复上次打开的会话（对话历史不丢）
 const last = localStorage.getItem('oat-last-session')
 if (!state.activeSession && last && state.sessions.some((s) =>s.id === last)) await openSession(last)
 renderOnboarding() // ★ 首启向导（未配置 API 时显示）
}
async function main() {
 // ★ TAT 手机端：扫码自动配对（?pair=）/ 未配对时显示配对门（电脑本机跳过）
 const pairToken = new URLSearchParams(location.search).get('pair')
 if (pairToken && !IS_LOCAL_HOST) {
  const r = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairToken, deviceName: detectDeviceName() }) }).then((x) => x.json()).catch(() => ({}))
  if (r.ok) { AUTH_TOKEN = r.token; localStorage.setItem('oat-token', AUTH_TOKEN); history.replaceState(null, '', location.pathname) }
 }
 if (!IS_LOCAL_HOST && !AUTH_TOKEN) { showPairGate(); return }
 setupStateStream()
 checkActiveRuns(true).catch(() => {}) // ★ 启动时检测未完成任务（含自动续跑产生的）
 const tpl = await api('GET', '/api/templates')
 if (tpl.ok) state.templates = tpl.templates
 $('f-template').innerHTML = Object.entries(state.templates).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')
 $('f-template').onchange = () => {
 const tp = state.templates[$('f-template').value]; if (!tp) return
 $('f-baseurl').value = tp.baseUrl
 $('f-capabilities').value = (tp.capabilities || []).join(', ')
 if (!editingId) $('f-name').value = tp.label
 state.mm.models = (tp.models || []).map((x) => ({ id: x, tags: [] })); state.mm.selected = new Set(state.mm.models.map((m) =>m.id)); renderModelManager()
 }
 // 语言
 const st0 = await api('GET', '/api/state')
 LANG = (st0.settings && st0.settings.language) || ''
 if (!LANG) $('lang-modal').classList.remove('hidden')
 else { applyI18n(); $('lang-select').value = LANG }
 const setLang = async (lang) => {
 LANG = lang; applyI18n(); $('lang-select').value = lang
 $('lang-modal').classList.add('hidden')
 await api('PUT', '/api/settings', { language: lang })
 await loadState(); switchView(document.querySelector('.tab.active')?.dataset.view || 'chat')
 }
 $('btn-lang-zh').onclick = () =>setLang('zh')
 $('btn-lang-en').onclick = () =>setLang('en')
 $('lang-select').onchange = () =>setLang($('lang-select').value)
 // 工作区
 $('workspace-select').onchange = async () => {
 const r = await api('PUT', '/api/workspaces/active', { path: $('workspace-select').value })
 if (!r.ok) return alert(r.error || 'fail')
 state.activeWorkspace = r.active
 renderWorkspaces(); refreshWorkspace(); refreshArtGallery()
 }
 $('btn-workspace-add').onclick = addWorkspace
 $('btn-workspace-del').onclick = removeWorkspace
 $('ws-pick-manual').onclick = () =>manualAddWorkspace('')
 // 顶栏 / 视图
 $('btn-add-provider').onclick = () =>openModal(null)
 $('btn-refresh-all').onclick = refreshAllBalances
 document.querySelectorAll('.tab').forEach((tab) => { tab.onclick = () =>switchView(tab.dataset.view) })
 document.querySelectorAll('.subtab').forEach((tab) => { tab.onclick = () =>switchSubtab(tab.dataset.panel) })
 // API 弹窗
 $('btn-modal-cancel').onclick = () => $('modal').classList.add('hidden')
 $('btn-modal-save').onclick = saveModal
  $('btn-modal-test').onclick = async () => {
   // ★ 未保存的新 API：不再静默无反应，明确提醒先保存
   if (!editingId) { $('modal-msg').textContent = t('testNeedSave'); $('modal-msg').className = 'modal-msg err'; return }
   $('modal-msg').className = 'modal-msg'
   $('modal-msg').textContent = '…'
   const r = await api('POST', `/api/providers/${editingId}/test`)
   state.balances[editingId] = r.result
   $('modal-msg').textContent = r.ok ? `✓ ${r.result.note || ''}` : `✗ ${r.result.note || ''}`
  }
 $('btn-fetch-models').onclick = async () => {
 if (!editingId) { $('mm-status').textContent = t('save'); return }
 $('mm-status').textContent = '…'
 const r = await api('POST', `/api/providers/${editingId}/models/fetch`)
 if (!r.ok) { $('mm-status').textContent = r.error; return }
 const sel = new Set([...state.mm.selected].filter((id) =>r.models.some((m) =>m.id === id)))
 for (const m of r.models) if (isChatCapable(m)) sel.add(m.id)
 state.mm.models = r.models; state.mm.selected = sel
 renderModelManager(); $('mm-status').textContent = `✓ ${r.count}`
 }
 $('mm-search').oninput = renderModelManager
 document.querySelectorAll('[data-quick]').forEach((btn) => {
 btn.onclick = () => {
 const q = btn.dataset.quick
 if (q === 'all') state.mm.selected = new Set(state.mm.models.map((m) =>m.id))
 if (q === 'none') state.mm.selected = new Set()
 if (q === 'all-chat') state.mm.selected = new Set(state.mm.models.filter(isChatCapable).map((m) =>m.id))
 renderModelManager()
 }
 })
 // 会话弹窗
 $('btn-ns-cancel').onclick = () => $('session-modal').classList.add('hidden')
 $('btn-ns-create').onclick = createSessionFromModal
 // 对话
 $('btn-send').onclick = sendChat
 $('chat-text').addEventListener('input', onChatInput)
 $('chat-text').addEventListener('keydown', (e) => {
 if (state.cmd.open) {
 if (e.key === 'ArrowDown') { e.preventDefault(); state.cmd.index = Math.min(state.cmd.index + 1, state.cmd.list.length - 1); renderCmdPalette(); return }
 if (e.key === 'ArrowUp') { e.preventDefault(); state.cmd.index = Math.max(state.cmd.index - 1, 0); renderCmdPalette(); return }
 if (e.key === 'Tab' || (e.key === 'Enter' && state.cmd.list.length)) { e.preventDefault(); runCommand(state.cmd.list[state.cmd.index]); return }
 if (e.key === 'Escape') { state.cmd.open = false; renderCmdPalette(); return }
 } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
 })
 $('btn-clear-chat').onclick = async () => { if (state.activeSession) { await api('POST', `/api/sessions/${state.activeSession.id}/clear`); await reloadActiveSession() } }
 $('chat-tools').onchange = async () => { state.settings.chatTools = $('chat-tools').checked; await api('PUT', '/api/settings', { chatTools: state.settings.chatTools }) }
 // 会话权限切换（完全权限需要风险确认）
 let permPrev = $('chat-perm').value
 $('chat-perm').onchange = () => {
 const val = $('chat-perm').value
 if (val === 'full' && state.activeSession?.permission !== 'full') {
 $('perm-ack').checked = false
 $('btn-perm-ok').disabled = true
 $('perm-modal').classList.remove('hidden')
 $('btn-perm-ok').onclick = async () => {
 if (!$('perm-ack').checked) return
 $('perm-modal').classList.add('hidden')
 if (state.activeSession) await api('PUT', `/api/sessions/${state.activeSession.id}`, { permission: 'full' })
 state.pendingPerm = 'full'
 permPrev = 'full'
 renderChatToolbar()
 }
 $('btn-perm-cancel').onclick = () => { $('perm-modal').classList.add('hidden'); $('chat-perm').value = permPrev }
 return
 }
 permPrev = val
 state.pendingPerm = val
 if (state.activeSession) api('PUT', `/api/sessions/${state.activeSession.id}`, { permission: val })
 }
 $('perm-ack').onchange = () => { $('btn-perm-ok').disabled = !$('perm-ack').checked }
 // 右侧历史栏收起/展开
 // 历史栏收起/展开（按钮在工具栏常驻，不会随栏一起隐藏）
 const syncRailBtn = () => { $('btn-rail-toggle').classList.toggle('primary', !$('chat-rail').classList.contains('hidden')) }
 $('btn-rail-toggle').onclick = () => {
 $('chat-rail').classList.toggle('hidden')
 localStorage.setItem('oat-rail-hidden', $('chat-rail').classList.contains('hidden') ? '1' : '0')
 syncRailBtn()
 }
 if (localStorage.getItem('oat-rail-hidden') === '1') $('chat-rail').classList.add('hidden')
 syncRailBtn()
 $('btn-attach').onclick = () => $('chat-image').click()
 $('chat-image').onchange = () => {
 const f = $('chat-image').files[0]; if (!f) return
 const fr = new FileReader(); fr.onload = () =>setChatImage(fr.result, f.name); fr.readAsDataURL(f); $('chat-image').value = ''
 }
 // 团队
 $('btn-team-run').onclick = runTeam
 $('btn-role-chat-send').onclick = roleChatSend
 $('team-role-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); roleChatSend() } })
 $('btn-team-pause').onclick = async () => {
 if (!state.currentTeamTaskId) return
 const r = await api('POST', '/api/team/control', { taskId: state.currentTeamTaskId, action: state.runPaused ? 'resume' : 'pause' })
 if (r.ok) { state.runPaused = !!r.paused; updatePauseUI() }
 }
 setTimeout(checkActiveRuns, 1500)
 setInterval(checkActiveRuns, 15000)
 // 分栏拖拽
 initSplitters()
 // 拖拽上传（对话 + 团队任务）
 setupToBottom('chat-messages', 'btn-chat-bottom')
 setupToBottom('team-stream', 'btn-team-bottom')
 // ★ 推理等级滑块：对话（写入会话）/ 团队任务（写入团队会话）；无会话时写全局
 setupEffortControl('chat-effort', () => (state.activeSession?.effort || state.settings.reasoningEffort || 'default'), async (v) => {
  if (state.activeSession) { state.activeSession.effort = v; await api('PUT', `/api/sessions/${state.activeSession.id}`, { effort: v }); refreshSessions() }
  else { state.settings.reasoningEffort = v; await api('PUT', '/api/settings', { reasoningEffort: v }) }
 })
 setupEffortControl('team-effort', () => ((state.teamSessions.find((s) => s.id === state.teamSessionId) || {}).effort || state.settings.reasoningEffort || 'default'), async (v) => {
  if (state.teamSessionId) { await api('PUT', `/api/sessions/${state.teamSessionId}`, { effort: v }); await refreshTeamSessions(state.teamSessionId) }
  else { state.settings.reasoningEffort = v; await api('PUT', '/api/settings', { reasoningEffort: v }) }
 })
 setupDropzone($('chat-messages'), $('chat-text'))
 setupDropzone($('chat-text'), $('chat-text'))
 // ★ 团队：聚焦某角色时拖入 → 发给该角色的单独对话；否则 → 团队任务输入框
 setupDropzone($('team-stream'), () => (state.teamFocus && $('team-role-bar') && !$('team-role-bar').classList.contains('hidden')) ? $('team-role-text') : $('team-task'))
 setupDropzone($('team-role-bar'), $('team-role-text'))
 setupDropzone($('team-task'), $('team-task'))
  // 视频 / 开放 API
  $('btn-video-gen').onclick = btnVideoGen
  $('btn-oa-add').onclick = async () => {
    const name = $('oa-name').value.trim(), url = $('oa-url').value.trim()
    if (!name || !url) { $('oa-msg').textContent = '请填写工具名与接口地址'; return }
    const r = await api('POST', '/api/plugins', { name, url, description: $('oa-desc').value.trim(), method: $('oa-method').value, params: $('oa-params').value })
    if (r.ok) { $('oa-msg').textContent = t('savedOk'); $('oa-name').value = ''; $('oa-url').value = ''; $('oa-desc').value = ''; $('oa-params').value = ''; renderOpenApi() }
    else $('oa-msg').textContent = r.error || 'failed'
  }
  // 凭据保险箱
  $('btn-vault-save').onclick = async () => {
    const r = await api('POST', '/api/vault', { name: $('vk-name').value.trim(), baseUrl: $('vk-url').value.trim(), key: $('vk-key').value.trim(), note: $('vk-note').value.trim(), method: $('vk-method').value, authHeader: $('vk-auth').value.trim() })
    if (r.ok) { $('vk-msg').textContent = t('vaultSaved'); $('vk-name').value = ''; $('vk-url').value = ''; $('vk-key').value = ''; $('vk-note').value = ''; $('vk-auth').value = ''; refreshVault() }
    else $('vk-msg').textContent = r.error || 'failed'
  }
  $('btn-vault-pass').onclick = () => { $('vp-old').value = ''; $('vp-new').value = ''; $('vp-msg').textContent = ''; $('vault-pass-modal').classList.remove('hidden') }
  $('btn-vp-cancel').onclick = () => $('vault-pass-modal').classList.add('hidden')
  $('btn-vp-save').onclick = async () => {
    const r = await api('POST', '/api/vault/password', { old: $('vp-old').value, new: $('vp-new').value })
    if (r.ok) { $('vault-pass-modal').classList.add('hidden'); refreshVault() }
    else $('vp-msg').textContent = r.error || 'failed'
  }
  $('btn-vr-cancel').onclick = () => $('vault-reveal-modal').classList.add('hidden')
 $('vr-reset').onclick = async () => {
  if (!confirm('清除保险箱密码保护？已保存的 API 仍保留在本机加密存储中。')) return
  await api('POST', '/api/vault/password/reset')
  $('vault-reveal-modal').classList.add('hidden')
  await refreshVault()
  if (state.vaultPending) {
   const rv = await api('POST', '/api/vault/reveal', { id: state.vaultPending.id, password: '' })
   if (rv.ok) showVaultItem(state.vaultPending, rv.key)
  }
 }
  $('btn-vr-ok').onclick = async () => {
    if (!state.vaultPending) return
    const r = await api('POST', '/api/vault/reveal', { id: state.vaultPending.id, password: $('vr-pass').value })
    if (!r.ok) { $('vr-msg').textContent = r.error || 'failed'; return }
    $('vault-reveal-modal').classList.add('hidden')
    showVaultItem(state.vaultPending, r.key)
  }
  $('btn-vs-close').onclick = () => $('vault-show-modal').classList.add('hidden')
  // 画板画廊工具
  $('btn-art-multi').onclick = () => { state.artMulti = !state.artMulti; state.artSel.clear(); refreshArtGallery() }
 $('btn-art-del-sel').onclick = () => { const items = state.artItems.filter((x) =>state.artSel.has(x.file)); if (items.length) openDelModal(items) }
 $('btn-art-regen-sel').onclick = () => { const items = state.artItems.filter((x) =>state.artSel.has(x.file)); if (items.length) openRegenModal(items) }
 $('btn-viewer-close').onclick = () => $('art-viewer').classList.add('hidden')
 $('btn-viewer-del').onclick = () => { if (state.viewerItem) { $('art-viewer').classList.add('hidden'); openDelModal([state.viewerItem]) } }
 $('btn-viewer-regen').onclick = () => { if (state.viewerItem) { $('art-viewer').classList.add('hidden'); openRegenModal([state.viewerItem]) } }
 $('btn-del-cancel').onclick = () => $('art-del-modal').classList.add('hidden')
 $('btn-del-listonly').onclick = async () => { await api('POST', '/api/art/delete', { files: state.delTargets.map((x) =>x.file), deleteFile: false }); $('art-del-modal').classList.add('hidden'); state.artSel.clear(); refreshArtGallery() }
 $('btn-del-file').onclick = async () => { await api('POST', '/api/art/delete', { files: state.delTargets.map((x) =>x.file), deleteFile: true }); $('art-del-modal').classList.add('hidden'); state.artSel.clear(); refreshArtGallery() }
 $('btn-regen-cancel').onclick = () => $('art-regen-modal').classList.add('hidden')
 $('btn-regen-replace').onclick = () =>doRegen(state.regenTargets, true)
 $('btn-regen-new').onclick = () =>doRegen(state.regenTargets, false)
 // 跟随系统主题
 if (window.matchMedia) {
 window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if ((state.settings.ui || {}).theme === 'system') applyUi() })
 }
 $('team-session').onchange = async () => { state.teamSessionId = $('team-session').value; await refreshTeamSessions(state.teamSessionId); renderTeamSession() }
 $('btn-team-session-new').onclick = () => openTeamSessionModal()
 $('btn-ts-cancel').onclick = () => $('team-session-modal').classList.add('hidden')
 $('btn-ts-create').onclick = createTeamSessionFromModal
 $('btn-sidebar-add-api').onclick = () => openModal(null)
 // ★ TAT 移动端：侧栏抽屉开关 + 新建会话快捷按钮
 if ($('btn-mobile-menu')) $('btn-mobile-menu').onclick = () => document.body.classList.toggle('rail-open')
 if ($('chat-new-session')) $('chat-new-session').onclick = () => openSessionModal($('chat-provider').value)
 $('btn-team-session-rename').onclick = async () => {
 if (!state.teamSessionId) return
 const cur = state.teamSessions.find((s) =>s.id === state.teamSessionId)
 const v = prompt('Title', cur?.title || '')
 if (v != null) { await api('PUT', `/api/sessions/${state.teamSessionId}`, { title: v }); await refreshTeamSessions(state.teamSessionId); renderTeamSession() }
 }
  $('btn-team-session-export').onclick = () => { if (state.teamSessionId) window.open(`/api/sessions/${state.teamSessionId}/export`, '_blank') }
  // ★ Paperclip：自动续跑（0=关；1-5=完成后自动继续的最大轮数）
  if ($('team-auto-continue')) $('team-auto-continue').onchange = async () => {
    if (!state.teamSessionId) return
    await api('PUT', `/api/sessions/${state.teamSessionId}`, { autoContinue: Number($('team-auto-continue').value) || 0 })
    await refreshTeamSessions(state.teamSessionId)
  }
 $('btn-team-session-del').onclick = async () => {
  if (!state.teamSessionId) return
  const cur = state.teamSessions.find((s) => s.id === state.teamSessionId)
  const choice = await askDeleteSession(cur?.title, cur?.workspace)
  if (choice === 'cancel') return
  await api('DELETE', `/api/sessions/${state.teamSessionId}${choice === 'purge' ? '?purge=1' : ''}`)
  state.teamSessionId = ''
  await refreshTeamSessions()
  renderTeamSession()
  }
 // 团队预设
 renderPresetSelect()
 $('btn-apply-preset').onclick = () => applyTeamPreset()
 $('btn-save-preset').onclick = saveCustomPreset
 $('btn-del-preset').onclick = deleteCustomPreset
 $('preset-select').onchange = syncPresetButtons
 // 设置页
 $('set-theme').onchange = () =>saveUi({ theme: $('set-theme').value })
 $('set-accent').oninput = () =>document.documentElement.style.setProperty('--accent', $('set-accent').value)
 $('set-accent').onchange = () =>saveUi({ accent: $('set-accent').value })
  if ($('set-user-color')) {
   $('set-user-color').oninput = () => document.documentElement.style.setProperty('--user-bubble', $('set-user-color').value)
   $('set-user-color').onchange = () => saveUi({ userColor: $('set-user-color').value })
  }
  if ($('set-show-reasoning')) $('set-show-reasoning').onchange = () => saveUi({ showReasoning: $('set-show-reasoning').checked })
  if ($('set-show-tools')) $('set-show-tools').onchange = () => saveUi({ showTools: $('set-show-tools').checked })
 $('set-font').oninput = () => { $('set-font-val').textContent = $('set-font').value + 'px'; document.documentElement.style.setProperty('--font-size', $('set-font').value + 'px') }
 $('set-font').onchange = () =>saveUi({ fontSize: Number($('set-font').value) })
 $('set-default-perm').onchange = async () => { state.settings.defaultPermission = $('set-default-perm').value; await api('PUT', '/api/settings', { defaultPermission: state.settings.defaultPermission }) }
 $('set-spacing').onchange = () => { state.settings.ui = { ...(state.settings.ui || {}), spacing: $('set-spacing').value }; applyUi(); api('PUT', '/api/settings', { ui: state.settings.ui }) }
 $('set-teampos').onchange = () => { state.settings.ui = { ...(state.settings.ui || {}), teamInputPos: $('set-teampos').value }; applyUi(); api('PUT', '/api/settings', { ui: state.settings.ui }) }
 // 热更新
 $('btn-update-save').onclick = async () => {
  state.settings.updateRepo = $('set-update-repo').value.trim()
  state.settings.updateBranch = $('set-update-branch').value.trim() || 'main'
  await api('PUT', '/api/settings', { updateRepo: state.settings.updateRepo, updateBranch: state.settings.updateBranch })
  $('update-status').textContent = t('savedOk')
 }
 $('btn-update-check').onclick = () => doUpdateCheck(true)
 $('btn-update-apply').onclick = doUpdateApply
 // ★ 清理残留数据
 if ($('btn-cleanup')) $('btn-cleanup').onclick = async () => {
  $('cleanup-msg').textContent = '…'
  const r = await api('POST', '/api/cleanup').catch(() => ({ ok: false }))
  if (!r.ok) { $('cleanup-msg').textContent = t('failure'); return }
  $('cleanup-msg').textContent = `✓ ${t('cleanupSessions')} ${r.sessions} · ${t('cleanupTasks')} ${(r.tasks || 0) + (r.taskFiles || 0)} · ${t('cleanupMemories')} ${r.roleChats || 0}`
  await loadState()
  if (state.activeSession && !state.sessions.some((s) => s.id === state.activeSession.id)) {
   state.activeSession = null
   localStorage.removeItem('oat-last-session')
   renderChatMessages()
  }
 }
  // ★ .oat 常驻项目档案：查看/编辑 与 清空
  if ($('btn-projmem-view')) $('btn-projmem-view').onclick = async () => {
    $('projmem-msg').textContent = '…'
    const r = await api('GET', '/api/project-memory').catch(() => ({ ok: false }))
    if (!r.ok) { $('projmem-msg').textContent = t('failure'); return }
    const text = prompt(`项目档案：${r.path}\n（可直接编辑，确定后保存；取消不保存）`, r.text || '')
    if (text === null) { $('projmem-msg').textContent = ''; return }
    const w = await api('POST', '/api/project-memory', { text }).catch(() => ({ ok: false }))
    $('projmem-msg').textContent = w.ok ? t('savedOk') : (w.error || t('failure'))
  }
  if ($('btn-projmem-clear')) $('btn-projmem-clear').onclick = async () => {
    if (!confirm('清空当前工作区的项目档案？（不影响工作区里的任何文件）')) return
    const r = await api('DELETE', '/api/project-memory').catch(() => ({ ok: false }))
    $('projmem-msg').textContent = r.ok ? '已清空' : (r.error || t('failure'))
  }
  // ★ 本地知识库：重建索引 / 检索测试 / 自动注入开关
  if ($('btn-kb-rebuild')) {
    $('btn-kb-rebuild').onclick = async () => {
      $('kb-msg').textContent = '重建中…'
      const r = await api('POST', '/api/kb/rebuild', {}).catch(() => ({ ok: false }))
      $('kb-msg').textContent = r.ok ? `完成：${r.files} 个文件 / ${r.chunks} 段` : (r.error || '失败')
      renderKb()
    }
    $('btn-kb-test').onclick = async () => {
      const q = prompt('检索测试：输入关键词或问题（在当前工作区知识库中检索）')
      if (!q) return
      const r = await api('GET', `/api/kb/search?q=${encodeURIComponent(q)}&limit=5`).catch(() => ({ ok: false }))
      if (!r.ok) { $('kb-msg').textContent = '检索失败'; return }
      const list = r.results || []
      if (!list.length) { $('kb-msg').textContent = '（未命中：可先重建索引或换关键词）'; return }
      $('kb-msg').textContent = `命中 ${list.length} 段`
      alert(list.map((x, i) => `${i + 1}. ${x.path}（相关度 ${x.score}）\n${x.excerpt.slice(0, 180)}`).join('\n\n'))
    }
    $('kb-auto').onchange = async () => { state.settings.kbAuto = $('kb-auto').checked; await api('PUT', '/api/settings', { kbAuto: $('kb-auto').checked }) }
  }
  // ★ 定时任务/心跳：新建表单（间隔/每天切换 + 添加）
  if ($('sched-kind')) {
    $('sched-kind').onchange = () => { const daily = $('sched-kind').value === 'daily'; $('sched-interval').classList.toggle('hidden', daily); $('sched-at').classList.toggle('hidden', !daily) }
    $('btn-sched-add').onclick = async () => {
      const task = $('sched-task').value.trim()
      if (!task) { $('sched-msg').textContent = '请填写任务内容'; return }
      const r = await api('POST', '/api/schedules', { kind: $('sched-kind').value, task, sessionId: $('sched-session').value, intervalMinutes: Number($('sched-interval').value) || 60, at: $('sched-at').value || '09:00', name: task.slice(0, 18) }).catch(() => ({ ok: false }))
      $('sched-msg').textContent = r.ok ? '已添加' : (r.error || '添加失败')
      if (r.ok) { $('sched-task').value = ''; renderSchedules() }
    }
  }
  $('set-effort').onchange = async () => { state.settings.reasoningEffort = $('set-effort').value; await api('PUT', '/api/settings', { reasoningEffort: state.settings.reasoningEffort }) }
 $('btn-open-roles').onclick = () =>switchView('teamconfig')
 $('btn-open-roles2').onclick = () =>switchView('teamconfig')
 $('team-budget').oninput = renderTeamBudget
 $('btn-team-budget-save').onclick = async () => {
  await api('PUT', '/api/settings', { taskBudgetCost: Number($('team-budget').value) || 0 })
  $('team-budget-msg').textContent = t('savedOk')
  renderTeamBudget()
  setTimeout(() => ($('team-budget-msg').textContent = ''), 1500)
 }
 $('btn-art-gen').onclick = btnArtGen
 $('btn-code-refresh').onclick = refreshWorkspace
 // 团队配置
 $('btn-add-role').onclick = () => {
  // ★ 先收集当前编辑框内容（未保存的修改不丢），再追加新角色
  if ($('roles-list')?.querySelector('.role-edit-row')) state.roles = collectRolesEditor()
  state.roles.push({ id: 'role' + Date.now(), label: 'New Role', color: '#888888', desc: '', enabled: true, budgetCost: 0, providerId: '', model: '', systemPrompt: '', skills: [] })
  renderRolesEditor()
 }
 $('btn-save-roles').onclick = saveRolesEditor
 $('btn-skill-add').onclick = addSkill
 $('btn-skill-import-url').onclick = () =>importSkills($('sk-import-url').value.trim())
 $('btn-skill-import-json').onclick = () =>importSkills('')
 $('btn-skill-export').onclick = () => {
 const blob = new Blob([JSON.stringify(state.skills, null, 2)], { type: 'application/json' })
 const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'oat-skills.json'; a.click()
 }
 // 插件
 $('btn-jp-import-code').onclick = () =>importJsPlugin('')
 $('btn-jp-import-url').onclick = () =>importJsPlugin($('jp-url').value.trim())
 $('btn-plugin-add').onclick = addPlugin
 // GitHub
 $('btn-gh-save').onclick = async () => { await api('POST', '/api/github/token', { token: $('gh-token').value.trim() }); $('gh-token').value = ''; refreshGithub() }
 $('btn-gh-clone').onclick = ghClone
 $('btn-gh-publish').onclick = ghPublish
 // 统计
 $('btn-stats-refresh').onclick = refreshStats
 $('btn-stats-reset').onclick = async () => { if (confirm('Reset?')) { await api('POST', '/api/stats/reset'); refreshStats() } }
 // 调试
 $('btn-debug-save').onclick = async () => { await api('PUT', '/api/settings', { developerMode: $('dbg-developer').checked, exeEnabled: $('dbg-exe').checked }); await loadState(); renderDebugSettings() }
 $('btn-exe-add').onclick = async () => {
 const p = $('dbg-exe-path').value.trim(); if (!p) return
 await api('PUT', '/api/settings', { exeAllowlist: [...(state.settings.exeAllowlist || []), p] })
 $('dbg-exe-path').value = ''; await loadState(); renderDebugSettings()
 }
 $('btn-tool-test').onclick = async () => {
 let call
 try { call = JSON.parse($('dbg-tool-json').value) } catch { return alert('JSON invalid') }
 $('dbg-tool-result').textContent = '…'
 const r = await api('POST', '/api/tools/test', { call })
 $('dbg-tool-result').textContent = r.result
 refreshDebugEvents()
 }
 $('btn-debug-refresh').onclick = refreshDebugEvents
 $('btn-debug-clear').onclick = async () => { await api('POST', '/api/debug/clear'); refreshDebugEvents() }

 await loadState()
 refreshDebugEvents()
 setTimeout(refreshAllBalances, 800)
 setInterval(refreshAllBalances, 60 * 60 * 1000)
 // ★ 自动检查更新（配置了更新源时；6 小时最多一次，用户可忽略该版本）
 if (state.settings.updateRepo) {
  const last = Number(localStorage.getItem('oat-update-checked') || 0)
  if (Date.now() - last > 6 * 3600 * 1000) {
   localStorage.setItem('oat-update-checked', String(Date.now()))
   setTimeout(() => doUpdateCheck(false), 3000)
  }
 }
}
main()
