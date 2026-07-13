FROM python:3.11-slim

WORKDIR /app

# ── 系统依赖 ──────────────────────────────────────────────
# libmagic1      : python-magic（文件类型检测）
# poppler-utils  : unstructured PDF 解析
# tesseract-ocr  : OCR 文字识别
# tesseract-ocr-chi-sim : 中文 OCR
# libgl1 libglib2.0-0   : sentence-transformers / OpenCV 依赖
# curl           : MinIO healthcheck（docker-compose）
RUN apt-get update && apt-get install -y --no-install-recommends \
        libmagic1 \
        poppler-utils \
        tesseract-ocr \
        tesseract-ocr-chi-sim \
        libgl1 \
        libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ── Python 依赖 ───────────────────────────────────────────
RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN uv pip install --system -e .

# ── 应用代码 ──────────────────────────────────────────────
COPY . .

# ── 入口脚本（负责运行 alembic 迁移 + 数据初始化） ────────
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
