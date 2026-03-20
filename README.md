# Stock Pilot CN

一个面向手机端的 PWA 选股应用，核心功能是输入一组 A 股代码后，直接查看 AI 预测的近 5 天、近 10 天上涨排序。

## 功能

- 批量输入大陆 6 位股票代码，直接生成涨幅预测排行榜
- 显示近 5 天、近 10 天两个周期的上涨排序
- 支持通过服务端代理拉取真实 A 股行情
- 支持通过 Anthropic 或 OpenAI 服务端代理输出结构化趋势判断
- 保留单只股票详细分析，便于进一步确认理由
- 将分析结果加入购物车，并执行虚拟买入 / 卖出
- 支持用户注册、登录、云端保存和拉取模拟账户
- 追踪可用资金、持仓市值、累计收益和交易流水
- 输出胜率、已实现收益、浮动收益、AI 命中率、最大回撤和图形化报表
- 支持 `manifest` + `service worker`，可安装为手机端 PWA
- 支持配置自定义行情接口和自定义 AI 接口，失败时自动回退到本地分析

## 使用方式

1. 复制环境变量模板并填写：

```bash
cp .env.example .env
```

2. 编辑 `.env`，至少可以配置：

```bash
PORT=4173
OPENAI_API_KEY=你的_openai_key
OPENAI_BASE_URL=https://api.openai.com
OPENAI_MODEL=gpt-5-mini
ANTHROPIC_BASE_URL=https://your-anthropic-proxy.example.com
ANTHROPIC_AUTH_TOKEN=你的_anthropic_token
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
SESSION_SECRET=替换成随机字符串
```

3. 启动服务：

```bash
npm start
```

4. 访问 `http://localhost:4173`。

5. 在页面“接口设置”里可选择 `AI 提供商`：
   `自动选择`、`Anthropic`、`OpenAI`、`本地规则` 或 `自定义接口`。

## Vercel 部署

如果你要先做在线测试版，可以直接部署到 Vercel。

需要准备的环境变量：

```bash
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com
OPENAI_MODEL=gpt-5-mini
ANTHROPIC_BASE_URL=https://sz.uyilink.com
ANTHROPIC_AUTH_TOKEN=你的_token
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

项目里已经包含：

- [vercel.json](/Users/danny/Library/Mobile%20Documents/com~apple~CloudDocs/VibeCoding/StockMarket/vercel.json)
- [api/index.mjs](/Users/danny/Library/Mobile%20Documents/com~apple~CloudDocs/VibeCoding/StockMarket/api/index.mjs)

部署步骤：

1. 把项目推到 GitHub
2. 在 Vercel 导入这个仓库
3. 在 Vercel 项目设置里填写上面的环境变量
4. 直接部署

说明：

- Vercel 测试版重点支持“在线选股排行榜”和“单股分析”
- 登录、云同步这类基于本地文件持久化的能力，不适合作为 Vercel 测试版的主能力
- 大陆访问可以先用于测试，但正式给大陆年长用户长期使用，仍建议后续迁到腾讯云这类大陆平台

## 外部接口格式

如果不填写自定义接口，程序会默认走内置后端：

- `GET /api/quote?code=600519`
- `POST /api/ai/analyze`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `PUT /api/portfolio`

自定义行情接口建议使用 `GET`，应用会自动拼接查询参数 `?code=600519`，返回 JSON 结构例如：

```json
{
  "name": "贵州茅台",
  "currentPrice": 1678.2,
  "closes": [1602.5, 1618.0, 1636.6, 1650.2, 1671.8]
}
```

自定义 AI 接口建议使用 `POST`，请求体结构例如：

```json
{
  "stockCode": "600519",
  "stockName": "贵州茅台",
  "currentPrice": 1678.2,
  "recentCloses": [1602.5, 1618.0, 1636.6, 1650.2, 1671.8]
}
```

返回 JSON 可包含以下字段：

```json
{
  "direction": "看涨",
  "confidence": 78,
  "action": "尝试买入",
  "rationale": "量价结构改善，短期偏强。",
  "targetPrice": 1812.46,
  "stopPrice": 1594.29,
  "score": 6.2
}
```

## 说明

- 内置行情代理使用东方财富公开行情接口做服务端转发。
- 如果同时配置了 Anthropic 和 OpenAI，当前服务端会优先使用 Anthropic。
- OpenAI 接入通过服务端调用 `Responses API`，Anthropic 接入通过兼容 `messages` 接口的服务端代理，前端不直接暴露密钥。
- 如果服务端没有可用 AI Key，程序会自动回退到本地规则引擎。
- 登录后的模拟账户会保存到 `data/db.json`，适合单机或小团队演示。
