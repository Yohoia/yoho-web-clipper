# AGENT.md — yoho-clipper 项目协作规范

## 项目定位

当前目录：

```text
/Users/yohoia/Desktop/yoho-web-clipper
```

这里就是 **yoho-clipper** 的项目根目录。不要另外创建 `yoho-clipper/` 子目录。

yoho-clipper 是一个 Chrome 扩展，用于把网页剪藏到 PageHush：

```text
网页 → 采集 / 清理 / 转 Markdown → 保存为 PageHush 文章草稿
```

PageHush 项目位置：

```text
/Users/yohoia/Desktop/PageHush
```

参考扩展位置：

```text
/Users/yohoia/Desktop/clipper01
```

## 根本原则

1. **当前目录是新项目本体**，不是 clipper01 的补丁目录。
2. **不允许直接修改 `/Users/yohoia/Desktop/clipper01`**。它只作为功能和交互参考。
3. **不整体复制 clipper01 的打包产物**。它的 `background.js`、`content.js`、`ContentFrame.js` 是高度压缩且与印象笔记帐号体系强绑定的 bundle，不适合作为实现基础。
4. 可以参考或复用 clipper01 的：
   - 剪藏类型划分
   - 页面预览交互
   - 选区高亮交互
   - 截图 / 标注交互思路
   - 弹窗布局思路
   - 部分可拆出的静态资源
5. 对外发布时，不应直接搬运印象笔记官方图形、文案、图标或受版权保护代码。个人本地实验可以参考，公开发布需要替换为自有素材和自有实现。
6. 本项目优先实现自有 Chrome MV3 + TypeScript 架构，只复用明确、稳定、可维护的交互点和功能点。

## 目标产品形态

### 第一阶段目标

- 用户在扩展弹窗中输入 PageHush 访问码。
- 登录成功后获取 PageHush 分类。
- 用户可以选择分类，例如 `学习`。
- 用户在任意网页点击剪藏。
- 扩展提取页面元数据和正文。
- 正文转换为 PageHush Markdown。
- 保存为 PageHush 草稿。
- 保存成功后可打开 PageHush 文章页。

### 后续目标

- 选区剪藏
- 整页剪藏
- 书签剪藏
- 截图剪藏
- 图片上传
- 标签选择
- 重复剪藏提示
- PDF / Gmail 等特殊页面支持

## PageHush 集成约定

### 认证

PageHush Web 当前使用 6 位访问码和 HttpOnly Cookie。Chrome 扩展与 API 跨源，直接复用 Cookie 可能受 `SameSite` 和浏览器策略影响。

推荐实现：

```text
扩展访问码登录
    ↓
PageHush 校验访问码
    ↓
复用 auth_sessions 表
    ↓
返回扩展专用 session token
    ↓
扩展存储 token
    ↓
后续请求使用 x-pagehush-session Header
```

不要把访问码明文长期存储在扩展中。登录成功后只保存服务端发放的 session token。

### API

优先复用现有接口：

```text
GET  /v1/topics
GET  /v1/tags
POST /v1/articles
POST /v1/assets
```

必要时只新增认证辅助接口，例如：

```text
POST /v1/auth/login-extension
GET  /v1/auth/session
DELETE /v1/auth/logout
```

不要为剪藏开放免登录内容接口。

## 数据映射约定

PageHush 的分类是 `topics`。剪藏插件中的“分类”对应 `topic`，不是印象笔记 notebook。

文章保存优先使用：

```json
{
  "title": "网页标题",
  "description": "网页摘要",
  "content": "Markdown 正文",
  "format": "md",
  "status": "draft",
  "language": "zh",
  "author": "页面作者或 Yohoia",
  "topicId": "已存在分类 ID",
  "topicName": "学习",
  "tagNames": [],
  "coverAssetId": null,
  "cover": null,
  "coverAlt": "网页标题"
}
```

`slug` 由 PageHush 生成，扩展不主动生成。

### 来源字段

为提升 PageHush 列表和详情展示，计划在 PageHush `articles` 表增加：

```text
source_url
source_site_name
source_site_icon_url
source_published_at
clip_type
word_count
reading_time_minutes
source_checksum
```

不要为默认封面新增数据库字段。没有封面时由 PageHush Web UI 显示默认占位图或按标题 / 分类生成占位图。

## 当前目录结构

当前第一版采用无构建 Chrome MV3 项目，直接加载当前目录：

```text
.
├── AGENT.md
├── README.md
├── plan.md
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── settings.html
│   ├── settings.css
│   └── settings.js
└── src/
    ├── config.js
    ├── preferences.js
    ├── background.js
    ├── panel.js
    └── content.js
```

后续引入 TypeScript / Vite 时，可以在此基础上演进，但必须保持当前目录仍是扩展项目根目录。

工具栏当前使用 `chrome.action.onClicked` 向普通网页注入 `src/panel.js`，在右侧扩展 iframe 中复用 popup 页面。面板默认 340px 宽，顶部、底部与右侧留 12px，高度随网页视口变化。`popup.html` 的独立 340×600 模式仅保留为检查入口；生产入口为网页右侧面板。认证与保存仍只由后台处理。

`clipper01/`、`clipper02/`、`clipper03/` 若再次出现在当前目录，只能作为参考目录，不得作为构建输入。

## 安全要求

- 不提交 `.env`。
- 不硬编码访问码。
- 不硬编码用户 token。
- 不把 token 写入 Markdown。
- 不采集浏览器密码、表单密码、Cookie 值。
- 上传资源必须经过用户确认或明确的剪藏动作。
- API 请求失败要给出可理解错误，不应静默吞掉。
- Markdown 输出必须清理脚本、事件属性和危险 URL。

## 质量要求

每次实现或修改后至少确认：

1. JavaScript 语法检查通过：`background.js`、`content.js`、`popup.js`。
2. `manifest.json` 是合法 JSON。
3. 扩展能在 Chrome `chrome://extensions` 加载。
3. Content Script 能注入普通 HTTP / HTTPS 页面。
4. 未登录、登录、保存成功、保存失败四类状态可见。
5. PageHush 中生成的草稿能被编辑器打开。
6. Markdown 中标题、链接、图片、列表、代码块没有被破坏。
7. 不请求印象笔记 / Evernote 域名。

## 文档更新要求

改动以下内容时必须同步更新 `plan.md`：

- 认证方案
- API 契约
- 数据库字段
- 剪藏类型
- 项目目录结构
- 关键风险决策

### 0.4.4 操作约定

右上角复制的是采集到的完整原文 URL；标题下不显示 URL。剪藏主操作放在标题与方式之间，滚动时保持可见；底部仅账户信息。标签上限 3 个、单个 40 字，旧草稿超限保留并提示删减，后台同样验证。主产品 API 的标签容量不随扩展限制变更。iframe 委派 clipboard-write，未新增扩展权限。

### 0.5.0 设置约定

左下角设置齿轮通过 runtime.openOptionsPage 打开 options/settings.html 独立页。偏好存于 storage.local.preferences，由 src/preferences.js 白名单解析；与 API settings 分离，不可重置凭证或草稿。已有草稿的方式/分类优先；完成后自动动作不可在恢复成功页重复执行。切换采集用 contentLoading 立即阻止提交，保留旧元数据直至最新请求完成。说明区高度和滚动位置保持稳定。设置页不进入后台受信任消息白名单。

### 0.5.1 关于页约定

左下角改为「关于拾页」信息图标，仍通过 runtime.openOptionsPage 打开 options/settings.html，以保留已有入口兼容。该页只显示介绍、版本、保存位置、标签上限与打开页息链接，不包含偏好表单、保存或重置动作，不修改登录或草稿。原偏好解析保留为旧版本兼容；切换稳定性修复继续保留。

### 0.5.2 关于页约定（覆盖上版展示内容）

用户选定 02 绿色装帧，实际关于页展示版本、保存位置、Markdown 格式、草稿状态、六种剪藏方式及登录/隐私说明，不再展示标签上限。关于页只读；产品链接和域名从 DEFAULT_SETTINGS.webBaseUrl 读取，版本从运行时 manifest 读取。只有 Logo 贴签入场，其余信息静止；减少动态效果兼容继续保留。历史关于页原型已在仓库清理中移除；最终实现保留在 options/settings.*。

### 0.5.3 关于入口（覆盖原生打开方式）

关于按钮通过 worker('openAbout') 请求后台 tabs.create 打开 runtime.getURL('options/settings.html')，不依赖原生 openOptionsPage 与已加载的 options_ui。保留 options_ui 供浏览器扩展详情入口使用；消息仍只接受扩展自身的 popup URL，关于页不进入消息白名单，不接受传入网址。失败保留输入，重新点击清除旧错误。

### 0.5.4 面板内关于（覆盖上版打开方式）

关于按钮切换 popup 的 aboutPanel，保留原外壳宽高和位置，不发打开新页消息。返回或 Esc 恢复 clipPanel、输入、选择、原滚动位置与关于图标焦点；关于页不触发剪藏快捷键。共享 src/about.js 内容和默认线上地址；popup/about.css 只作用于关于面板，options/settings.* 保留浏览器扩展详情入口。新增静态模块和样式加入 web_accessible_resources，不增加权限。后台不再提供 openAbout 消息。
### 0.5.5 正文图片归档约定

「网页正文」「整个网页」和「选中内容」保存前会解析 Markdown 中处于代码块外的远程 JPEG / PNG / WebP 图片，使用 no-referrer 下载并上传为页息 `inline_image` 资产，再替换正文链接；正文首图与封面外链一致时复用该资产作为 `coverAssetId`。单张 5MB、最多 30 张、总计 50MB；失败保留原外链，不阻断文字保存。纯文字、书签和截图的既有图片策略不变。
