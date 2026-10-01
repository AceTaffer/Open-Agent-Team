/**
 * ★ Open Agent Team · JS 插件示例
 * ─────────────────────────────────────────────────────────────
 * ★ 插件格式：默认导出 { name, tools:[{ name, description, params, run }] }
 * ★ 工具会在「团队任务」中暴露给智能体（工具协议），也可以在产品「插件」页导入/启停
 */
export default {
  name: 'example',
  tools: [
    {
      name: 'oat_time',
      description: '获取当前日期和时间',
      params: {},
      async run() {
        return new Date().toLocaleString('zh-CN')
      },
    },
    {
      name: 'oat_calc',
      description: '计算一个简单数学表达式（支持 + - * / ( ) 与数字）',
      params: { expr: '表达式，例如 (1+2)*3' },
      async run({ expr }) {
        const s = String(expr || '')
        if (!/^[\d\s+\-*/().]+$/.test(s)) return '表达式包含不允许的字符'
        try {
          // eslint-disable-next-line no-new-func
          return `${s} = ${Function('"use strict";return (' + s + ')')()}`
        } catch (e) {
          return '计算失败：' + e.message
        }
      },
    },
  ],
}
