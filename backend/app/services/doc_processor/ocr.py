# backend/app/services/doc_processor/ocr.py
import base64
import tempfile
from pathlib import Path

from app.core.config import settings

_ocr_reader = None


def _get_ocr_reader():
    """懒加载 EasyOCR 实例（避免启动时加载大模型）。
    easyocr 未安装时返回 None，由调用方静默跳过。
    """
    global _ocr_reader
    if _ocr_reader is None:
        try:
            import easyocr  # type: ignore
            _ocr_reader = easyocr.Reader(
                ["ch_sim", "en"],
                gpu=settings.ocr_use_gpu,
                verbose=False,
            )
        except ImportError:
            return None
    return _ocr_reader


def extract_text_from_image(image_bytes: bytes) -> str:
    """
    对图片字节执行 OCR，返回识别出的文字（换行符分隔）。
    easyocr 未安装、空图片或识别失败均返回空字符串。
    """
    reader = _get_ocr_reader()
    if reader is None:
        return ""

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(image_bytes)
        tmp_path = f.name

    try:
        results = reader.readtext(tmp_path)
        if not results:
            return ""
        lines = []
        for (_, text, confidence) in results:
            if confidence >= 0.3 and text and str(text).strip():
                lines.append(str(text).strip())
        return "\n".join(lines)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


_MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
}


def analyze_image_with_vision(image_bytes: bytes, filename: str = "image.png") -> str:
    """
    调用 doubao-seed-1.6（或其他 vision 模型）分析图片内容。
    vision_api_key 未配置时返回空字符串，由调用方 fallback 到 EasyOCR。
    """
    if not settings.vision_api_key:
        return ""

    from openai import OpenAI

    suffix = Path(filename).suffix.lower()
    mime = _MIME_MAP.get(suffix, "image/png")
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    client = OpenAI(
        api_key=settings.vision_api_key,
        base_url=settings.vision_api_base,
    )
    try:
        response = client.chat.completions.create(
            model=settings.vision_model,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                    {
                        "type": "text",
                        "text": (
                            "请详细描述这张图片的内容，包括：图表类型、坐标轴标签、"
                            "关键数据点和数值、趋势规律、图例说明，以及图片中出现的所有文字信息。"
                            "若是流程图或架构图，请描述各节点和连接关系。"
                        ),
                    },
                ],
            }],
            max_tokens=1024,
        )
        return response.choices[0].message.content or ""
    except Exception:
        return ""


def extract_text_from_element(raw_element) -> str:
    """
    从 unstructured Image/Figure 元素中提取图片字节并 OCR。
    如果元素没有图片数据，返回空字符串。
    """
    image_bytes = None

    if hasattr(raw_element, "metadata") and raw_element.metadata:
        meta = raw_element.metadata
        if hasattr(meta, "image") and meta.image:
            image_bytes = meta.image
        elif hasattr(meta, "image_base64") and meta.image_base64:
            import base64
            image_bytes = base64.b64decode(meta.image_base64)

    if not image_bytes:
        return ""

    return extract_text_from_image(image_bytes)
