#!/bin/bash
# ============================================================
# 企业AI知识库系统 — 一键安装脚本
# 使用方法：cd knowledge-base && bash deploy/install.sh
# ============================================================
set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── 全局变量 ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
LOG_FILE="${SCRIPT_DIR}/install.log"

# ── 工具函数 ──────────────────────────────────────────────
info()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; }
title()   { echo -e "\n${CYAN}${BOLD}── $* ──────────────────────────────────${NC}"; }
log()     { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "${LOG_FILE}"; }

# 提示输入，支持默认值
prompt() {
    local var_name="$1"
    local prompt_text="$2"
    local default_val="${3:-}"
    local secret="${4:-no}"

    if [[ -n "$default_val" ]]; then
        echo -ne "${BLUE}?${NC} ${prompt_text} [${YELLOW}${default_val}${NC}]: "
    else
        echo -ne "${BLUE}?${NC} ${prompt_text}: "
    fi

    if [[ "$secret" == "yes" ]]; then
        read -rs input
        echo
    else
        read -r input
    fi

    if [[ -z "$input" && -n "$default_val" ]]; then
        input="$default_val"
    fi
    printf -v "$var_name" '%s' "$input"
}

# 生成随机密钥
gen_secret() {
    openssl rand -hex "${1:-32}" 2>/dev/null \
        || cat /dev/urandom | tr -dc 'a-f0-9' | fold -w "${1:-64}" | head -n1
}

gen_password() {
    openssl rand -base64 18 2>/dev/null | tr -d '=/+' | head -c 20 \
        || cat /dev/urandom | tr -dc 'A-Za-z0-9' | fold -w 20 | head -n1
}

# ── Banner ─────────────────────────────────────────────────
banner() {
    echo -e "${CYAN}${BOLD}"
    echo "╔══════════════════════════════════════════════════╗"
    echo "║         企业AI知识库系统  —  一键安装            ║"
    echo "║                  v1.0.0                          ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "  安装日志: ${LOG_FILE}"
    echo
}

# ── 1. 前置检查 ────────────────────────────────────────────
check_prerequisites() {
    title "检查环境"

    # Docker
    if ! command -v docker &>/dev/null; then
        error "未找到 Docker，请先安装 Docker Engine"
        error "  Ubuntu: https://docs.docker.com/engine/install/ubuntu/"
        exit 1
    fi
    local docker_ver
    docker_ver=$(docker --version | grep -oP '\d+\.\d+' | head -1)
    info "Docker ${docker_ver}"

    # Docker Compose（v2 plugin 或 v1 独立版）
    if docker compose version &>/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        error "未找到 Docker Compose，请安装 Docker Compose v2"
        error "  Ubuntu: sudo apt-get install docker-compose-plugin"
        exit 1
    fi
    local compose_ver
    compose_ver=$($COMPOSE_CMD version --short 2>/dev/null || echo "v1")
    info "Docker Compose ${compose_ver}"

    # Docker daemon 是否运行
    if ! docker info &>/dev/null; then
        error "Docker daemon 未运行，请执行: sudo systemctl start docker"
        exit 1
    fi
    info "Docker daemon 运行中"

    # openssl（生成密钥）
    if ! command -v openssl &>/dev/null; then
        warn "未找到 openssl，将使用 /dev/urandom 生成密钥"
    fi

    # 内存检查（建议 ≥ 8GB）
    local mem_kb
    mem_kb=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
    local mem_gb=$(( mem_kb / 1024 / 1024 ))
    if [[ $mem_gb -lt 6 ]]; then
        warn "物理内存 ${mem_gb}GB，建议 ≥ 8GB（BGE 模型较大）"
    else
        info "内存 ${mem_gb}GB"
    fi

    # 磁盘检查（建议 ≥ 30GB）
    local disk_gb
    disk_gb=$(df -BG "${SCRIPT_DIR}" | awk 'NR==2{gsub("G","",$4); print $4}' || echo 0)
    if [[ $disk_gb -lt 20 ]]; then
        warn "可用磁盘 ${disk_gb}GB，建议 ≥ 30GB（含模型文件）"
    else
        info "可用磁盘 ${disk_gb}GB"
    fi
}

# ── 2. 交互式配置收集 ─────────────────────────────────────
collect_config() {
    title "配置收集"
    echo "  按 Enter 接受 [括号内] 的默认值"
    echo

    # 服务器 IP / 域名
    local default_ip
    default_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
    prompt SERVER_HOST "服务器 IP 或域名（浏览器访问地址）" "$default_ip"

    # 对外端口
    prompt HTTP_PORT "HTTP 对外端口" "80"

    # ── 目录配置 ──
    echo
    echo -e "${BOLD}  目录配置（宿主机路径，请确保磁盘空间充足）${NC}"

    prompt HOST_UPLOAD_DIR "文件上传存储目录" "/data/kb/uploads"
    prompt HOST_WATCH_DIR  "目录监控路径（如 NAS 挂载点）" "/data/kb/watch"
    prompt HOST_MODEL_DIR  "模型文件目录（存放 bge-m3 等模型）" "/data/kb/models"

    # 模型子目录名
    echo
    echo -e "${BOLD}  模型配置${NC}"
    echo "  目录 ${HOST_MODEL_DIR} 下应包含以下子目录："
    echo "    bge-m3           → Embedding 模型"
    echo "    bge-reranker-v2-m3 → Reranker 模型"
    echo "  （若路径不同请修改 .env 中的 EMBEDDING_MODEL / RERANKER_MODEL）"

    prompt EMBEDDING_SUBDIR "Embedding 模型子目录名" "bge-m3"
    prompt RERANKER_SUBDIR  "Reranker 模型子目录名"  "bge-reranker-v2-m3"

    # ── LLM 配置 ──
    echo
    echo -e "${BOLD}  LLM 配置${NC}"
    echo "  1) DeepSeek API"
    echo "  2) OpenAI API"
    echo "  3) 其他 OpenAI 兼容 API"
    echo "  4) 本地 Ollama"
    prompt LLM_CHOICE "请选择 LLM 方式（1-4）" "1"

    case "$LLM_CHOICE" in
        1)
            LLM_API_BASE="https://api.deepseek.com/v1"
            LLM_MODEL_DEFAULT="deepseek-chat"
            ;;
        2)
            LLM_API_BASE="https://api.openai.com/v1"
            LLM_MODEL_DEFAULT="gpt-4o-mini"
            ;;
        4)
            LLM_API_BASE="http://host.docker.internal:11434/v1"
            LLM_API_KEY_DEFAULT="ollama"
            LLM_MODEL_DEFAULT="qwen2.5:7b"
            ;;
        *)
            prompt LLM_API_BASE "LLM API Base URL" "https://api.example.com/v1"
            LLM_MODEL_DEFAULT="your-model"
            ;;
    esac

    if [[ "$LLM_CHOICE" != "4" ]]; then
        prompt LLM_API_KEY "LLM API Key" "" "yes"
    else
        LLM_API_KEY="${LLM_API_KEY_DEFAULT:-ollama}"
    fi
    prompt LLM_MODEL "LLM 模型名称" "${LLM_MODEL_DEFAULT:-}"

    # ── Vision（可选） ──
    echo
    echo -e "${BOLD}  Vision 多模态（可选，用于图片/图表分析，直接回车跳过）${NC}"
    prompt VISION_API_KEY "Vision API Key（留空跳过）" ""
    if [[ -n "$VISION_API_KEY" ]]; then
        prompt VISION_API_BASE "Vision API Base URL" "https://ark.volces.com/api/v3"
        prompt VISION_MODEL    "Vision 模型名称"     "doubao-seed-1.6"
    else
        VISION_API_BASE=""
        VISION_MODEL=""
    fi

    # ── 自动生成密钥 ──
    echo
    info "生成随机密钥和密码..."
    MYSQL_ROOT_PASSWORD=$(gen_password)
    MYSQL_PASSWORD=$(gen_password)
    SECRET_KEY=$(gen_secret 32)
    MEILI_MASTER_KEY=$(gen_secret 16)
    MINIO_ACCESS_KEY="kbminio$(gen_secret 4)"
    MINIO_SECRET_KEY=$(gen_password)
}

# ── 3. 写入 .env ──────────────────────────────────────────
write_env() {
    title "生成配置文件"

    # 若已存在则备份
    if [[ -f "$ENV_FILE" ]]; then
        local backup="${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
        cp "$ENV_FILE" "$backup"
        warn "已备份旧配置: ${backup}"
    fi

    cat > "$ENV_FILE" <<EOF
# ============================================================
# 企业AI知识库系统 — 运行时配置
# 由 install.sh 自动生成于 $(date '+%Y-%m-%d %H:%M:%S')
# ============================================================

# ── 服务器地址 ───────────────────────────────────────────
SERVER_HOST=${SERVER_HOST}
HTTP_PORT=${HTTP_PORT}

# ── MySQL ────────────────────────────────────────────────
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=kb_user
MYSQL_PASSWORD=${MYSQL_PASSWORD}
MYSQL_DATABASE=knowledge_base

# ── 安全密钥 ──────────────────────────────────────────────
SECRET_KEY=${SECRET_KEY}
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── Redis ─────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── MeiliSearch ───────────────────────────────────────────
MEILI_URL=http://meilisearch:7700
MEILI_MASTER_KEY=${MEILI_MASTER_KEY}

# ── Milvus ────────────────────────────────────────────────
MILVUS_HOST=milvus
MILVUS_PORT=19530
MILVUS_COLLECTION=document_chunks

# ── MinIO ─────────────────────────────────────────────────
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
MINIO_BUCKET=knowledge-base
MINIO_SECURE=false

# ── 宿主机目录（供 docker-compose 卷挂载） ─────────────────
HOST_UPLOAD_DIR=${HOST_UPLOAD_DIR}
HOST_WATCH_DIR=${HOST_WATCH_DIR}
HOST_MODEL_DIR=${HOST_MODEL_DIR}

# ── 容器内路径（后端应用读取） ──────────────────────────────
UPLOAD_DIR=/app/uploads
WATCH_DIR=/mnt/nas
WATCH_SCAN_INTERVAL_SECONDS=300

# ── Embedding / Reranker 模型 ─────────────────────────────
EMBEDDING_MODEL=/models/${EMBEDDING_SUBDIR}
RERANKER_MODEL=/models/${RERANKER_SUBDIR}
EMBEDDING_DEVICE=cpu
EMBEDDING_BATCH_SIZE=32

# ── LLM ──────────────────────────────────────────────────
LLM_API_BASE=${LLM_API_BASE}
LLM_API_KEY=${LLM_API_KEY}
LLM_MODEL=${LLM_MODEL}

# ── Vision ────────────────────────────────────────────────
VISION_API_BASE=${VISION_API_BASE}
VISION_API_KEY=${VISION_API_KEY}
VISION_MODEL=${VISION_MODEL}

# ── OCR ──────────────────────────────────────────────────
OCR_LANG=ch
OCR_USE_GPU=false

# ── RAG ──────────────────────────────────────────────────
RAG_RETRIEVE_TOP_K=5

# ── CORS ─────────────────────────────────────────────────
CORS_ORIGINS=*

# ── Celery ───────────────────────────────────────────────
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP=true
EOF

    # 限制 .env 权限（含密码，不允许 others 读取）
    chmod 600 "$ENV_FILE"
    info ".env 已生成: ${ENV_FILE}"
}

# ── 4. 创建宿主机目录 ─────────────────────────────────────
create_dirs() {
    title "创建目录"

    for d in "$HOST_UPLOAD_DIR" "$HOST_WATCH_DIR" "$HOST_MODEL_DIR"; do
        if [[ ! -d "$d" ]]; then
            mkdir -p "$d"
            info "创建: ${d}"
        else
            info "已存在: ${d}"
        fi
    done

    # 检查模型文件
    local emb_path="${HOST_MODEL_DIR}/${EMBEDDING_SUBDIR}"
    local rer_path="${HOST_MODEL_DIR}/${RERANKER_SUBDIR}"

    echo
    if [[ -d "$emb_path" ]]; then
        info "Embedding 模型: ${emb_path}"
    else
        warn "Embedding 模型目录不存在: ${emb_path}"
        warn "请在启动后将模型文件放置到该目录，或修改 .env 中的 EMBEDDING_MODEL"
        echo
        echo "  下载方式（需要科学上网或使用国内镜像）："
        echo "  pip install huggingface_hub"
        echo "  huggingface-cli download BAAI/bge-m3 --local-dir ${emb_path}"
        echo "  # 或使用 ModelScope："
        echo "  pip install modelscope"
        echo "  modelscope download --model BAAI/bge-m3 --local_dir ${emb_path}"
    fi

    if [[ -d "$rer_path" ]]; then
        info "Reranker 模型: ${rer_path}"
    else
        warn "Reranker 模型目录不存在: ${rer_path}"
        warn "请将模型文件放置到: ${rer_path}"
    fi
}

# ── 5. 启动服务 ────────────────────────────────────────────
start_services() {
    title "启动服务"

    cd "$SCRIPT_DIR"

    # 拉取基础镜像
    echo "  拉取基础镜像（可能需要几分钟）..."
    $COMPOSE_CMD pull mysql redis minio etcd milvus meilisearch nginx 2>&1 | tee -a "$LOG_FILE" | grep -E "Pull|pull|Pulled|pulled|latest|error" || true

    # 构建应用镜像
    echo
    echo "  构建应用镜像（首次耗时较长，约 5-15 分钟）..."
    $COMPOSE_CMD build --no-cache backend frontend 2>&1 | tee -a "$LOG_FILE" | tail -20

    # 启动全部服务
    echo
    echo "  启动所有服务..."
    $COMPOSE_CMD up -d 2>&1 | tee -a "$LOG_FILE"
}

# ── 6. 等待服务就绪 ────────────────────────────────────────
wait_for_services() {
    title "等待服务就绪"

    # 等待 MySQL
    echo -n "  等待 MySQL 健康检查"
    local i=0
    while ! $COMPOSE_CMD exec -T mysql mysqladmin ping -h 127.0.0.1 \
            -u root "--password=${MYSQL_ROOT_PASSWORD}" --silent &>/dev/null; do
        echo -n "."
        sleep 3
        (( i++ ))
        if [[ $i -gt 40 ]]; then
            echo
            error "MySQL 启动超时，请检查: $COMPOSE_CMD logs mysql"
            exit 1
        fi
    done
    echo
    info "MySQL 就绪"

    # 等待 Milvus（通过 gRPC 端口）
    echo -n "  等待 Milvus 启动"
    i=0
    while ! $COMPOSE_CMD exec -T milvus python3 -c \
            "import socket; s=socket.socket(); s.connect(('localhost',19530)); s.close()" &>/dev/null; do
        echo -n "."
        sleep 5
        (( i++ ))
        if [[ $i -gt 24 ]]; then
            echo
            warn "Milvus 可能尚未完全就绪，继续安装（后续上传文档时会自动重连）"
            break
        fi
    done
    echo
    info "Milvus 启动完成"

    # 等待后端 API（包含 alembic 迁移）
    echo -n "  等待后端 API 和数据库迁移"
    i=0
    while ! curl -sf "http://localhost:${HTTP_PORT}/api/health" &>/dev/null; do
        echo -n "."
        sleep 5
        (( i++ ))
        if [[ $i -gt 36 ]]; then
            echo
            warn "后端 API 可能尚未就绪，请稍后访问或查看日志: $COMPOSE_CMD logs backend"
            break
        fi
    done
    echo
    info "后端 API 就绪"
}

# ── 7. 创建 MinIO bucket ──────────────────────────────────
create_minio_bucket() {
    # MinIO bucket 由后端 minio_client.py 在首次访问时自动创建，无需手动操作
    :
}

# ── 8. 完成摘要 ────────────────────────────────────────────
print_summary() {
    local access_url="http://${SERVER_HOST}"
    [[ "$HTTP_PORT" != "80" ]] && access_url="${access_url}:${HTTP_PORT}"

    echo
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║              安装完成！                          ║${NC}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "  ${BOLD}访问地址:${NC}  ${CYAN}${access_url}${NC}"
    echo -e "  ${BOLD}API 文档:${NC}  ${CYAN}${access_url}/docs${NC}"
    echo -e "  ${BOLD}MinIO 控制台:${NC} ${CYAN}http://${SERVER_HOST}:9001${NC}"
    echo
    echo -e "  ${BOLD}默认账号:${NC}  admin"
    echo -e "  ${BOLD}默认密码:${NC}  ${YELLOW}Admin@123456${NC}  ← 首次登录后请立即修改！"
    echo
    echo -e "${BOLD}  配置文件: ${ENV_FILE}${NC}"
    echo -e "${BOLD}  查看日志: ${COMPOSE_CMD} -f ${SCRIPT_DIR} logs -f${NC}"
    echo -e "${BOLD}  停止服务: cd ${SCRIPT_DIR} && ${COMPOSE_CMD} down${NC}"
    echo -e "${BOLD}  更新服务: cd ${SCRIPT_DIR} && ${COMPOSE_CMD} pull && ${COMPOSE_CMD} up -d${NC}"
    echo

    # 将摘要写入日志
    log "安装完成 | 访问地址: ${access_url} | 配置: ${ENV_FILE}"
}

# ── 主流程 ─────────────────────────────────────────────────
main() {
    # 确保以非 root 或 root 均可运行（docker 权限问题提示）
    if [[ $EUID -ne 0 ]]; then
        if ! docker info &>/dev/null 2>&1; then
            warn "当前用户没有 docker 权限，建议: sudo usermod -aG docker \$USER && newgrp docker"
        fi
    fi

    banner
    log "安装开始"

    check_prerequisites
    collect_config
    write_env
    create_dirs
    start_services
    wait_for_services
    print_summary
}

main "$@"
