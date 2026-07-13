# 知识库管理系统 - 部署指南

## 📋 目录结构

```
knowledge-base-app/
├── src/                    # 源代码
│   ├── app/               # React组件
│   ├── styles/            # 样式文件
│   └── imports/           # 静态资源
├── package.json           # 项目依赖
├── vite.config.ts         # Vite配置
├── Dockerfile             # Docker镜像配置
├── nginx.conf             # Nginx配置
└── docker-compose.yml     # Docker编排
```

## 🚀 快速部署

### 方式1：传统部署（Nginx）

```bash
# 1. 安装依赖
pnpm install

# 2. 构建生产版本
pnpm build

# 3. 将 dist/ 目录复制到服务器
scp -r dist/* user@server:/var/www/knowledge-base/

# 4. 配置Nginx（参考 nginx.conf）
sudo systemctl restart nginx
```

### 方式2：Docker部署（推荐）

```bash
# 1. 构建镜像
docker build -t knowledge-base-app .

# 2. 运行容器
docker run -d -p 8080:80 --name knowledge-base knowledge-base-app

# 或使用 docker-compose
docker-compose up -d
```

## ⚙️ 环境配置

### API接口配置

在代码中修改API基础地址：

```typescript
// 开发环境
const API_BASE_URL = 'http://192.168.30.197:8080';

// 生产环境
const API_BASE_URL = 'https://api.yourdomain.com';
```

### 环境变量（可选）

创建 `.env.production` 文件：

```env
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_APP_TITLE=知识库管理系统
```

## 🔧 后端CORS配置

后端需要允许跨域请求：

**Spring Boot 示例：**
```java
@Configuration
public class CorsConfig {
    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                    .allowedOrigins("http://your-domain.com")
                    .allowedMethods("GET", "POST", "PUT", "DELETE")
                    .allowedHeaders("*")
                    .allowCredentials(true);
            }
        };
    }
}
```

**Node.js/Express 示例：**
```javascript
const cors = require('cors');
app.use(cors({
  origin: 'http://your-domain.com',
  credentials: true
}));
```

## 📊 性能优化

### 1. 启用Gzip压缩
已在 `nginx.conf` 中配置

### 2. 静态资源缓存
已配置1年缓存策略

### 3. CDN加速（可选）
将 `dist/assets/` 上传到CDN

## 🔐 安全配置

### 1. HTTPS配置

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # ... 其他配置
}
```

### 2. 安全响应头

```nginx
add_header X-Frame-Options "SAMEORIGIN";
add_header X-Content-Type-Options "nosniff";
add_header X-XSS-Protection "1; mode=block";
```

## 📝 验证部署

部署完成后访问：
- 前端：http://your-domain.com
- 健康检查：http://your-domain.com/

## 🐛 常见问题

### 1. 页面刷新404
确保配置了SPA路由重写（try_files）

### 2. API跨域错误
检查后端CORS配置和Nginx代理配置

### 3. 静态资源404
检查nginx root路径是否正确

## 📞 技术支持

如有问题，请联系开发团队。
