# 跑酷制作教程网站 - GitHub Pages 部署说明

本网站是纯静态站点（HTML + CSS + JS + JSON 数据 + 图片），无需构建、无需后端服务，可以直接部署到 GitHub Pages。

## 目录结构

```
site/
├── index.html          # 入口页面
├── .nojekyll           # 禁用 Jekyll 处理（避免忽略特殊文件）
├── assets/
│   ├── app.js           # 前端逻辑
│   ├── style.css        # 样式
│   └── img/             # 所有配图（按指南/文档分文件夹）
└── data/
    ├── manifest.json     # 指南与文档的映射配置（新增/替换文档从这里改）
    ├── shuoming.json
    ├── guanka.json
    ├── shangyehua.json
    ├── ui.json
    └── mailiang.json
```

## 方式一：直接手动推送（最简单，推荐新手）

1. 在 GitHub 上新建一个仓库，例如 `parkour-tutorial-site`（公开仓库，Public）。
2. 把本目录（`site/` 下的所有文件，包括隐藏文件 `.nojekyll`）解压后放到你本地一个空文件夹里。
3. 在该文件夹内执行：

```bash
git init
git add -A
git commit -m "init: 跑酷制作教程网站"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

4. 打开仓库页面 → **Settings** → 左侧菜单 **Pages**。
5. 在 "Build and deployment" 中：
   - Source 选择 **Deploy from a branch**
   - Branch 选择 `main`，目录选择 `/ (root)`
   - 点击 **Save**
6. 等待 1-2 分钟，页面顶部会出现访问地址，形如：
   `https://<你的用户名>.github.io/<仓库名>/`
7. 打开该地址即可访问网站（因为所有资源都用相对路径引用，无论部署在根域名还是子路径下都能正常显示）。

## 方式二：使用 GitHub Actions 自动部署（适合后续频繁更新文档）

1. 同方式一第 1-3 步，先把代码推送到仓库的 `main` 分支。
2. 在仓库根目录新建 `.github/workflows/deploy.yml`，内容如下：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v4
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

3. 提交并推送这个文件：

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: 添加 GitHub Pages 自动部署"
git push
```

4. 打开仓库 **Settings → Pages**，Source 选择 **GitHub Actions**（而不是 Deploy from a branch）。
5. 之后每次 `git push` 到 `main` 分支，网站都会自动重新构建发布，无需手动操作。

## 后续如何更新/替换文档内容

网站内容与代码完全解耦，只需要：

1. 把新文档转换为 JSON（结构参考 `data/*.json` 中已有文件的 `blocks` 数组格式：`heading` / `para` / `image` / `table`）。
2. 把新文档对应的配图放进 `assets/img/<guide>/<doc>/` 目录下。
3. 在 `data/manifest.json` 中新增或修改一条 `docs` 记录，指向新的 JSON 文件和图片目录。
4. `git add -A && git commit -m "update: 替换文档" && git push`，几分钟后网站自动更新（若用方式二自动部署）或需要等 GitHub Pages 缓存刷新（若用方式一，也是自动的，通常1-2分钟）。

无需修改任何 HTML/CSS/JS 代码。

## 常见问题

- **图片/样式不显示（404）**：检查 `manifest.json` 里的路径大小写是否和实际文件夹/文件名完全一致，GitHub Pages 服务器区分大小写（Linux 环境），与本地 Windows/Mac 不同。
- **打开后白屏**：一般是浏览器缓存或 Pages 还在构建中，等 1-2 分钟刷新，或强制刷新（Ctrl+Shift+R）。
- **想用自定义域名**：在仓库根目录新增 `CNAME` 文件，写入你的域名（如 `tutorial.example.com`），并在你的域名 DNS 服务商处添加 CNAME 记录指向 `<你的用户名>.github.io`。
