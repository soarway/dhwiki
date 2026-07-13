-- MySQL 首次初始化脚本
-- 由 docker-entrypoint-initdb.d 自动执行（仅在数据卷为空时运行一次）
-- 数据库和用户已由 MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD 环境变量自动创建
-- 此处只需补充 GRANT 和字符集设置

-- 确保 kb_user 拥有完整权限（任意 host 连接）
GRANT ALL PRIVILEGES ON knowledge_base.* TO 'kb_user'@'%';
FLUSH PRIVILEGES;

-- 确保数据库字符集正确（MySQL 8.0 默认已是 utf8mb4，此处明确一次）
ALTER DATABASE knowledge_base CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
