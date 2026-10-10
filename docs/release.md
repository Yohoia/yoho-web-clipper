# 发布 Chrome 扩展发行包

项目使用 GitHub Actions 自动生成发行包。只要推送一个 `v` 开头的标签，例如 `v0.5.4`，GitHub 就会自动创建 Release，并上传：

- `shiye-chrome-extension.zip`：只包含扩展运行所需文件
- `shiye-chrome-extension.zip.sha256`：压缩包校验文件

## 发布新版本

1. 更新 `manifest.json` 中的 `version`，例如 `0.5.5`。
2. 提交并推送代码到 `main`。
3. 创建完全一致的标签：

   ```bash
   git tag v0.5.5
   git push origin v0.5.5
   ```

4. GitHub Actions 会校验标签与 `manifest.json` 版本一致，打包并创建 Release。
5. 进入仓库的 Releases 页面，确认附件上传成功。

## 固定下载地址

每次 Release 都使用同一个附件名，因此最新版下载地址保持不变：

```text
https://github.com/Yohoia/yoho-web-clipper/releases/latest/download/shiye-chrome-extension.zip
```

指定版本的下载地址格式为：

```text
https://github.com/Yohoia/yoho-web-clipper/releases/download/v0.5.4/shiye-chrome-extension.zip
```

## 手动兜底

如果自动发布失败，可以在本地打包并上传：

```bash
STAGE=dist/shiye-chrome-extension
mkdir -p "$STAGE"
cp -R manifest.json icons popup options src "$STAGE/"
find dist -name .DS_Store -delete
(cd dist && zip -r ../shiye-chrome-extension.zip shiye-chrome-extension)
shasum -a 256 shiye-chrome-extension.zip > shiye-chrome-extension.zip.sha256

gh release create v0.5.4 \
  shiye-chrome-extension.zip \
  shiye-chrome-extension.zip.sha256 \
  --title "拾页 v0.5.4" \
  --notes "Chrome MV3 网页剪藏扩展。"
```

手动兜底前仍需确认 `manifest.json` 的版本与标签一致。
