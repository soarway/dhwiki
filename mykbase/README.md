# 知识库管理系统

基于 React + Vite + TypeScript 开发的现代化知识库管理系统，采用苹果官网设计风格。

## ✨ 功能特性

- 📚 知识库管理：创建、查看、编辑知识库
- 🔍 智能搜索：按文件名、上传人筛选
- 👥 用户管理：个人信息、权限管理
- 🎨 现代UI：苹果风格设计，优雅流畅
- 📱 响应式：支持桌面端浏览

## 🛠️ 技术栈

- **框架**: React 18.3.1
- **构建工具**: Vite 6.3.5
- **样式**: Tailwind CSS 4.1.12
- **UI组件**: Radix UI
- **图标**: Lucide React
- **状态管理**: React Hooks
- **类型检查**: TypeScript

## 📦 快速开始

### 安装依赖

```bash
pnpm install
# 或
npm install
```

### 开发模式

```bash
pnpm dev
# 访问 http://localhost:5173
```

### 生产构建

```bash
pnpm build
# 构建产物在 dist/ 目录
```

## 📂 项目结构

```
src/
├── app/
│   ├── App.tsx                    # 主应用组件
│   └── components/
│       ├── Sidebar.tsx            # 侧边栏（含折叠功能）
│       ├── KnowledgeBaseCard.tsx  # 知识库卡片
│       └── ui/                    # UI组件库
├── styles/
│   ├── theme.css                  # 主题配置
│   └── fonts.css                  # 字体配置
└── imports/                       # 静态资源
```

## 🎨 设计特色

- **配色方案**: 
  - 主色：#0071e3（苹果蓝）
  - 强调色：#ff6b35（橙色）
  - 背景：#f5f5f7
  
- **交互设计**:
  - 侧边栏可折叠
  - 卡片悬停动效
  - 下拉菜单
  - 平滑过渡动画

## 🚀 部署

详细部署指南请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

### Docker快速部署

```bash
docker-compose up -d
```

### 传统部署

```bash
pnpm build
# 将 dist/ 部署到Nginx/Apache
```

## 🔧 配置

### API接口

修改 `.env.production`:

```env
VITE_API_BASE_URL=https://api.yourdomain.com
```

### 后端CORS

确保后端允许跨域请求，详见 [DEPLOYMENT.md](./DEPLOYMENT.md)

## 📝 开发说明

### 添加新页面

1. 在 `src/app/components/` 创建组件
2. 在 `App.tsx` 中引入并路由

### API调用

使用 `fetch` 或安装 `axios`:

```typescript
const response = await fetch(`${API_BASE_URL}/api/knowledge-bases`);
const data = await response.json();
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👨‍💻 开发团队

由 Claude Code 协助开发
