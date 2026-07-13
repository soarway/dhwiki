#!/usr/bin/env python3
"""
AEO 检测插件 — 基本信息 (aeo_basic)

检测逻辑：
  1. 「营业证照/海关注册登记证书」知识库：读取所有文件，逐个发送到
     局域网视觉代理（Windows 浏览器自动化），由代理通过网页版 DeepSeek
     判断文件类型和有效性：
       - 是否为有效的营业执照
       - 是否为有效的海关注册登记证书（或海关进出口收发货人备案回执）
     两类证件均找到且有效 → 本项通过
  2. 「公司组织架构图」知识库：同样发送到代理判断是否为完整的组织架构图
     → 通过则本项通过

两项全部通过 → {"result": "pass"}
任意一项不通过 → {"result": "fail", "detail": "..."}

通信协议（与局域网视觉代理）：
  → 4字节大端整数（pickle长度）+ pickle({filename, llm_prompt, file_size, data})
  ← 4字节大端整数（回复文本字节数）+ UTF-8 文本（DeepSeek 回复内容）

依赖配置（deploy/.env）：
  VISION_AGENT_HOST  — 视觉代理机器的局域网 IP
  VISION_AGENT_PORT  — 视觉代理监听端口（默认 8811）

接口规范：
  命令行: python plugin_basic.py --dir_tag aeo_basic
  stdout: JSON  {"result": "pass"} 或 {"result": "fail", "detail": "..."}
  退出码: 0（插件本身正常运行，result 可为 fail）
"""

import argparse
import json
import pickle
import re
import socket
import sys
import time
from pathlib import Path

# ── 路径修复：确保在子进程中也能 import app.* ──────────────────────────────
_BACKEND_DIR = str(Path(__file__).resolve().parents[3])  # .../backend
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# ── 项目内部导入 ──────────────────────────────────────────────────────────────
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.knowledge_base import KnowledgeBase
from app.models.file import File

# ── 常量 ─────────────────────────────────────────────────────────────────────
_KB_LICENSES  = "营业证照/海关注册登记证书"
_KB_ORG_CHART = "公司组织架构图"


# ════════════════════════════════════════════════════════════════════════════
# 局域网视觉代理通信
# ════════════════════════════════════════════════════════════════════════════

def _recv_exact(sock: socket.socket, n: int) -> bytes:
    """从 socket 精确读取 n 字节。"""
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("接收数据时连接中断")
        buf += chunk
    return buf


def _transact(packet: dict, recv_timeout: int = 30) -> dict:
    """
    单次 socket 事务（每次新建连接）：
      → 4字节大端整数（pickle长度）+ pickle(packet)
      ← 4字节大端整数（JSON长度）+ JSON bytes
    返回解析后的 dict。
    """
    host = settings.vision_agent_host
    port = settings.vision_agent_port
    if not host:
        raise RuntimeError(
            "未配置 VISION_AGENT_HOST，请在 deploy/.env 中设置局域网视觉代理的 IP 地址"
        )

    serialized = pickle.dumps(packet)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(15)
        s.connect((host, port))
        s.sendall(len(serialized).to_bytes(4, "big"))
        s.sendall(serialized)

        s.settimeout(recv_timeout)
        raw_len  = _recv_exact(s, 4)
        resp_len = int.from_bytes(raw_len, "big")
        raw_resp = _recv_exact(s, resp_len)

    return json.loads(raw_resp.decode("utf-8"))


def _send_to_agent(
    file_bytes: bytes,
    filename: str,
    prompt: str,
    total_timeout: int = 300,
    poll_interval: int = 5,
) -> str:
    """
    两阶段通信，与局域网视觉代理交互：

    阶段1 — 提交（submit）
      发送：pickle({type:"submit", filename, llm_prompt, file_size, data})
      接收：JSON {"type":"accepted","job_id":"<uuid>"}
      接收端立即返回 job_id 后可关闭连接，异步处理文件。

    阶段2 — 轮询（poll）
      每隔 poll_interval 秒新建连接查询：
      发送：pickle({type:"poll","job_id":"<uuid>"})
      接收：JSON {"type":"pending"}          ← 尚未处理完
         或 JSON {"type":"done","result":"<DeepSeek回复文本>"}
      直到收到 done 或超时（total_timeout 秒）。

    返回：DeepSeek 回复的原始文本（由调用方解析 JSON）。
    """
    # ── 阶段1：提交文件 ──────────────────────────────────────────────────
    submit_resp = _transact({
        "type":       "submit",
        "filename":   filename,
        "llm_prompt": prompt,
        "file_size":  len(file_bytes),
        "data":       file_bytes,
    })
    if submit_resp.get("type") != "accepted":
        raise RuntimeError(f"代理拒绝提交：{submit_resp}")
    job_id = submit_resp.get("job_id", "")
    if not job_id:
        raise RuntimeError(f"代理未返回 job_id：{submit_resp}")

    # ── 阶段2：轮询结果 ──────────────────────────────────────────────────
    deadline = time.time() + total_timeout
    while time.time() < deadline:
        time.sleep(poll_interval)
        try:
            poll_resp = _transact({"type": "poll", "job_id": job_id})
        except Exception as e:
            # 轮询临时失败不终止，继续等待
            continue

        if poll_resp.get("type") == "done":
            result = poll_resp.get("result", "")
            if not result:
                raise ValueError(f"代理返回 done 但 result 为空（job_id={job_id}）")
            return result
        # type == "pending"：继续轮询

    raise TimeoutError(
        f"等待视觉代理处理超时（{total_timeout}秒），job_id={job_id}"
    )


# ════════════════════════════════════════════════════════════════════════════
# JSON 解析
# ════════════════════════════════════════════════════════════════════════════

def _parse_json_response(text: str) -> dict:
    """从代理回复中解析第一个 JSON 对象，容忍 markdown 代码块包装。"""
    text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    raise ValueError(f"无法解析代理回复中的 JSON：{text[:300]}")


# ════════════════════════════════════════════════════════════════════════════
# 分析函数（通过视觉代理）
# ════════════════════════════════════════════════════════════════════════════

def analyze_certificate(file_bytes: bytes, filename: str) -> dict:
    """
    通过视觉代理判断文件是哪类证件，以及是否合法有效。

    返回：
      {
        "doc_type": "营业执照" | "海关注册登记证书" | "海关进出口收发货人备案回执" | "其他",
        "is_valid": true | false,
        "reason":   "简要说明"
      }
    """
    prompt = (
        "你是一名专业的AEO（海关高级认证企业）认证审核专家。\n"
        "请仔细分析上传的文件，完成两项判断：\n\n"
        "【判断1】文件类型\n"
        "判断该文件属于以下哪一类：\n"
        "  A. 营业执照（含统一社会信用代码、法定代表人、注册资本、经营范围、有效期等）\n"
        "  B. 海关注册登记证书 / 海关进出口收发货人备案回执（含海关注册编号/备案号、企业名称等）\n"
        "  C. 其他（不属于以上两类）\n\n"
        "【判断2】合法有效性\n"
        "  - 关键字段是否完整\n"
        "  - 是否已明显过期（有效期为长期视为有效）\n"
        "  - 是否有明显伪造或格式异常迹象\n"
        "  注意：若文件内容不完整，请基于现有信息合理推断，"
        "不要因内容不完整就直接判为无效。\n\n"
        f"文件名：{filename}\n\n"
        "请严格以下列 JSON 格式输出，不要输出任何其他内容：\n"
        '{"doc_type": "营业执照", "is_valid": true, "reason": "简要说明"}'
    )
    response_text = _send_to_agent(file_bytes, filename, prompt)
    return _parse_json_response(response_text)


def analyze_org_chart(file_bytes: bytes, filename: str) -> dict:
    """
    通过视觉代理判断文件是否为完整的公司组织架构图。

    返回：
      {
        "is_org_chart": true | false,
        "is_complete":  true | false,
        "reason":       "简要说明"
      }
    """
    prompt = (
        "你是一名专业的AEO（海关高级认证企业）认证审核专家。\n"
        "请分析上传的文件，判断它是否为公司的组织架构图。\n\n"
        "判断标准：\n"
        "  - 组织架构图应包含公司各部门名称、岗位名称及上下级层级关系\n"
        "  - 完整的组织架构图应覆盖主要职能部门"
        "（如总经理/董事长、财务、销售/业务、关务/进出口、仓储/物流等）\n\n"
        f"文件名：{filename}\n\n"
        "请严格以下列 JSON 格式输出，不要输出任何其他内容：\n"
        '{"is_org_chart": true, "is_complete": true, "reason": "简要说明"}'
    )
    response_text = _send_to_agent(file_bytes, filename, prompt)
    return _parse_json_response(response_text)


# ════════════════════════════════════════════════════════════════════════════
# 知识库文件检测
# ════════════════════════════════════════════════════════════════════════════

def _check_licenses_kb(kb: KnowledgeBase, db) -> tuple[bool, list[str]]:
    """
    检测「证照」知识库。
    返回 (passed: bool, issues: list[str])
    passed=True 当且仅当找到有效营业执照 AND 有效海关注册登记证书。
    """
    issues: list[str] = []
    files = db.query(File).filter(File.kb_id == kb.id).all()

    if not files:
        return False, [
            f"「{_KB_LICENSES}」知识库中没有任何文件，"
            "请上传营业执照和海关注册登记证书（或海关进出口收发货人备案回执）的扫描件。"
        ]

    has_business_license = False
    has_customs_cert     = False

    for f in files:
        prefix = f"文件「{f.name}」"
        try:
            with open(f.fs_path, "rb") as fh:
                file_bytes = fh.read()
        except Exception as e:
            issues.append(f"{prefix} 读取失败：{e}")
            continue

        try:
            result = analyze_certificate(file_bytes, f.name)
        except Exception as e:
            issues.append(f"{prefix} DeepSeek 分析失败：{e}")
            continue

        doc_type = result.get("doc_type", "其他")
        is_valid = result.get("is_valid", False)
        reason   = result.get("reason", "")

        if "营业执照" in doc_type:
            if is_valid:
                has_business_license = True
            else:
                issues.append(f"{prefix}（营业执照）不合法/无效：{reason}")
        elif "海关" in doc_type or "备案" in doc_type:
            if is_valid:
                has_customs_cert = True
            else:
                issues.append(f"{prefix}（海关注册登记证书）不合法/无效：{reason}")
        else:
            issues.append(
                f"{prefix} 被识别为「{doc_type}」，"
                "不是营业执照或海关注册登记证书，请核实是否上传了正确文件。"
            )

    if not has_business_license:
        issues.append(
            "「证照」知识库中未找到有效的营业执照，"
            "请上传加盖公章的有效期内营业执照扫描件。"
        )
    if not has_customs_cert:
        issues.append(
            "「证照」知识库中未找到有效的海关注册登记证书"
            "（或海关进出口收发货人备案回执），请上传相关证件扫描件。"
        )

    return has_business_license and has_customs_cert, issues


def _check_org_chart_kb(kb: KnowledgeBase, db) -> tuple[bool, list[str]]:
    """
    检测「公司组织架构图」知识库。
    返回 (passed: bool, issues: list[str])
    """
    issues: list[str] = []
    files = db.query(File).filter(File.kb_id == kb.id).all()

    if not files:
        return False, [
            f"「{_KB_ORG_CHART}」知识库中没有任何文件，"
            "请上传包含公司部门和岗位层级关系的组织架构图。"
        ]

    has_valid_org_chart = False

    for f in files:
        prefix = f"文件「{f.name}」"
        try:
            with open(f.fs_path, "rb") as fh:
                file_bytes = fh.read()
        except Exception as e:
            issues.append(f"{prefix} 读取失败：{e}")
            continue

        try:
            result = analyze_org_chart(file_bytes, f.name)
        except Exception as e:
            issues.append(f"{prefix} DeepSeek 分析失败：{e}")
            continue

        is_org_chart = result.get("is_org_chart", False)
        is_complete  = result.get("is_complete",  False)
        reason       = result.get("reason", "")

        if is_org_chart and is_complete:
            has_valid_org_chart = True
            break   # 找到一份完整的即可
        elif is_org_chart:
            issues.append(f"{prefix} 是组织架构图但不完整：{reason}")
        else:
            issues.append(f"{prefix} 未被识别为组织架构图：{reason}")

    if not has_valid_org_chart:
        issues.append(
            "「公司组织架构图」知识库中未找到完整有效的公司组织架构图，"
            "请上传包含各部门名称、岗位及层级关系的组织架构图。"
        )

    return has_valid_org_chart, issues


# ════════════════════════════════════════════════════════════════════════════
# 插件主入口
# ════════════════════════════════════════════════════════════════════════════

def run(dir_tag: str) -> dict:
    """
    执行 AEO 基本信息检测。

    :param dir_tag: 知识库目录标签，应为 'aeo_basic'
    :return: {"result": "pass"} 或 {"result": "fail", "detail": "..."}
    """
    db = SessionLocal()
    all_issues: list[str] = []

    try:
        license_kb = (
            db.query(KnowledgeBase)
            .filter(
                KnowledgeBase.dir_tag  == dir_tag,
                KnowledgeBase.name     == _KB_LICENSES,
                KnowledgeBase.is_deleted == False,
            )
            .first()
        )
        org_chart_kb = (
            db.query(KnowledgeBase)
            .filter(
                KnowledgeBase.dir_tag  == dir_tag,
                KnowledgeBase.name     == _KB_ORG_CHART,
                KnowledgeBase.is_deleted == False,
            )
            .first()
        )

        # ── 检测「证照」知识库 ─────────────────────────────────────────────
        if license_kb is None:
            all_issues.append(
                f"未找到名为「{_KB_LICENSES}」的知识库（dir_tag={dir_tag}），"
                "请在 AEO 基本信息目录下创建该知识库并上传证件文件。"
            )
        else:
            lic_passed, lic_issues = _check_licenses_kb(license_kb, db)
            if not lic_passed:
                all_issues.extend(lic_issues)

        # ── 检测「公司组织架构图」知识库 ──────────────────────────────────
        if org_chart_kb is None:
            all_issues.append(
                f"未找到名为「{_KB_ORG_CHART}」的知识库（dir_tag={dir_tag}），"
                "请在 AEO 基本信息目录下创建该知识库并上传组织架构图文件。"
            )
        else:
            oc_passed, oc_issues = _check_org_chart_kb(org_chart_kb, db)
            if not oc_passed:
                all_issues.extend(oc_issues)

    except Exception as e:
        return {"result": "fail", "detail": f"插件执行时发生意外错误：{e}"}
    finally:
        db.close()

    if all_issues:
        return {
            "result": "fail",
            "detail": "\n".join(f"• {issue}" for issue in all_issues),
        }

    return {"result": "pass"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AEO 基本信息检测插件")
    parser.add_argument("--dir_tag", default="aeo_basic", help="知识库 dir_tag")
    args = parser.parse_args()

    result = run(args.dir_tag)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0)
