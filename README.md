<p align="center">
  <img src="./logo/logo.jpg" alt="icon" width="200">
</p>
# 烹饪之王（cooking-miniprogram）

组织化的烹饪管理，营造您自己的点餐—烹饪—出餐平台：菜谱管理 → 按餐次点菜 → 汇总确认 → 制作出餐 → 统计与采购清单。

名字取自 cooking 的 cook + king。

前端是原生小程序（TypeScript 预编译成 `.js`），后端是 NestJS + Prisma + PostgreSQL，图片走自建 MinIO。

## 功能一览

- **菜谱**：新建 / 编辑 / 多图上传 / 标签筛选 / 归档；支持用提示词模板把外部 AI 整理好的 JSON 直接导入（详见下文）
- **点菜**：按日期和餐次点菜，支持加餐、份数调整、整餐备注；提交后进入汇总
- **汇总与确认**：各人明细 + 合计需求，创建者确认后生成制作任务并锁定点菜单
- **制作**：认领 → 开始制作 → 逐菜完成 → 确认出餐
- **采购清单**：按已提交点菜合并食材、按份数缩放用量、可勾选「已备」
- **统计**：点菜/出餐量、热门菜、餐次分布、热量汇总、随机抽菜
- **营养**：每份热量与三大营养素，来自模板导入，人工确认后参与统计
- **家庭协作**：邀请码加入、昵称头像、站内通知、微信订阅消息（菜单确认/接单/出餐）

## 目录结构

```
client/            小程序（开发者工具打开这个目录）
  miniprogram/     页面、组件、services、样式
server/            NestJS 后端
  prisma/          schema 与迁移
  src/infra/       数据库、存储、微信、大模型
  src/modules/     业务模块（auth/household/recipe/meal/production/stats/...）
deploy/            docker compose、nginx、frp、备份脚本
docs/              PRD 与接口/进度文档
packages/contracts 前后端共享枚举
```

## 本地开发

### 小程序

```bash
cd client
npm install
npm run typecheck
npm run build:mp      # TS → 同目录 .js，这一步必须在打开开发者工具前跑
```

用微信开发者工具打开 **`client/`** 目录（配置里 `miniprogramRoot = miniprogram/`）。仓库根目录的 `project.config.json` 也指向同一路径，直接打开根目录同样可用。

> `.js` 是编译产物、不入库。换机器 clone 后一定要先 `npm run build:mp`，否则工具里会缺文件。

### 后端

```bash
cd server
npm install
cp .env.example .env     # 至少填 DATABASE_URL 与 JWT_SECRET
npm run prisma:generate
npm run prisma:migrate   # 本地开发建表；服务器用 prisma:deploy
npm run start:dev
```

### 环境变量（`server/.env`）

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `JWT_SECRET` | 登录 token 签名密钥 |
| `STORAGE_*` | MinIO 地址、桶、密钥 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 小程序登录与订阅消息 |
| `WECHAT_TMPL_*` | 三张订阅消息模板 id，不填则只发站内通知 |
| `LLM_*` | 可选。仅旧的内置识别接口使用；不填不影响「模板整理」流程 |

密钥只放 `.env`，`.env` 与 `docs/appid与密钥.txt` 都已在 `.gitignore` 中，不要提交。

## 部署形态

```
小程序 → https://codis.fun (VPS nginx :443)
        → frps 5003 → frp 隧道 → 家庭主机 cooking-api :3000
                                  ├─ postgres :5433
                                  └─ minio    :9100
```

服务器上：

```bash
cd /home/yj/code/cooking/deploy
docker compose build api && docker compose up -d api
docker compose run --rm --no-deps api npx prisma migrate deploy
```

SSH 入口 `yj@codis.fun -P 6000` 由 VPS 的 ufw 按来源 IP 白名单放行，家庭宽带 IP 变化会连接超时，需要补规则。排查与命令见 [docs/开发进度与接口.md](docs/开发进度与接口.md) 的「常用命令」一节。

## 菜谱整理（不内置大模型）

小程序内**不调用大模型**。流程是：

1. 菜谱页 →「导入」→ 复制内置提示词；
2. 把提示词发给你自己的 AI（豆包 / DeepSeek / ChatGPT 等），再附上菜谱链接、截图或文字；
3. 把 AI 返回的 JSON 粘回小程序，解析后进入编辑页核对，确认保存。

提示词与解析器是同版本的：`client/miniprogram/constants/recipePrompt.ts` 与 `client/miniprogram/utils/recipeDraft.ts`，改动时要一起改（有 `schemaVersion` 兜底）。模板里同时包含每份营养字段，保存时一并写入并标记「待确认」。

## 已知边界

- 营养值由外部 AI 估算，误差通常 ±20%，只能看趋势，不能当营养标签；
- 菜谱列表默认只显示 100 条，归档菜不进入随机抽菜；
- 订阅消息是一次性订阅，用户每授权一次只能收到一条；
- 体验版需要在 mp 后台把 `request` / `uploadFile` 合法域名配置为 `https://codis.fun`。

## 文档

- [开发进度与接口](docs/开发进度与接口.md)：接口清单、页面清单、部署与排障
- [家庭餐桌-PRD与原型](docs/家庭餐桌-PRD与原型.html)：需求与交互原型

## 许可

个人家庭自用项目，未附开源许可。
