# Open Agent Team · 第三方声明与许可

> 本文件用于列明 Open Agent Team（OAT，以下称"本软件"）所使用的第三方组件、
> 对应开源许可证及来源链接。分发本软件时请一并保留本文件与 `licenses/` 目录。

## 一、项目说明
- 本软件作者：**Acct**（AI 开发协作：deepseek-v4.1-flash）。
- 本软件的"手机端互联"功能合并自作者的实验分支 **Turing Agent Team（TAT）**；
  该分支为临时实验项目，完成合并后已归档，作者声明与版权归属不变。
- 实验分支名中的 "Turing" 仅为致敬艾伦·图灵（Alan Turing），与 Alan Turing 遗产
  管理机构、图灵研究所及其关联方无任何官方关联。

## 二、随本软件分发的组件
| 组件 | 许可证 | 用途 | 位置 |
|---|---|---|---|
| qrcode-generator | MIT | 生成配对二维码（浏览器端） | `web/vendor/qrcode.js` |
| Electron | MIT | 桌面壳 | `node_modules/electron`（依赖安装） |
| undici | MIT | Node HTTP 客户端（内置依赖） | `node_modules/undici`（依赖安装） |

MIT 许可证全文见 `licenses/qrcode-generator-LICENSE.txt`（其余组件许可证可在各自包内查看）。

## 三、可选外部组件（不随本软件分发；由用户自行安装或由本软件引导下载）
| 组件 | 许可证 | 用途 | 来源 |
|---|---|---|---|
| EasyTier | LGPL-3.0 | 异地组网（P2P 直连） | https://github.com/EasyTier/EasyTier |
| cloudflared | Apache-2.0 | 可选隧道（异地访问兜底，规划中） | https://github.com/cloudflare/cloudflared |
| ntfy | 见其仓库（服务端 GPLv2 / Android Apache-2.0） | 可选推送通道（规划中） | https://github.com/binwiederhier/ntfy |
| Bark | 见其仓库（MIT） | 可选 iOS 推送通道（规划中） | https://github.com/Finb/Bark |

### 关于 EasyTier（LGPL-3.0）的合规说明
本软件对 EasyTier 的使用方式为：**从官方 Release 下载二进制并以独立进程方式调用**
（不修改其代码、不与其静态链接、不改变其可替换性）。分发时若包含 EasyTier 二进制，
必须：
1. 随包附 **LGPL-3.0 许可证全文**（分发时补齐 `licenses/LGPL-3.0.txt`）；
2. 标明版权归属与来源链接（见上表）；
3. 保持其独立进程、可被用户替换的形态；
4. 说明获取对应源码的方式（官方仓库链接即为源码来源）。

## 四、其他说明
- `tools/ffmpeg.exe`（如随包分发）：FFmpeg 二进制常见的发行构建包含 GPL 组件
  （如 x264）。请在使用/分发前核实该二进制的具体构建许可证（执行
  `ffmpeg -version` 查看 `--enable-gpl` 等编译选项），并遵守对应许可证；如需规避，
  可改为由用户自行下载或替换为 LGPL 构建版本。
- **VoiceStudio**（可选本地声音引擎，AGPL-3.0，来源：https://github.com/debpalash/VoiceStudio ）：
  本软件对其的使用方式为**从官方 Release 下载安装包并由用户自行安装，本软件仅通过
  其官方本地 HTTP API（默认 127.0.0.1:3900）以独立进程/独立服务方式调用**
  （不修改其代码、不与其链接、不随包分发其二进制）。VoiceStudio 及其模型受各自许可
  （AGPL-3.0 与模型自带许可）约束，商业使用前请自行核实；克隆音色须获得声音权利人同意。
- 本软件调用第三方 AI 接口（DeepSeek、阿里云百炼、智谱、OpenCode Zen 等）所产生的
  内容与费用由用户与其服务商之间的协议约束，本软件不承担相关责任。

最后更新：2026-10-03（v1.6.0）
