-- ============================================================
-- 企业知识库系统 — 全量初始化脚本（全新安装）
-- 覆盖 Alembic v1~v11 全部迁移版本
-- 执行前提：已创建数据库并切换到该库
--   CREATE DATABASE knowledge_base CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE knowledge_base;
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 删除所有旧表（反向依赖顺序）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS file_shares;
DROP TABLE IF EXISTS file_access_logs;
DROP TABLE IF EXISTS file_comments;
DROP TABLE IF EXISTS file_favorites;
DROP TABLE IF EXISTS file_likes;
DROP TABLE IF EXISTS kb_permissions;
DROP TABLE IF EXISTS file_permissions;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS query_logs;
DROP TABLE IF EXISTS crawl_jobs;
DROP TABLE IF EXISTS approvals;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS kb_folders;
DROP TABLE IF EXISTS knowledge_bases;
DROP TABLE IF EXISTS folders;
DROP TABLE IF EXISTS watch_directories;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS user_departments;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS alembic_version;

-- ============================================================
-- 建表（按依赖顺序）
-- ============================================================

-- ------------------------------------------------------------
-- 用户 / 角色 / 部门（v1 + v8 字段合并）
-- ------------------------------------------------------------
CREATE TABLE users (
    id            INT            NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)    NOT NULL,
    real_name     VARCHAR(100)   NOT NULL,
    email         VARCHAR(255)   NOT NULL,
    password_hash VARCHAR(255)   NOT NULL,
    avatar        VARCHAR(500)   NULL,
    status        TINYINT(1)     NOT NULL,
    auth_source   ENUM('local','ldap') NOT NULL,
    last_login_at DATETIME       NULL,
    created_at    DATETIME       NOT NULL,
    gender        VARCHAR(10)    NULL,
    phone         VARCHAR(20)    NULL,
    is_frozen     TINYINT(1)     NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roles (
    id          INT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(50)  NOT NULL,
    description VARCHAR(255) NOT NULL,
    is_system   TINYINT(1)   NOT NULL,
    created_at  DATETIME     NOT NULL,
    code        VARCHAR(50)  NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_name (name),
    UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE departments (
    id              INT          NOT NULL AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,
    parent_id       INT          NULL,
    manager_user_id INT          NULL,
    created_at      DATETIME     NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_departments_parent   FOREIGN KEY (parent_id)       REFERENCES departments (id),
    CONSTRAINT fk_departments_manager  FOREIGN KEY (manager_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_departments (
    user_id    INT        NOT NULL,
    dept_id    INT        NOT NULL,
    is_primary TINYINT(1) NOT NULL,
    PRIMARY KEY (user_id, dept_id),
    CONSTRAINT fk_ud_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_ud_dept FOREIGN KEY (dept_id) REFERENCES departments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 监控目录（v2 + v5 字段合并）
-- ------------------------------------------------------------
CREATE TABLE watch_directories (
    id               INT          NOT NULL AUTO_INCREMENT,
    name             VARCHAR(100) NOT NULL,
    fs_path          VARCHAR(500) NOT NULL,
    description      VARCHAR(255) NOT NULL DEFAULT '',
    is_active        TINYINT(1)   NOT NULL DEFAULT 1,
    last_scan_at     DATETIME     NULL,
    created_by       INT          NULL,
    created_at       DATETIME     NOT NULL,
    require_approval TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_watch_directories_fs_path (fs_path),
    CONSTRAINT fk_wd_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 知识库 / 知识库文件夹（v9，需先于 files 创建）
-- ------------------------------------------------------------
CREATE TABLE knowledge_bases (
    id                 INT          NOT NULL AUTO_INCREMENT,
    name               VARCHAR(100) NOT NULL,
    icon               VARCHAR(500) NULL,
    description        TEXT         NULL,
    is_default_visible TINYINT(1)   NOT NULL DEFAULT 1,
    created_by         INT          NOT NULL,
    created_at         DATETIME     NOT NULL,
    updated_at         DATETIME     NOT NULL,
    is_deleted         TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT fk_kb_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE kb_folders (
    id         INT          NOT NULL AUTO_INCREMENT,
    kb_id      INT          NOT NULL,
    parent_id  INT          NULL,
    name       VARCHAR(255) NOT NULL,
    created_by INT          NOT NULL,
    created_at DATETIME     NOT NULL,
    is_deleted TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT fk_kb_folders_kb     FOREIGN KEY (kb_id)      REFERENCES knowledge_bases (id),
    CONSTRAINT fk_kb_folders_parent FOREIGN KEY (parent_id)  REFERENCES kb_folders (id),
    CONSTRAINT fk_kb_folders_user   FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 文件系统目录树（v2）
-- ------------------------------------------------------------
CREATE TABLE folders (
    id           INT          NOT NULL AUTO_INCREMENT,
    name         VARCHAR(255) NOT NULL,
    parent_id    INT          NULL,
    fs_path      VARCHAR(500) NOT NULL,
    watch_dir_id INT          NULL,
    created_at   DATETIME     NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_folders_parent    FOREIGN KEY (parent_id)    REFERENCES folders (id),
    CONSTRAINT fk_folders_watch_dir FOREIGN KEY (watch_dir_id) REFERENCES watch_directories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 文件（v2 + v9 字段合并）
-- ------------------------------------------------------------
CREATE TABLE files (
    id               INT          NOT NULL AUTO_INCREMENT,
    name             VARCHAR(255) NOT NULL,
    folder_id        INT          NULL,
    fs_path          VARCHAR(500) NOT NULL,
    file_hash        VARCHAR(64)  NULL,
    file_type        VARCHAR(50)  NOT NULL,
    file_size        BIGINT       NOT NULL DEFAULT 0,
    process_status   ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
    process_error    TEXT         NULL,
    chunk_count      INT          NOT NULL DEFAULT 0,
    last_modified_at DATETIME     NULL,
    created_at       DATETIME     NOT NULL,
    kb_id            INT          NULL,
    kb_folder_id     INT          NULL,
    uploaded_by      INT          NULL,
    is_manual_upload TINYINT(1)   NOT NULL DEFAULT 1,
    mime_type        VARCHAR(100) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_files_fs_path (fs_path),
    CONSTRAINT fk_files_folder      FOREIGN KEY (folder_id)    REFERENCES folders (id),
    CONSTRAINT fk_files_kb_id       FOREIGN KEY (kb_id)        REFERENCES knowledge_bases (id),
    CONSTRAINT fk_files_kb_folder   FOREIGN KEY (kb_folder_id) REFERENCES kb_folders (id),
    CONSTRAINT fk_files_uploaded_by FOREIGN KEY (uploaded_by)  REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 权限（v3 + v4 索引）
-- ------------------------------------------------------------
CREATE TABLE permissions (
    id               INT      NOT NULL AUTO_INCREMENT,
    resource_type    ENUM('folder','file')                    NOT NULL,
    resource_id      INT      NOT NULL,
    subject_type     ENUM('user','department','role')         NOT NULL,
    subject_id       INT      NOT NULL,
    permission_level ENUM('view','download','edit','manage')  NOT NULL,
    created_by       INT      NULL,
    created_at       DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_permission_resource_subject (resource_type, resource_id, subject_type, subject_id),
    KEY ix_permissions_resource (resource_type, resource_id),
    KEY ix_permissions_subject  (subject_type,  subject_id),
    CONSTRAINT fk_permissions_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 对话 / 消息（v4）
-- ------------------------------------------------------------
CREATE TABLE conversations (
    id         INT          NOT NULL AUTO_INCREMENT,
    user_id    INT          NOT NULL,
    title      VARCHAR(255) NULL,
    created_at DATETIME     NOT NULL,
    PRIMARY KEY (id),
    KEY ix_conversations_user_id (user_id),
    CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
    id              INT      NOT NULL AUTO_INCREMENT,
    conversation_id INT      NOT NULL,
    role            VARCHAR(20) NOT NULL,
    content         TEXT     NOT NULL,
    sources_json    TEXT     NULL,
    response_ms     INT      NULL,
    created_at      DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_messages_conversation_id (conversation_id),
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 审批流（v5）
-- ------------------------------------------------------------
CREATE TABLE approvals (
    id             INT      NOT NULL AUTO_INCREMENT,
    file_id        INT      NOT NULL,
    status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    requester_note TEXT     NULL,
    reviewer_id    INT      NULL,
    reviewer_note  TEXT     NULL,
    created_at     DATETIME NOT NULL,
    reviewed_at    DATETIME NULL,
    PRIMARY KEY (id),
    KEY ix_approvals_status  (status),
    KEY ix_approvals_file_id (file_id),
    CONSTRAINT fk_approvals_file     FOREIGN KEY (file_id)     REFERENCES files (id),
    CONSTRAINT fk_approvals_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 爬取任务 / 查询日志 / API 密钥（v6）
-- ------------------------------------------------------------
CREATE TABLE crawl_jobs (
    id          INT           NOT NULL AUTO_INCREMENT,
    url         VARCHAR(2048) NOT NULL,
    title       VARCHAR(500)  NULL,
    status      ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
    error       TEXT          NULL,
    chunk_count INT           NOT NULL DEFAULT 0,
    created_by  INT           NULL,
    created_at  DATETIME      NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_crawl_jobs_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE query_logs (
    id              INT      NOT NULL AUTO_INCREMENT,
    user_id         INT      NULL,
    conversation_id INT      NULL,
    query_text      TEXT     NOT NULL,
    answer_text     TEXT     NOT NULL,
    sources_json    TEXT     NULL,
    response_ms     INT      NULL,
    created_at      DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_query_logs_user_id    (user_id),
    KEY ix_query_logs_created_at (created_at),
    CONSTRAINT fk_query_logs_user         FOREIGN KEY (user_id)         REFERENCES users (id),
    CONSTRAINT fk_query_logs_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE api_keys (
    id           INT          NOT NULL AUTO_INCREMENT,
    name         VARCHAR(100) NOT NULL,
    `key`        VARCHAR(64)  NOT NULL,
    owner_id     INT          NOT NULL,
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    created_at   DATETIME     NOT NULL,
    last_used_at DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_api_keys_key (`key`),
    CONSTRAINT fk_api_keys_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 社交功能（v10）
-- ------------------------------------------------------------
CREATE TABLE file_likes (
    id         INT      NOT NULL AUTO_INCREMENT,
    file_id    INT      NOT NULL,
    user_id    INT      NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_file_likes_file_user (file_id, user_id),
    CONSTRAINT fk_file_likes_file FOREIGN KEY (file_id) REFERENCES files (id),
    CONSTRAINT fk_file_likes_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE file_favorites (
    id         INT      NOT NULL AUTO_INCREMENT,
    file_id    INT      NOT NULL,
    user_id    INT      NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_file_favorites_file_user (file_id, user_id),
    CONSTRAINT fk_file_favorites_file FOREIGN KEY (file_id) REFERENCES files (id),
    CONSTRAINT fk_file_favorites_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE file_comments (
    id         INT        NOT NULL AUTO_INCREMENT,
    file_id    INT        NOT NULL,
    user_id    INT        NOT NULL,
    parent_id  INT        NULL,
    content    TEXT       NOT NULL,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME   NOT NULL,
    updated_at DATETIME   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_file_comments_file   FOREIGN KEY (file_id)   REFERENCES files (id),
    CONSTRAINT fk_file_comments_user   FOREIGN KEY (user_id)   REFERENCES users (id),
    CONSTRAINT fk_file_comments_parent FOREIGN KEY (parent_id) REFERENCES file_comments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE file_access_logs (
    id          INT      NOT NULL AUTO_INCREMENT,
    file_id     INT      NOT NULL,
    user_id     INT      NOT NULL,
    accessed_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_file_access_logs_user_file (user_id, file_id),
    CONSTRAINT fk_file_access_logs_file FOREIGN KEY (file_id) REFERENCES files (id),
    CONSTRAINT fk_file_access_logs_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE file_shares (
    id          INT         NOT NULL AUTO_INCREMENT,
    file_id     INT         NOT NULL,
    shared_by   INT         NOT NULL,
    share_token VARCHAR(64) NOT NULL,
    expires_at  DATETIME    NULL,
    is_active   TINYINT(1)  NOT NULL DEFAULT 1,
    created_at  DATETIME    NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_file_shares_token (share_token),
    CONSTRAINT fk_file_shares_file      FOREIGN KEY (file_id)   REFERENCES files (id),
    CONSTRAINT fk_file_shares_shared_by FOREIGN KEY (shared_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 知识库权限 / 文件权限 / 系统设置（v11）
-- ------------------------------------------------------------
CREATE TABLE kb_permissions (
    id           INT         NOT NULL AUTO_INCREMENT,
    kb_id        INT         NOT NULL,
    subject_type VARCHAR(10) NOT NULL,
    subject_id   INT         NOT NULL,
    permission   VARCHAR(20) NOT NULL DEFAULT 'read',
    created_at   DATETIME    NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_kb_perm_subject (kb_id, subject_type, subject_id),
    CONSTRAINT fk_kb_permissions_kb FOREIGN KEY (kb_id) REFERENCES knowledge_bases (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE file_permissions (
    id           INT         NOT NULL AUTO_INCREMENT,
    file_id      INT         NOT NULL,
    subject_type VARCHAR(10) NOT NULL,
    subject_id   INT         NOT NULL,
    permission   VARCHAR(20) NOT NULL DEFAULT 'read',
    created_at   DATETIME    NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_file_perm_subject (file_id, subject_type, subject_id),
    CONSTRAINT fk_file_permissions_file FOREIGN KEY (file_id) REFERENCES files (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_settings (
    id          INT           NOT NULL AUTO_INCREMENT,
    `key`       VARCHAR(100)  NOT NULL,
    value       VARCHAR(2000) NULL,
    description VARCHAR(255)  NULL,
    updated_at  DATETIME      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_system_settings_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Alembic 版本记录（标记所有 v1~v11 迁移已执行）
-- ------------------------------------------------------------
CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL,
    PRIMARY KEY (version_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO alembic_version (version_num) VALUES ('d4e5f6a7b8c9');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 初始化数据
-- ============================================================

-- 系统内置角色
INSERT INTO roles (name, description, is_system, code, created_at) VALUES
  ('super_admin', '超级管理员', 1, 'super_admin', NOW()),
  ('dept_admin',  '部门管理员', 1, 'dept_admin',  NOW()),
  ('member',      '普通成员',   1, 'member',      NOW());

-- 默认管理员账号（密码：Admin@123456）
INSERT INTO users (username, real_name, email, password_hash, status, auth_source, is_frozen, created_at) VALUES
  ('admin', '系统管理员', 'admin@company.com',
   '$2b$12$g0bYt9jvxtp8pw.jPVJQb.l3op3L4aP1i5L/WhKfXPQGW9j8gMYhu',
   1, 'local', 0, NOW());

-- 给管理员分配 super_admin 角色
INSERT INTO user_roles (user_id, role_id)
  SELECT u.id, r.id FROM users u, roles r
  WHERE u.username = 'admin' AND r.name = 'super_admin';

-- 系统默认设置
INSERT INTO system_settings (`key`, value, description, updated_at) VALUES
  ('site_name',          '企业知识库', '站点名称',               NOW()),
  ('captcha_enabled',    'true',       '是否启用登录验证码',      NOW()),
  ('max_upload_size_mb', '500',        '单文件最大上传大小（MB）', NOW()),
  ('allow_register',     'false',      '是否允许自行注册',        NOW());
