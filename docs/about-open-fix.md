# 关于拾页打开入口修复

> 0.5.3 的历史修复记录。用户随后要求在原面板内查看关于，0.5.4 已改为内容切换，不再使用后台打开新页，见 [面板内关于页](about-inline-design.md)。

2026-10-10 · 0.5.3

用户报告点击关于图标后看到「关于拾页暂时无法打开，请重试」。该提示来自 popup 关于按钮的 catch，原来调用 chrome.runtime.openOptionsPage；它不能区分清单未重新加载、浏览器入口不可用等底层原因。新加载的隔离扩展能打开原入口，尚未直接取得用户浏览器的原始异常，因此不将某一种原因认定为已证实。

改为 popup 通过已有受信任消息通道发送 openAbout，由后台调用 tabs.create 打开 runtime.getURL('options/settings.html')，解除按钮与原生设置页入口/已加载 options_ui 的依赖。仍保留 manifest.options_ui，供浏览器扩展详情入口使用。不增加权限，后台固定地址，不接受传入的 URL，也不扩大消息来源白名单。

保留点击前的剪藏输入保存，重新点击清除旧错误，打开失败仍明确提示；浏览器预览同步通过同一后台分支映射到 /about-preview。页面设计未修改，版本自动读取 0.5.3。

回归在临时 Chromium 中加载实际扩展，在独立普通网页注入真实 iframe 后点击关于按钮。仅在平台边界模拟原生 openOptionsPage 拒绝和首次 tabs.create 失败，验证错误可见、标签输入保留、再次点击成功打开真实扩展关于页、版本正确及旧错误清除。独立来源标签页防止关于场景的焦点变化影响其他保存场景；保存后的继续操作等待表单解锁和工作台可见状态。

最终连续三次项目检查记录：evidence/about-open-check-1.log、about-open-check-2.log、about-open-check-3.log。每次覆盖原有 11 个模拟草稿流程，无线上文章写入。evidence/about-open-reproduce.log 是早期诊断记录，原入口能打开，但随后保存场景发生等待超时，不作为完整通过证据。最终页截图 evidence/about-open-final/page.png。

用户已有浏览器实例需在 chrome://extensions 重新加载拾页，再刷新原网页，才能载入新后台与面板代码。未代用户重载实际浏览器中的扩展，以免丢失当前会话登录和未保存状态。
