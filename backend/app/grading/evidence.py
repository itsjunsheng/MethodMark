"""Render stored pen strokes and normalize uploaded photos for vision input."""

import base64
import json
from io import BytesIO

from PIL import Image, ImageDraw, ImageOps

from app.grading.schemas import GradingError

WIDTH = 1400


def image_content(data: bytes, mime: str = "image/png") -> dict:
    return {
        "type": "image_url",
        "image_url": {
            "url": f"data:{mime};base64," + base64.b64encode(data).decode(),
            "detail": "high",
        },
    }


def photo_content(data: bytes) -> dict:
    try:
        with Image.open(BytesIO(data)) as original:
            if original.width * original.height > 25_000_000:
                raise ValueError
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((2400, 2400))
            output = BytesIO()
            image.save(output, format="JPEG", quality=92)
            return image_content(output.getvalue(), "image/jpeg")
    except (OSError, ValueError, Image.DecompressionBombError):
        raise GradingError(
            "A submitted photo could not be read. Review the original work manually."
        ) from None


def ink_content(
    drawing: dict, question_id: str, part_id: str, marks: int, sizes: dict | None = None
) -> dict | None:
    strokes = drawing.get(json.dumps([question_id, part_id], separators=(",", ":")), [])
    if not strokes:
        return None
    area = json.dumps([question_id, part_id], separators=(",", ":"))
    width, height = (sizes or {}).get(area, [624, max(3, min(marks + 1, 8)) * 28 + 32])
    height = round(WIDTH * height / width)
    image = Image.new("RGB", (WIDTH, height), "white")
    pen = ImageDraw.Draw(image)
    for stroke in strokes:
        points = [(round(x * (WIDTH - 1)), round(y * (height - 1))) for x, y in stroke]
        if len(points) == 1:
            x, y = points[0]
            pen.ellipse((x - 2, y - 2, x + 2, y + 2), fill="#17241d")
        else:
            pen.line(points, fill="#17241d", width=4, joint="curve")
    output = BytesIO()
    image.save(output, format="PNG")
    return image_content(output.getvalue())
