# backend/app/services/storage/minio_client.py
import io
from minio import Minio
from minio.error import S3Error
from app.core.config import settings


def get_minio_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_bucket_exists(client: Minio, bucket: str = settings.minio_bucket) -> None:
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


def upload_bytes(
    data: bytes,
    object_name: str,
    content_type: str = "application/octet-stream",
    bucket: str = settings.minio_bucket,
) -> str:
    """上传字节数据，返回 object_name"""
    client = get_minio_client()
    ensure_bucket_exists(client, bucket)
    client.put_object(
        bucket,
        object_name,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return object_name


def download_bytes(object_name: str, bucket: str = settings.minio_bucket) -> bytes:
    """下载对象为字节"""
    client = get_minio_client()
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_object(object_name: str, bucket: str = settings.minio_bucket) -> None:
    client = get_minio_client()
    try:
        client.remove_object(bucket, object_name)
    except S3Error:
        pass  # 不存在时静默忽略
