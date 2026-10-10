# 拾页 PageHush Clipper 实施计划

## 0. 当前进度（2026-10-10）

### 0.5.4：在原剪藏面板内显示关于

- 按用户要求，关于图标直接切换当前面板内容，不打开新标签页、不导航原网页，不改变340px宽度、全高与12px边距。
- 保留选定绿色装帧并适配面板宽度；顶部固定返回和关闭，正文单一滚动。返回或 Esc 恢复剪藏输入、方式、分类、滚动位置与焦点，关于页中提交快捷键无效。
- 共享 src/about.js 产品介绍，popup/about.css 负责面板排版；浏览器扩展详情的 options_ui 继续兼容。移除后台 openAbout 新页消息，未增加权限或修改数据接口。
- 三次完整检查通过，验证真实 iframe 同表面切换、几何不变、无新标签、输入/滚动/焦点保留和关闭。证据见 docs/about-inline-design.md。

### 0.5.3：关于页打开入口修复

- 关于按钮通过已受信任的 popup → background 消息打开固定 options/settings.html 地址，避免依赖原生 openOptionsPage 的已加载 options_ui；不增加权限、不开放任意地址导航。
- 保留点击前的剪藏输入保存与失败提示，重新点击清除旧打开错误；同步浏览器预览入口。
- 新加载扩展的原入口可打开，用户环境的失败尚未直接取得底层异常，不将清单未重新加载认定为已证实原因。回归覆盖网页 iframe 实际入口、原生设置入口不可用、打开失败后的输入保留及重试成功。

### 0.5.2：绿色装帧关于页

- 用户从「关于页 01」选择 02 绿色装帧，应用到实际 options/settings.*；保留直角装帧、品牌绿和倾斜 Logo。
- 去掉关于页的标签数量，增加 Markdown 格式、草稿状态、六种剪藏方式和访问码登录/隐私说明；版本与线上产品地址从现有配置读取。
- 页面只读，只有 Logo 入场、Logo 悬停和产品链接反馈，信息文字保持稳定；兼容系统与早期偏好的减少动态效果。
- 三种原型曾作为历史对比，后续已随仓库清理移除；实际最终页使用 /about-preview，当前说明见 docs/about-inline-design.md。

### 0.5.1：只保留关于拾页

- 按用户要求删除通用、快捷键、自动保存与恢复默认等设置界面；只保留关于拾页的产品用途、版本、保存位置、三标签上限和打开页息链接。
- 左下角齿轮替换为信息图标，名称/提示为「关于拾页」；通过原生 openOptionsPage 进入。保留 options/settings.* 内部路径与 /settings-preview 的兼容，新增 /about-preview。
- 关于页不写存储，不触及 API、登录、草稿或既有偏好；切换稳定性与旧偏好兼容继续保留。浏览器预览只模拟版本和只读存储。
- 检查实际关于入口、版本、只读/无表单、刷新和产品链接，并保留原剪藏流程与旧偏好兼容检查。证据见 docs/about-design.md。

### 0.5.0：剪藏切换稳定性与设置页

- 切换方式时立即开始读取、禁用主提交，保留已采集标题/链接/统计直到新内容完成；请求版本隔离保留，说明区预留两行，滚动区域不再自动锚定。逐帧核对六种方式的标题、按钮、分类和滚动位置稳定。
- 删除左下角「保存为草稿，随时继续编辑」，换成设置齿轮。新增独立 `options/settings.html`、`settings.css`、`settings.js`，通过原生 `openOptionsPage` 打开；manifest 增加 options_ui，版本 0.5.0，无新权限。
- 参考 clipper01 的 OptionsFrame 设置分类、默认格式/最近使用、笔记本策略、完成后行为及快捷键；自有实现通用、快捷键、关于三页，沿用字体与暖白/绿设计。
- `src/preferences.js` 统一偏好默认值和白名单解析；本机 `preferences` 独立于原 API 配置。支持默认六种/最近方式、最近分类/学习、显示结果/打开文章/收起面板、Ctrl或Command+Enter开关、减少动画。存储写入串行，失败保留待保存值并允许重试；重置不触及 token/草稿。
- 已有草稿的方式与分类优先；无选区时默认选区回到正文。完成后动作只在本次成功执行一次，恢复成功页不重复打开文章。减少动画覆盖面板出场和内部反馈。
- API、后台信任边界、主产品 schema 和在线服务地址保持；设置页不读取访问码/token或修改服务地址。新增本机设置预览 `tests/settings-preview.js` 与 `/settings-preview`。
- 实际扩展检查增加真实设置入口、保存重读/失败重试/安全重置、默认行为/旧草稿优先、自动打开/收起与切换逐帧检查。设计和证据见 `docs/settings-design.md`。

### 0.4.4：复制原文链接与剪藏操作调整

- 右上角连接状态改为复制链接按钮，复制采集到的完整原文 URL（含参数与锚点），成功短暂显示「已复制」，失败允许重试。读取完成前禁用；登录/成功页隐藏。
- 去除标题下方 URL；正文来源与保存 payload 保留。标题和剪藏方式之间放置「剪藏」主操作，滚动时粘在内容区上方，底部保留草稿提示与退出登录。
- 标签最多 3 个，每个仍为 40 字；超限提示滚动到可见位置。输入、批量文本、建议、未确认标签与后台提交均受限；旧草稿超限不截断，提示先删除多余标签。
- 面板 iframe 委派 clipboard-write；没有新增扩展权限、API、目录层级或主产品 schema。复制失败使用选区回退并清理临时字段、恢复焦点。版本 0.4.4。
- 沿用 340px 面板、12px 外边距、字体、六项列表与登录。实际画面、动效、独立评审及连续三次验证见 `docs/clip-actions-design.md`。

### 0.4.3：统一紧凑比例与字体

- 用户要求参考 clipper01 收缩整体比例并保持 UI 一致。右侧面板与独立检查页从 400px 收到 340px，12px 外边距与全高保持。
- 统一字体回退为 Helvetica Neue、Lucida Grande、中文苹方；选项文字 12px、文章标题 16px、内边距 16px。页头 48px、分类/输入/主要按钮 36px；六格访问码 44px，登录和成功标题统一无衬线 24px。
- 纵向六项列表仍为 32px，单行标题、分类菜单、签条和原有动效保留。仅参考尺寸与字体关系，不复制官方字体文件、图标或修改 clipper01。
- 同步更新尺寸断言与协作规范。服务、权限及 API 不变。当前设计、实际截图与验证见 `docs/compact-ui-design.md`。


### 0.4.2：采用参考图的纵向剪藏列表

- 用户指定印象笔记截图中的列表结构，已替换正式扩展的双排选项：32px 行高、左图标、浅色选中行、右侧绿色勾号，支持键盘选择与减少动态效果。
- 仅参考 `clipper01/ContentFrame.css` 的 `.listItem`、`.listItemWithIcon` 和亮色变量，不复制官方 SVG、代码或修改参考目录；保留拾页现有六种实际方式与单行标题。
- 中间表单间距收紧，矮窗口滚动到分类和标签，页头与保存底栏固定。服务地址、权限、API 契约不变。
- 四方案对比页保留为历史原型；当前页面直接使用生产列表。设计、截图、评审和连续三次检查见 `docs/vertical-modes-design.md`。

### 0.4.1：单行标题与紧凑剪藏方式对比

- 标题改为单行输入，失焦时省略溢出内容，悬停显示完整标题；编辑和保存保留完整值。
- 提供四种非下拉的可操作方案：单行图标、单行文字、常用三项加行内展开、横向滑动条。用户尚未选定，生产扩展保留现有六种方式布局。
- 当时新增 `tests/mode-options.css`、`mode-options.js`、`check-mode-options.mjs` 和 `docs/mode-options/` 作为历史对比；这些文件已在后续仓库清理中移除。
- 各方案的预览存储曾独立，截图平台与上传接口使用本地模拟，主产品 API、扩展权限和剪藏契约未变。历史原型检查日志也已移除。

### 0.4.0：六种剪藏、分类菜单与标签签条

- 移除 Markdown 剪藏预览，保留标题、来源与阅读数据。新增整个网页、纯文字、可见区域截图，与正文、选区、书签组成六种实际剪藏。
- PageHush 的现有 schema 已接受全部类型，无需修改主项目。截图使用现有 `POST /v1/assets` multipart 上传并关联 `coverAssetId`，再创建文章；读取 `/v1/tags` 提供已有标签。
- 分类替换为自定义搜索菜单，支持键盘、无结果、选中标记、向上展开和 Esc；标签支持成签、批量粘贴、去重、删除、已有标签与限额。
- 主文档、脚本、表单及自身 UI 清理保留；整页模式保留导航/页脚，纯文字去图片，截图只在明确保存动作触发。截图前后确认来源标签页，隐藏面板且失败也恢复。
- 增补统一线条图标，外框与字段为直角，小按钮/签条保留圆角；保存按钮移到固定底栏，矮窗口中间独立滚动。
- 仍使用原有权限，在线默认地址和六格登录保持。截图为可见区域，无长图、裁剪/标注；文章整页保存为 Markdown，无像素级网页样式还原。
- 设计、证据、独立评审和连续三次检查见 `docs/clip-controls-design.md`。

### 0.3.1：网页右侧全高面板

- 根据用户提供的印象笔记截图与 clipper01 的 `TopFrames.css`、`ContentFrame.css`、iframe 载入/尺寸逻辑，改为点击工具栏后在当前网页右侧展开工具。仅参考承载方式与边距，未复制官方样式、品牌或 bundle。
- 面板宽 400px，上下/右各 12px，随浏览器内容区全高；窄窗口宽度为视口宽减 24px。页头固定、内容独立滚动，保存操作靠底。
- `src/panel.js` 仅在用户点击时注入，复用原登录与剪藏页面，Shadow DOM 与扩展 iframe 隔离网页样式；Chrome 内部页和商店页通过工具栏提示无法剪藏。
- 右上关闭、Esc 和再次点击工具栏收起；不锁原网页滚动、不改正文尺寸，关闭后恢复原焦点。保存仍在后台继续，未保存输入仍按当前网页恢复。
- iframe 从受信任消息的 `sender.tab` 获取源网页，避免切换标签页后错误剪藏另一页；网页采集明确排除自身 UI。
- 新增 `tests/panel-preview.html`、`panel-preview.js`（仅本机预览）、实际嵌入面板集成检查和全高/窄窗口证据。无生产构建，无新增 API 或权限类别。
- 已在用户 Chrome 重新加载 0.3.1，并通过真实工具栏点击确认全高登录面板。设计与验证记录见 `docs/side-panel-design.md`。

### 0.3.0：拾页界面与交互深化

- 移除右上角设置入口、设置页面和 API 地址输入。默认继续使用线上页息；后台旧配置解析保留兼容，日常使用不需要配置服务。
- 保留 400×600 的纸面与绿色方向，登录口号使用宋体类字体，六格访问码加入聚焦、填入、完成与错误反馈。
- 当前文章采用折角纸页，正文/选区/书签共用滑动选中底板；重新读取内容时禁用保存，防止保存旧预览。
- 保存期间纸页收拢，只有后台确认成功后显示纸页勾号；新分类、预览展开与首次出场加入短过渡。系统减少动态效果时简化动画。
- 删除重复登录副标题、页面上的服务地址和设置说明；默认工作台的保存与退出登录完整可见，展开内容时仅正文区域滚动。
- 按 oil-ui-pro 获取实际静态、200% 细节和三组动效帧，并进行独立视觉评审及连续三次隔离扩展检查。记录见 `docs/interaction-design.md`。

### 0.2.2：固定文章短地址

- 页息 API 返回 `shortId`，来自文章既有 UUID 的完整 Base62 编码，固定 22 位数字与大小写字母；无需数据库迁移，不随标题修改。
- 拾页「在页息中打开」优先使用 `/a/:shortId`；尚未更新的 API 不返回 shortId 时回退 `/articles/:id`，不再使用中文 slug。
- 保存结果持久化 shortId，重开弹窗保持短地址；旧保存结果读取时根据已有 id 重建链接。
- 页息保留旧 `/articles/:slug` 和 UUID 链接，成功读取后使用 replace 转到短地址。短地址页面将标识解码成 UUID，再访问原有受认证保护的 API。
- 发布顺序：先更新页息网页（支持 `/a/`），再更新 API（返回 shortId）；拾页兼容新旧 API。实现与验证不写入线上文章数据。

### 0.2.1：拾页品牌、弹窗尺寸与六格登录

- 中文扩展名统一为「拾页」，全称「拾页 PageHush Clipper」，主产品为「页息 PageHush」。登录页使用「拾起灵感，留住好文章。」口号。
- 使用用户提供的根目录 `clipper-logo.png`，导出 16/32/48/128 图标，替换工具栏、页头和登录页标志。
- 修复实际 Chrome 弹窗收缩问题：文档固定 400×600，移除 `max-width: 100vw`，仅内容区域滚动。
- 访问码改为六个独立数字输入格，支持自动跳转、退格、方向键、整码粘贴与显示/隐藏。无效码清空，网络错误保留输入，填满后启用登录。
- 扩充隔离扩展检查，验证输入交互、Logo 加载、不同初始视口及各状态尺寸；已在当前 Chrome 重新加载并检查真实工具栏弹窗。

### 0.2.0：线上登录与剪藏工作台改造

用户已明确默认连接线上服务，公开地址为 `https://pagehush.yohoia.cn`。已核实网页和 API 同域，接口直接走 `/v1/...`，**不是 `/api/v1/...`**。

- 点击扩展，未登录时只显示独立访问码登录页；修复 CSS 覆盖 `hidden` 导致多个面板同时显示的问题。
- 线上默认地址收敛到 `src/config.js`，无需手填；旧版默认本机配置自动迁移，旧 token 不发往线上。明确保存的自定义地址保留。
- 认证、session 校验、topics 和文章保存统一交给 MV3 background；popup 只拿登录元数据，不需要 token。
- 勾选保持登录时使用 `chrome.storage.local`，未勾选使用 `chrome.storage.session`；到期或 401 清除凭证，暂时网络失败保留登录并提供重试。
- 分类失败与页面读取失败分别恢复；登录检查遇到网络错误显示连接恢复页，不伪装成退出登录。
- 剪藏工作台支持正文、选区、书签，标题修改、标签输入、分类选择/新建和 Markdown 文本预览。
- 修复空分类默认创建「学习」时被校验挡住的问题；已有分类默认最近使用、学习或第一项。
- 修复 `topicName: null` 不符合 PageHush `Type.Optional(Type.String())` 契约的问题，已有分类时省略该字段。
- 当前网页的输入暂存在会话存储，失败和弹窗重开后保留；保存后台化，结果摘要持久化，关闭弹窗后重开可恢复。后台阻止并发重复创建。
- 保存超时/中断不自动重发，提示用户先确认线上草稿；成功响应后本地偏好存储失败仍保留成功结果，避免引导重复提交。
- Markdown 转换保留代码缩进、连续空行、含反引号的行内代码、有序列表起始值和嵌套列表；过滤表单/隐藏元素/危险 URL，转义书签摘要和来源文字中的 HTML。
- 统一为 400×600 暖白纸面与深绿色界面，补充原创图标，支持键盘保存和减少动态效果。
- 新增隔离 Chromium 集成检查、浏览器预览与视觉证据。预览脚本不进入扩展加载链路。

新增目录/文件：`src/config.js`、`icons/`、`tests/`、`docs/implementation.md`、`docs/evidence/`。仍然无构建，直接加载当前根目录，未改动 clipper01 或 PageHush。

实际线上验证范围：健康检查正常；`/v1/auth/session` 返回未登录状态；扩展登录接口能返回输入校验错误。未使用用户访问码，未执行真实线上登录或草稿写入。完整登录到保存链路通过本机隔离 API 与实际 Chrome MV3 扩展验证。


### 已完成

- 建立当前目录作为 yoho-clipper 项目根目录。
- 建立无构建 Chrome MV3 扩展骨架。
- 实现访问码登录 UI。
- 实现扩展专用 token Header 登录。
- 实现获取 PageHush topics。
- 实现分类选择和新分类输入。
- 实现文章、选区、书签三种基础剪藏。
- 实现页面元数据提取。
- 实现基础 HTML → Markdown 转换。
- 实现保存 PageHush Markdown 草稿。
- 实现来源字段数据库迁移 `0003_purple_wallop.sql`。
- PageHush 文章卡片显示来源站点、favicon、剪藏类型、原文时间和阅读时间。
- 无封面时继续使用 PageHush 默认封面。
- PageHush `typecheck`、`lint`、单元测试和构建通过。
- 扩展已完成 Chrome 加载、popup 错误状态和 example.com 正文采集冒烟测试。
- 使用本地 Mock PageHush API 完成端到端冒烟：访问码登录 → 获取“学习”分类 → 采集 example.com → 生成 Markdown payload → 创建草稿 → 显示成功。

### 尚未完成

- 截图剪藏。
- 正文图片上传。
- 查重提示。
- PDF / Gmail / AI 等高级功能。

## 1. 背景与目标

yoho-clipper 要实现一个类似印象笔记剪藏体验的 Chrome 扩展，但保存目标不是印象笔记，而是 PageHush。

### 核心目标

```text
用户在网页上点击剪藏
    ↓
扩展采集标题、摘要、作者、来源、正文
    ↓
正文转换为 PageHush Markdown
    ↓
选择 PageHush 分类，例如“学习”
    ↓
保存为 PageHush 文章草稿
    ↓
在 PageHush 中继续编辑和展示
```

### 实现原则

- 不在 `/Users/yohoia/Desktop/clipper01` 上直接修改。
- 不整体搬运 clipper01 的压缩 bundle。
- 复用其交互思路、功能拆分和可拆离资源。
- 当前目录作为 yoho-clipper 根目录直接开发。
- PageHush 侧只做必要的数据模型、认证和展示增强。

---

## 2. 参考结论

### 2.1 clipper01 可复用点

| 能力 | 复用方式 |
|---|---|
| 剪藏类型：文章、简化、整页、选区、书签、截图 | 复用功能划分和交互流程 |
| 选区高亮 | 参考 UI 和交互，重新实现 |
| 文章正文预览 | 参考 UI 和交互，重新实现 |
| 截图 / 标注 | 第一阶段只做截图，标注后续参考实现 |
| iframe 序列化 | 后续参考其思路，重新实现或引入可靠库 |
| 弹窗分层 | 参考 UI 结构，不复用其帐号逻辑 |
| 图标 / 品牌素材 | 不直接用于公开发布，需替换自有素材 |

### 2.2 clipper01 不复用点

| 模块 | 原因 |
|---|---|
| 印象笔记登录 | PageHush 使用访问码 |
| 印象笔记帐号体系 | PageHush 当前无多帐号模型 |
| notebook 同步 | PageHush 使用 topics |
| ENML Note 构建 | PageHush 使用 Markdown |
| `clipNote` / `noteStatus` 轮询 | PageHush 创建文章是同步接口 |
| 会员 / 容量 / 升级提示 | 暂无对应产品模型 |
| 印象 AI | PageHush 暂无 AI API |
| 多渠道保存 | 第一阶段只保存到一个 PageHush 实例 |

---

## 3. 目标架构

```text
Chrome 页面
    ↓
Content Script
    ├── 页面元数据采集
    ├── 选区采集
    ├── 正文 DOM 采集
    ├── 截图辅助
    └── HTML / Markdown 预览数据
    ↓
Extension Popup
    ├── 访问码登录
    ├── 分类选择
    ├── 剪藏类型选择
    └── 保存状态反馈
    ↓
Background Service Worker
    ├── PageHush API Client
    ├── Session 管理
    ├── Markdown 转换调度
    ├── 资源上传
    └──文章创建
    ↓
PageHush API
    ├── /v1/topics
    ├── /v1/assets
    └── /v1/articles
    ↓
PageHush Web
    ├── 文章草稿
    ├── 来源信息展示
    ├── 默认封面占位图
    └── Markdown 编辑器
```

---

## 4. 数据模型调整

### 4.1 PageHush 现有可用字段

`articles` 表已有：

| 字段 | yoho-clipper 用途 |
|---|---|
| `title` | 网页标题 |
| `description` | 网页摘要或正文首段 |
| `content` | Markdown 正文 |
| `format` | 固定 `md` |
| `status` | 固定 `draft` |
| `language` | `zh` / `en` |
| `author` | 页面作者，缺省 `Yohoia` |
| `topicId` | 分类 ID |
| `coverAssetId` | 上传后的封面资源 |
| `coverUrl` | 外部封面地址 |
| `coverAlt` | 封面替代文本 |
| `publishedAt` | PageHush 侧时间 |
| `recordCreatedAt` | 创建记录时间 |

`topics` 表用于分类。`学习` 已是 PageHush 的默认分类示例。

### 4.2 建议新增字段

为了更好的展示和后续去重，建议在 PageHush `articles` 表新增以下字段：

| 字段 | 类型建议 | 用途 | 必要性 |
|---|---|---|---|
| `source_url` | `text` | 原文链接，可点击跳转 | 高 |
| `source_site_name` | `text` | 站点名或域名，例如 GitHub Docs | 高 |
| `source_site_icon_url` | `text` | favicon / 站点图标 | 中 |
| `source_published_at` | `timestamp` | 原文发布时间，区别于 PageHush 创建时间 | 中 |
| `clip_type` | `pg enum` 或受控 `text` | 显示“文章 / 选区 / 书签 / 截图”等标签 | 高 |
| `word_count` | `integer` | 字数统计 | 中 |
| `reading_time_minutes` | `integer` | 预计阅读时间 | 中 |
| `source_checksum` | `text` | 页面 URL + 正文摘要哈希，用于后续查重 | 中 |

### 4.3 暂不建议新增的字段

| 字段 | 原因 |
|---|---|
| 默认封面字段 | 无封面应由 Web UI 生成或显示占位图，不应入库 |
| 原始 HTML | 体积大、清理成本高、容易带来安全风险 |
| 印象笔记 GUID | 与 PageHush 无关 |
| 单独来源作者 | 现有 `author` 已可复用 |
| 单独来源摘要 | 现有 `description` 已可复用 |
| 单独保存时间 | 现有 `recordCreatedAt` 已可复用 |

### 4.4 封面策略

1. 优先使用页面 `og:image`、`twitter:image`。
2. 如果图片可靠且允许上传，上传到 PageHush assets，保存 `coverAssetId`。
3. 如果上传失败，可临时保存 `coverUrl`。
4. 如果没有封面，不填充伪数据。
5. PageHush Web 显示默认占位图，或基于标题 / 分类生成稳定封面。
6. 截图剪藏可用截图作为封面，同时插入正文。

---

## 5. 认证方案

### 5.1 当前 PageHush 认证

PageHush 已有：

```text
POST /v1/auth/login
GET /v1/auth/session
DELETE /v1/auth/logout
```

Web 端使用 6 位访问码，成功后写入 `pagehush_session` HttpOnly Cookie，会话保存 30 天。

### 5.2 扩展认证方案

Chrome 扩展请求 PageHush API 属于跨源请求，直接复用 Cookie 可能不稳定。推荐增加扩展专用登录：

```text
POST /v1/auth/login-extension
```

请求：

```json
{
  "accessCode": "123456",
  "remember": true
}
```

响应：

```json
{
  "authenticated": true,
  "sessionToken": "server-generated-token",
  "expiresAt": "2026-11-08T00:00:00.000Z"
}
```

服务端仍然复用：

```text
PAGEHUSH_ACCESS_CODE_HASH
auth_sessions
verifyAccessCode
```

后续 API 请求 Header：

```text
x-pagehush-session: <token>
```

`findValidSession` 支持两种认证来源：

```text
Web: pagehush_session Cookie
Extension: x-pagehush-session Header
```

### 5.3 安全措施

- 登录接口保持速率限制。
- 勾选保持登录时 token 存 `chrome.storage.local`，未勾选时仅存 `chrome.storage.session`，浏览器关闭后清除。
- 不保存访问码明文。
- 退出登录时删除 token 和服务端 session。
- token 不写入日志。
- 生产环境必须使用 HTTPS。
- CORS 只允许必要的来源。

---

## 6. API 契约

### 6.1 获取分类

复用：

```text
GET /v1/topics
```

返回示例：

```json
[
  {
    "id": "uuid",
    "name": "学习",
    "articleCount": 12
  }
]
```

### 6.2 上传资源

复用：

```text
POST /v1/assets
```

第一阶段只支持：

```text
image/jpeg
image/png
image/webp
```

最大 5MB。

### 6.3 创建文章

复用：

```text
POST /v1/articles
```

剪藏请求示例：

```json
{
  "title": "网页标题",
  "description": "网页摘要",
  "content": "# 采集后的 Markdown",
  "format": "md",
  "status": "draft",
  "language": "zh",
  "author": "原作者",
  "topicId": "uuid",
  "topicName": "学习",
  "coverAssetId": null,
  "cover": "https://example.com/cover.jpg",
  "coverAlt": "网页标题",
  "tagNames": [],
  "sourceUrl": "https://example.com/article",
  "sourceSiteName": "Example",
  "sourceSiteIconUrl": "https://example.com/favicon.ico",
  "sourcePublishedAt": "2026-10-01T08:00:00.000Z",
  "clipType": "article",
  "wordCount": 1200,
  "readingTimeMinutes": 5,
  "sourceChecksum": "sha256"
}
```

创建成功后扩展使用返回的 `slug` 打开：

```text
http://127.0.0.1:5173/articles/{slug}
```

---

## 7. Markdown 生成规则

### 7.1 不使用 YAML Frontmatter

PageHush 的标题、摘要、分类、标签和来源信息都是结构化数据库字段。`content` 只保存 Markdown 正文。

### 7.2 正文开头格式

建议：

```md
> 原文：[网页标题](https://example.com/article)
> 来源：Example · 作者名 · 2026-10-01

正文 Markdown...
```

如果新增来源字段已经入库，这段可保留为阅读提示，不必承担数据存储职责。

### 7.3 保留元素

必须尽量保留：

- 标题层级
- 段落
- 链接
- 图片
- 有序 / 无序列表
- 引用
- 行内代码
- 代码块
- 表格
- 粗体、斜体、删除线

### 7.4 清理元素

必须移除：

- `<script>`
- `<style>`
- `<iframe>`，除非后续明确支持
- 事件属性
- `javascript:` URL
- 隐藏元素
- 广告容器
- 导航 / 页脚 / 评论区的明显噪声
- 剪藏高亮临时节点
- tracking pixel

### 7.5 HTML 转 Markdown 技术方案

计划使用成熟库组合：

```text
DOM 清理 / 提取：DOMPurify 或自有 allowlist
HTML → Markdown：Turndown
正文识别：Readability 或自研启发式
```

复杂节点处理策略：

- 能可靠转换的转 Markdown；
- 表格、公式等复杂结构可保留受控 HTML 块；
- 不确定时宁可保留原文结构，不盲目删除内容。

---

## 8. 实施步骤

## Phase 0：项目基线

目标：建立当前目录作为 yoho-clipper 根目录。

任务：

1. 创建 `AGENT.md`。
2. 创建 `plan.md`。
3. 后续初始化 `package.json`。
4. 配置 TypeScript / Vite / ESLint / Prettier。
5. 建立扩展 MV3 基础目录。
6. 明确开发模式 API 地址：
   - API: `http://127.0.0.1:8787`
   - Web: `http://127.0.0.1:5173`

验收：

- 当前目录能安装依赖。
- 空扩展可在 Chrome 加载。
- 文档明确项目边界和复用规则。

---

## Phase 1：PageHush 扩展认证

目标：扩展能用访问码登录 PageHush。

任务：

1. 在 PageHush API 增加扩展登录接口。
2. 复用现有访问码 hash 校验。
3. 复用 `auth_sessions` 表。
4. `findValidSession` 支持 `x-pagehush-session`。
5. 增加扩展退出登录。
6. 添加单元测试。
7. 确认 CORS 配置。

验收：

- 正确访问码可以换取 token。
- 错误访问码返回 401。
- token 可访问 `/v1/topics`。
- 无 token 访问返回 401。
- 退出后 token 失效。

风险：

| 问题 | 影响 | 处理 |
|---|---|---|
| Cookie 跨源不可用 | 扩展无法复用 Web 登录 | 使用 token Header |
| token 泄漏 | 可写入文章 | HTTPS、不落日志、有效期、退出失效 |
| 暴力破解 | 安全风险 | 保留 rate limit |

---

## Phase 2：扩展骨架

目标：搭建可加载、可通信的 Chrome MV3 扩展。

任务：

1. 创建 `manifest.json`。
2. 创建 Popup UI。
3. 创建 Background Service Worker。
4. 创建 Content Script。
5. 建立消息协议。
6. 实现访问码登录界面。
7. 实现登录状态展示。
8. 增加基础错误提示。

验收：

- 能加载未打包扩展。
- Popup 能显示登录表单。
- 登录成功后显示已连接 PageHush。
- 能获取并显示 `学习` 等分类。
- 关闭浏览器后仍能恢复登录状态。

风险：

| 问题 | 影响 | 处理 |
|---|---|---|
| MV3 Service Worker 生命周期短 | 状态丢失 | 状态存 chrome.storage |
| 权限声明过宽 | 审核和安全问题 | 逐项评估，避免不必要权限 |
| 消息协议混乱 | 后期难维护 | 统一 request/response 类型和文档 |

---

## Phase 3：页面元数据与正文采集

目标：从普通网页提取结构化数据和正文。

任务：

1. 提取：
   - `title`
   - `meta description`
   - canonical URL
   - `og:site_name`
   - favicon
   - `og:image`
   - `article:author`
   - `article:published_time`
   - 页面语言
2. 识别正文区域。
3. 移除导航、广告、页脚等噪声。
4. 支持选区模式。
5. 生成字数和阅读时间。
6. 计算 `source_checksum`。
7. 建立采集预览。

验收：

- 普通文章页能提取标题、作者、来源和正文。
- 选区剪藏只包含用户选中内容。
- 生成 Markdown 可读。
- 不包含脚本和隐藏节点。

风险：

| 问题 | 影响 | 处理 |
|---|---|---|
| 现代页面 DOM 复杂 | 正文识别不准 | Readability + 站点规则 + 手动选区兜底 |
| 动态内容 | 采集时内容可能未加载 | 等待稳定或提示用户稍后 |
| SPA 页面 | URL / 标题变化 | 采集时实时读取，不缓存过早 |
| 图片懒加载 | Markdown 缺图 | 解析 `data-src` / `srcset` |
| CSS 依赖内容 | 转换后可读性差 | 保留语义结构，不依赖原样式 |

---

## Phase 4：Markdown 保存链路

目标：把采集结果保存为 PageHush 草稿。

任务：

1. 实现 HTML 清理。
2. 实现 HTML → Markdown。
3. 组装 `POST /v1/articles` payload。
4. 支持选择 topic。
5. 保存为 `draft`。
6. 保存成功后展示文章链接。
7. 保存失败展示 API 错误。
8. 记录最近使用分类。

验收：

- PageHush 文章列表出现新草稿。
- 分类为用户选择的分类。
- 文章可打开编辑。
- 标题、摘要、正文、来源字段正确。
- 无印象笔记网络请求。

风险：

| 问题 | 影响 | 处理 |
|---|---|---|
| HTML 转 Markdown 丢失结构 | 内容不可读 | 单元测试覆盖常见节点，复杂节点保留 HTML |
| 标题超长 | API 拒绝 | 按数据库限制截断 |
| 描述超长 | API 拒绝 | 500 字内截断 |
| 标签数量过多 | API 拒绝 | 第一阶段默认空标签 |
| 重复保存 | 生成重复草稿 | Phase 6 用 source checksum 查重 |

---

## Phase 5：封面与资源上传

目标：提升列表展示效果。

任务：

1. 提取 `og:image` / `twitter:image`。
2. 可选上传封面图片。
3. 截图模式生成 PNG。
4. 截图上传为 asset。
5. 截图可作为封面或正文图片。
6. 正文图片按用户设置决定是否上传。
7. 上传失败时降级为远程 URL 或无封面。

验收：

- 有封面时 PageHush 显示封面。
- 无封面时显示默认占位图。
- 截图能在 PageHush 中查看。
- 超过 5MB 或不支持格式时给出提示。

风险：

| 问题 | 影响 | 处理 |
|---|---|---|
| 远程图片 CORS | 无法读取上传 | 使用 `chrome.scripting` / background fetch 权限，失败则保留 URL |
| 图片格式不支持 | 上传失败 | 支持 JPEG / PNG / WebP，其余跳过 |
| 图片过大 | 超过 5MB 限制 | 压缩或放弃上传 |
| 热链失效 | 封面未来不显示 | 优先上传 asset |
| 隐私风险 | 内网图片被上传 | 默认只上传封面，正文图片可配置 |

---

## Phase 6：PageHush 展示增强与查重

目标：让剪藏内容在 PageHush 中有更好的展示。

任务：

1. API 返回新增来源字段。
2. Web 文章卡片显示：
   - 来源站点
   - favicon
   - 原文链接
   - 剪藏类型标签
   - 阅读时间
3. 详情页显示“查看原文”。
4. 无封面时显示稳定占位图。
5. 创建前根据 `source_checksum` 查询重复。
6. 重复时提示：
   - 打开已有文章
   - 仍然创建新草稿
7. 增加测试数据。

验收：

- 列表卡片信息更完整。
- 无封面不出现空白。
- 重复 URL / 重复内容能被识别。
- 用户可选择是否仍然保存。

风险：

| 问题 | 影响 | 处理 |
|---|---|---|
| checksum 误判 | 动态页面噪声导致不同 | 只对正文规范化后计算 |
| 同 URL 多版本 | 用户确实想保存多次 | 允许覆盖 / 另存，由用户选择 |
| 字段过多 | 页面拥挤 | 卡片只显示站点、类型、时间，详情显示完整来源 |

---

## Phase 7：剪藏类型完善

目标：逐步接近 clipper01 的功能体验。

顺序：

1. 文章
2. 选区
3. 书签
4. 截图
5. 简化正文
6. 整页
7. PDF
8. Gmail

### 各类型处理

| 类型 | 保存内容 | 特点 |
|---|---|---|
| article | 标题 + 正文 Markdown | 第一阶段核心 |
| selection | 用户选中文本 | 保留上下文和原文链接 |
| bookmark | 标题、URL、摘要 | 不保存正文 |
| screenshot | 截图 asset + 少量说明 | 可作为封面 |
| simplified | 清洗后的正文 | 移除更多噪声 |
| full_page | 整个可见主文档 | 尽量保留结构 |
| PDF | PDF 链接或文件 | 依赖 PageHush 支持非图片资源 |
| Gmail | 邮件会话结构 | 依赖 DOM 专规则，后续处理 |

风险：

| 问题 | 影响 | 处理 |
|---|---|---|
| PDF 不被资产接口支持 | 无法完整保存 | 先保存链接，后续扩展资产类型 |
| Gmail DOM 变化 | 功能失效 | 后续单独适配 |
| 整页内容过大 | 超时或数据库过大 | 限制体积并提示 |
| 截图权限 | 权限审核复杂 | 使用 `activeTab`，避免常驻屏幕捕获 |

---

## Phase 8：测试与发布准备

任务：

1. 单元测试：
   - metadata parser
   - HTML cleaner
   - Markdown converter
   - payload builder
2. 集成测试：
   - 登录
   - topics
   - create article
   - assets
3. E2E 测试：
   - 普通文章页
   - 选区
   - 无封面页
   - 图片丰富页
   - 登录失效
4. 手工浏览器矩阵：
   - Chrome stable
   - Chrome beta 可选
5. 替换所有官方素材。
6. 编写使用说明。

验收：

- `npm run check` 通过。
- PageHush `npm run check` 通过。
- 扩展无 console 错误。
- 剪藏成功 / 失败状态清晰。
- 无印象笔记品牌残留。
- 无访问码、token、密钥入库。

---

## 9. 建议文件结构

```text
.
├── AGENT.md
├── plan.md
├── package.json
├── manifest.json
├── public/
│   ├── popup.html
│   └── icons/
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   ├── content/
│   │   ├── content-script.ts
│   │   ├── metadata.ts
│   │   ├── readability.ts
│   │   └── selection.ts
│   ├── popup/
│   │   ├── popup.tsx
│   │   ├── LoginPage.tsx
│   │   ├── ClipPage.tsx
│   │   └── SuccessPage.tsx
│   └── lib/
│       ├── api-client.ts
│       ├── auth.ts
│       ├── markdown.ts
│       ├── url.ts
│       └── clip-types.ts
└── tests/
```

---

## 10. 主要风险清单

## 技术风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 正文识别不稳定 | 不同网站 DOM 差异大 | Readability + 选区兜底 |
| Markdown 转换丢失格式 | 表格、代码、嵌套列表复杂 | 单元测试 + 保留受控 HTML |
| 图片上传失败 | CORS、格式、大小限制 | 降级为远程 URL |
| Cookie 跨源不可用 | 扩展 API 请求未登录 | 使用 token Header |
| MV3 Service Worker 重启 | 内存状态丢失 | 使用 chrome.storage |
| 动态页面内容变化 | 采集时机不准 | 等待 DOM 稳定 |
| 页面超大 | 保存慢或超数据库限制 | 设置大小上限 |

## 产品风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 功能范围过大 | PDF / Gmail / AI 延期 | 分阶段交付 |
| 重复草稿 | 用户多次点击生成多篇 | checksum 查重 |
| 分类过多 | 列表难管理 | 默认分类 + 最近使用 |
| 封面质量差 | 影响画廊效果 | 允许无封面，用占位图 |
| 来源信息缺失 | 展示不完整 | 从 URL 推导域名和图标 |

## 安全风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| XSS | 原网页恶意 HTML 入库 | DOM allowlist + 服务端校验 |
| Token 泄漏 | 扩展存储被攻击 | 有效期、HTTPS、退出失效 |
| 越权写入 | API 被滥用 | 保持登录认证和 rate limit |
| 隐私问题 | 内网页面被保存 | 只在用户明确点击后采集 |
| 敏感图片上传 | 泄露内网资源 | 正文图片上传默认关闭 |

## 法律与发布风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 复用官方扩展素材 | 可能侵权 | 公开发布前替换素材 |
| 复用官方 bundle 代码 | 可能侵权且难维护 | 自有实现为主 |
| 抓取受限内容 | 站点条款限制 | 用户手动剪藏，不做批量抓取 |

---

## 11. 最小闭环验收标准

第一阶段完成时，必须满足：

1. Chrome 可以加载当前目录构建出的扩展。
2. 用户可以输入 PageHush 访问码。
3. 登录成功后可以获取分类 `学习`。
4. 在普通文章页可以点击“剪藏”。
5. 扩展能生成 Markdown。
6. PageHush 出现一篇草稿。
7. 草稿分类为所选 topic。
8. 文章详情包含原文链接和来源站点。
9. 无封面时 PageHush 显示默认占位图。
10. 打开草稿后可以继续编辑。
11. 保存失败时显示明确错误。
12. 不请求任何印象笔记接口。

---

## 12. 建议执行顺序

```text
1. 文档基线
2. PageHush 扩展认证
3. 扩展骨架
4. topics 获取
5. 页面 metadata 采集
6. 正文采集
7. HTML → Markdown
8. 创建文章
9. 来源字段展示
10. 默认封面占位图
11. 选区剪藏
12. 截图剪藏
13. 图片上传
14. 查重
15. PDF / Gmail / 高级功能
```
