# 企业知识库系统 — 安装指南

## 前置要求

- Ubuntu 22.04 LTS
- MySQL 8.0（宿主机安装）
- Milvus 2.4（宿主机安装，Phase 3 启用）
- MinIO（宿主机安装，Phase 2 启用）
- Docker + Docker Compose
- Node.js 20（仅开发环境需要）

## 快速安装步骤

### 1. 安装 MySQL 并创建数据库

```sql
CREATE DATABASE knowledge_base CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kb_user'@'%' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON knowledge_base.* TO 'kb_user'@'%';
FLUSH PRIVILEGES;
```

### 2. 配置环境变量

```bash
cd deploy
cp .env.example .env
# 编辑 .env，填入 MySQL 连接信息、SECRET_KEY 等
```

### 3. 运行数据库迁移

```bash
cd backend
pip install uv && uv pip install --system -e .
alembic upgrade head
```

### 4. 初始化基础数据

```bash
mysql -u kb_user -p knowledge_base < deploy/init.sql
```

### 5. 启动应用

```bash
cd deploy
docker compose up -d --build
```

### 6. 访问系统

浏览器打开 http://YOUR_SERVER_IP

默认管理员账号：admin / Admin@123456

**安装完成后请立即修改默认密码！**

## Phase 2：文档处理服务

### 1. 安装并启动 MinIO

```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
  ./minio server /data/minio --console-address ":9001" &
```

### 2. 安装并启动 Milvus（standalone）

```bash
curl -sfL https://raw.githubusercontent.com/milvus-io/milvus/master/scripts/standalone_embed.sh -o install_milvus.sh
bash install_milvus.sh start
```

### 3. 首次下载 BGE-M3 模型（需联网，约 2GB）

```bash
cd backend
python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3')"
```

### 4. 更新容器并启动 Celery

```bash
cd deploy
docker compose up -d --build backend celery_worker celery_beat
```

### 5. 配置监控目录

登录系统管理后台 → 系统设置 → 监控目录 → 新增目录，填入挂载路径（如 `/mnt/nas`）。
