-- 企业知识库系统初始化脚本
-- 执行前提：已创建数据库 knowledge_base 和用户 kb_user

-- 运行 alembic 迁移后执行此脚本

-- 插入系统内置角色
INSERT IGNORE INTO roles (name, description, is_system, created_at) VALUES
  ('super_admin', '超级管理员', 1, NOW()),
  ('dept_admin', '部门管理员', 1, NOW()),
  ('member', '普通成员', 1, NOW());

-- 插入默认管理员账号（密码：Admin@123456）
INSERT IGNORE INTO users
  (username, real_name, email, password_hash, status, auth_source, created_at)
VALUES
  ('admin', '系统管理员', 'admin@company.com', '$2b$12$g0bYt9jvxtp8pw.jPVJQb.l3op3L4aP1i5L/WhKfXPQGW9j8gMYhu', 1, 'local', NOW());

-- 给管理员分配 super_admin 角色
INSERT IGNORE INTO user_roles (user_id, role_id)
  SELECT u.id, r.id
  FROM users u, roles r
  WHERE u.username = 'admin' AND r.name = 'super_admin';
