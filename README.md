# 云枢 CloudPivot

> 多 Cloudflare 账号本地私有化运维客户端

云枢 CloudPivot 是面向站长、网络运维人员与工作室的纯本地客户端工具，用于一站式管理多个 Cloudflare 账号。软件在客户端内完成账号鉴权、域名与 DNS、Workers、Pages、WAF 安全规则等全部运维操作，无需频繁切换浏览器登录 Cloudflare 后台。

- **纯本地运行**：无自建后端，仅调用 Cloudflare 官方 V4 API。
- **密钥加密存储**：API Token / Global Key 使用 AES-256-GCM 加密后持久化，明文仅存在于运行期内存。
- **双端支持**：Windows 桌面端（Electron）+ Android 移动端（Capacitor），Vue 同一套代码。
- **三模式外观**：跟随系统 / 浅色（白 + 生态绿）/ 深色，即时切换并持久化。

## 功能总览

| 模块 | 说明 |
| --- | --- |
| 仪表盘 | 账号 / 域名 / Workers / Pages 统计概览、流量与请求量可视化图表、快捷操作入口 |
| 账号管理 | API Token 与邮箱 + Global Key 鉴权、账号分组、批量检测、Excel 批量导入、定时同步（1/5/10/30 分钟） |
| 域名 & DNS | 跨账号域名聚合、A/AAAA/CNAME/MX/TXT/SRV/CAA 记录增删改、TTL 与 CDN 代理开关、批量 DNS 运维 |
| Workers | 列表 / 新建 / 代码编辑（CodeMirror 高亮校验）/ 部署 / 版本回滚 / 变量与密钥 / 路由与 Cron 触发器 |
| Pages | 项目聚合、绑定仓库创建、构建命令配置、手动触发构建与日志查看、绑定自定义域名 |
| 安全规则 | WAF 规则跨账号查看与维护、IP 黑白名单导入导出 |
| 批量任务 | 跨账号批量执行与任务队列面板（进度 / 暂停 / 终止 / 日志留存） |
| 日志审计 | 操作留痕、检索筛选、日志导出 |
| 设置 | 外观主题、同步周期、日志保留、版本与关于 |

> 详细产品设计见 [需求文档](docs/%E4%BA%91%E6%9E%A2%20CloudPivot_%E9%9C%80%E6%B1%82%E6%96%87%E6%A1%A3.md)。

## 技术栈

- **核心框架**：Vue 3 + TypeScript + Vite 6
- **状态管理**：Pinia；本地持久化 IndexedDB（idb）
- **UI**：Element Plus（桌面）+ Vant（移动）+ ECharts（图表）
- **代码编辑器**：CodeMirror 6（JS/JSON 高亮、lint、一键部署）
- **桌面端**：Electron 33（contextIsolation + preload 桥接文件读写 / 窗口控制 / 原生主题）
- **移动端**：Capacitor 6（Android）
- **加密**：AES-256-GCM（账号密钥本地加密）
- **HTTP**：axios + Cloudflare V4 API

## 项目结构

```text
CloudPivot/
├── src/                  # Vue 前端源码
│   ├── api/              # Cloudflare V4 API 封装（账号/域名/DNS/Workers/Pages/WAF/分析）
│   ├── pages/            # 页面（dashboard/account/dns/workers/pages/waf/batch/log/settings）
│   ├── store/            # Pinia 状态 + 凭据内存解密服务
│   ├── layouts/          # 双端自适应布局（桌面侧边栏 / 移动底部 TabBar）
│   ├── router/           # 路由表（双端复用）
│   ├── components/       # 通用组件
│   ├── utils/            # 加密、主题、工具函数
│   └── types/            # TS 类型定义
├── electron/             # Electron 主进程与 preload（文件读写/窗口控制/主题/邮件）
├── android/              # Capacitor Android 工程
├── docs/                 # 产品需求文档
├── public/               # 静态资源与图标
├── scripts/              # 构建辅助脚本（图标生成等）
├── capacitor.config.ts   # Capacitor 配置
└── vite.config.ts        # Vite 构建与本地 /cf-api 代理
```

## 快速开始

### 环境要求

- Node.js ≥ 18，npm
- Windows：Electron 打包依赖；Android：Android Studio + JDK（可选）

### 安装依赖

```bash
npm install
```

### 启动开发（Web 形态）

```bash
npm run dev
```

开发环境下浏览器直连 Cloudflare 会触发 CORS，已通过 Vite 代理转发：请求走 `/cf-api` 前缀即被代理到 `https://api.cloudflare.com/client/v4`。

### 桌面端开发（Electron）

```bash
npm run electron:dev
```

### 构建

```bash
npm run build          # 仅构建 Web 静态产物到 dist/
npm run build:check    # vue-tsc 类型检查 + 构建
```

## 打包发布

### Windows（Electron）

```bash
npm run electron:build      # NSIS 安装包（x64 + ia32）
npm run electron:portable   # 便携版（x64）
```

产物输出到 `release/`。

### Android（Capacitor）

```bash
npm run apk:build      # 同步 Android 工程、生成图标并执行 gradlew assembleRelease
```

> 需先在 `capacitor.config.ts` 与 `android/` 工程中配置签名与包名 `com.cloudpivot.app`。

## 主要脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | Vite 构建 |
| `npm run build:check` | 类型检查 + 构建 |
| `npm run electron:dev` | Electron 开发模式 |
| `npm run electron:build` | 打包 Windows 安装程序 |
| `npm run electron:portable` | 打包 Windows 便携版 |
| `npm run cap:sync` | 同步 Capacitor |
| `npm run cap:android` | 同步并打开 Android Studio |
| `npm run apk:build` | 构建 Android APK |
| `npm run icons` | 重新生成应用图标 |

## 安全设计

- 账号凭据（API Token / Global Key）经 AES-256-GCM 加密后存储，主密钥本地派生，明文只在请求运行期驻留内存。
- 桌面端启用 `contextIsolation=true`、`nodeIntegration=false`，原生能力通过 preload 白名单 IPC 暴露。
- 全部数据仅存本地，不上传任何第三方服务器；邮件反馈等外发请求均为用户显式触发。
- 高危批量操作均设置二次确认。

## 支持平台

- **Windows**：Windows 10 / 11（32 位、64 位）
- **Android**：Android 10 ~ 14，手机 / 平板自适应

> 暂不支持 Mac、iOS、Linux。

## 软件免责声明

本软件为个人兴趣爱好开发产物，仅供个人学习、娱乐、非商业性质免费使用。

本人对本软件享有全部合法知识产权，**未经作者本人书面许可，任何单位及个人不得对本软件进行二次开发、修改、复刻、衍生创作，不得将本软件及相关资源用于商业盈利、引流变现、付费售卖等一切牟利行为**，严禁任何违规商用、二次开发及非法传播行为。

本软件无任何商业用途及商业服务属性，使用者在使用本软件的过程中，需自觉遵守当地法律法规及网络使用规范。因违规使用、私自篡改软件内容、非法商用、不当操作软件所造成的一切直接或间接损失、法律责任、纠纷风险等，均由使用者本人自行承担，软件作者不承担任何连带法律责任与相关后果。

凡下载、安装、使用本软件，即代表本人已完整阅读、理解并自愿接受本声明全部条款。

## 版本

当前版本：**2.0.0**
