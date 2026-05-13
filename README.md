# 投研日报站点

这个仓库把本地按日期保存的 `盘前分析.md`、`盘中分析.md`、`盘后复盘.md` 构建成静态网站，并通过 GitHub Pages 对外访问。

## 本地构建

```bash
npm run build
```

构建产物会生成到 `dist/`。

## 发布

```bash
./scripts/publish-site.sh
```

脚本会构建站点、提交新增报告，并推送到 GitHub。GitHub Actions 会自动部署 Pages。

