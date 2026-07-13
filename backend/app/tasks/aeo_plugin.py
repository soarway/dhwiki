# backend/app/tasks/aeo_plugin.py
"""
Celery 异步任务：执行 AEO 章节检测插件。

每个 AEO 章节对应一个独立的 Python 插件脚本，位于
  backend/app/plugins/aeo/plugin_{section}.py
（section 为 dir_tag 去掉 'aeo_' 前缀，如 aeo_basic → plugin_basic.py）

插件接口规范：
  - 入参（命令行）: --dir_tag <dir_tag>
  - 标准输出：JSON 字符串，格式为
      {"result": "pass"}
      或
      {"result": "fail", "detail": "..."}
  - 退出码 0 表示插件正常执行（result 可以是 fail），非 0 表示插件本身出错
"""
import json
import os
import subprocess
import sys

from app.celery_app import celery_app

# 插件目录（相对于本文件计算绝对路径）
_PLUGIN_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "plugins", "aeo")
)


@celery_app.task(
    name="app.tasks.aeo_plugin.run_aeo_plugin",
    bind=True,
    max_retries=0,
    time_limit=600,
)
def run_aeo_plugin(self, section: str) -> dict:
    """
    执行指定 AEO 章节的检测插件。

    :param section: AEO 章节的 dir_tag，例如 'aeo_basic'
    :return: {"result": "pass"|"fail", "detail": "..."(optional)}
    """
    section_name = section.removeprefix("aeo_")
    plugin_path = os.path.join(_PLUGIN_DIR, f"plugin_{section_name}.py")

    if not os.path.isfile(plugin_path):
        return {
            "result": "fail",
            "detail": f"插件文件不存在：{plugin_path}，请先通过「上传插件」上传对应脚本。",
        }

    try:
        proc = subprocess.run(
            [sys.executable, plugin_path, "--dir_tag", section],
            capture_output=True,
            text=True,
            timeout=540,
        )
    except subprocess.TimeoutExpired:
        return {"result": "fail", "detail": "插件执行超时（9分钟），请检查插件逻辑。"}
    except Exception as exc:
        return {"result": "fail", "detail": f"启动插件进程失败：{exc}"}

    if proc.returncode != 0:
        stderr = proc.stderr.strip()[:500]
        return {
            "result": "fail",
            "detail": f"插件进程异常退出（code={proc.returncode}）：{stderr}",
        }

    stdout = proc.stdout.strip()
    if not stdout:
        return {"result": "fail", "detail": "插件无输出，请检查插件是否正确打印 JSON。"}

    try:
        result = json.loads(stdout)
    except json.JSONDecodeError:
        return {
            "result": "fail",
            "detail": f"插件输出不是有效 JSON：{stdout[:200]}",
        }

    if result.get("result") not in ("pass", "fail"):
        return {
            "result": "fail",
            "detail": f"插件返回的 result 字段值无效（应为 'pass' 或 'fail'）：{result}",
        }

    return result
