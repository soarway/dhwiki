#!/usr/bin/env python3
"""
AEO 检测插件 — 商业伙伴 (aeo_partner)

插件接口规范：
  - 命令行参数: --dir_tag <str>  对应的知识库 dir_tag
  - 标准输出 JSON: {"result": "pass"} 或 {"result": "fail", "detail": "..."}
  - 退出码: 0 表示正常执行（即使检测结论是 fail），非 0 表示插件本身出错
"""
import argparse
import json
import sys


def run(dir_tag: str) -> dict:
    """
    执行 AEO 商业伙伴检测。当前为占位实现。
    """
    return {
        "result": "fail",
        "detail": "占位插件尚未实现，请通过「上传插件」按钮上传正式检测脚本后重试。",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AEO 商业伙伴检测插件")
    parser.add_argument("--dir_tag", default="aeo_partner", help="知识库 dir_tag")
    args = parser.parse_args()
    result = run(args.dir_tag)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0)
