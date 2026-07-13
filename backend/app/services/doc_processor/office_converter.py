import os
import subprocess
import tempfile
from pathlib import Path

OFFICE_EXTENSIONS = {'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf'}


def _cached_pdf_path(fs_path: str, cache_dir: str) -> str:
    return os.path.join(cache_dir, Path(fs_path).stem + '_preview.pdf')


def convert_to_pdf(fs_path: str, cache_dir: str) -> str:
    """
    Convert an Office file to PDF using LibreOffice headless.
    Results are cached in cache_dir so repeated previews are fast.
    Returns the path to the PDF file.
    """
    cached = _cached_pdf_path(fs_path, cache_dir)
    if os.path.exists(cached):
        return cached

    os.makedirs(cache_dir, exist_ok=True)
    src = Path(fs_path)

    # Each conversion gets its own LibreOffice user profile dir to support concurrency
    with tempfile.TemporaryDirectory() as tmp_profile:
        result = subprocess.run(
            [
                'libreoffice',
                f'-env:UserInstallation=file://{tmp_profile}',
                '--headless',
                '--convert-to', 'pdf',
                '--outdir', str(cache_dir),
                str(src),
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )

    if result.returncode != 0:
        raise RuntimeError(result.stderr or 'LibreOffice conversion failed')

    # LibreOffice names the output as {stem}.pdf in outdir
    raw_output = os.path.join(cache_dir, src.stem + '.pdf')
    if not os.path.exists(raw_output):
        raise RuntimeError('LibreOffice produced no output file')

    if raw_output != cached:
        os.rename(raw_output, cached)

    return cached
