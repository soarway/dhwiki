import base64
import io
import random
import string
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from jose import jwt, JWTError

from app.core.config import settings

router = APIRouter()

_CAPTCHA_EXPIRE_SECONDS = 300  # 5 分钟有效


def _generate_code(length: int = 4) -> str:
    chars = string.ascii_uppercase.replace("O", "").replace("I", "") + string.digits.replace("0", "")
    return "".join(random.choices(chars, k=length))


def _make_token(code: str) -> str:
    payload = {"sub": code.upper(), "exp": int(time.time()) + _CAPTCHA_EXPIRE_SECONDS}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def verify_captcha_token(token: str, user_input: str) -> bool:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return payload["sub"] == user_input.upper()
    except JWTError:
        return False


@router.get("/captcha")
def get_captcha():
    """
    返回 base64 编码的验证码图片 + 一次性 token。
    前端登录时将 token 和用户输入的文字一起提交给 /auth/login。
    """
    try:
        from captcha.image import ImageCaptcha
    except ImportError:
        raise HTTPException(status_code=503, detail="验证码库未安装，请执行 pip install captcha")

    code = _generate_code()
    token = _make_token(code)

    image_captcha = ImageCaptcha(width=160, height=60)
    img_bytes = image_captcha.generate(code)
    b64 = base64.b64encode(img_bytes.read()).decode()

    return JSONResponse({
        "token": token,
        "image": f"data:image/png;base64,{b64}",
    })
