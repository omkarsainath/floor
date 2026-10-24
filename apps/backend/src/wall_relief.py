"""Local single-image relief estimation. No source image is sent to a service."""
import base64
import io
import threading

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

MODEL_ID = 'depth-anything/Depth-Anything-V2-Small-hf'
_processor = _model = None
_lock = threading.Lock()


def decode_image(value):
    if not isinstance(value, str) or len(value) > 12_000_000:
        raise ValueError('Choose a JPEG, PNG or WebP image under 8 MB.')
    header, sep, encoded = value.partition(',')
    if not sep or header not in ('data:image/jpeg;base64', 'data:image/png;base64', 'data:image/webp;base64'):
        raise ValueError('Only JPEG, PNG and WebP images are supported.')
    try:
        raw = base64.b64decode(encoded, validate=True)
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > 24_000_000 or min(image.size) < 32:
                raise ValueError('Use an image between 32 pixels and 24 megapixels.')
            image = ImageOps.exif_transpose(image).convert('RGB')
            image.thumbnail((1536, 1536))
            return image.copy()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError('Could not read that image.') from error


def data_url(image, fmt):
    output = io.BytesIO()
    image.save(output, format=fmt, **({'quality': 92} if fmt == 'JPEG' else {}))
    return f'data:image/{"jpeg" if fmt == "JPEG" else "png"};base64,' + base64.b64encode(output.getvalue()).decode('ascii')


def normalize_depth(values):
    values = np.asarray(values, dtype=np.float32)
    if values.ndim != 2 or not np.isfinite(values).all():
        raise ValueError('Depth model returned invalid output.')
    low, high = np.percentile(values, (2, 98))
    if high - low < 1e-6:
        return np.zeros(values.shape, dtype=np.uint8)
    normalized = np.clip((values - low) / (high - low), 0, 1)
    return np.round(cv2.GaussianBlur(normalized, (5, 5), 0.8) * 255).astype(np.uint8)


def generate_relief(value):
    global _model, _processor
    image = decode_image(value)
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    with _lock:
        if _model is None:
            _processor = AutoImageProcessor.from_pretrained(MODEL_ID)
            _model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID).eval()
        with torch.inference_mode():
            inputs = _processor(images=image, return_tensors='pt')
            predicted = _model(**inputs).predicted_depth
            # Relative inverse depth: brighter means nearer / raised outward.
            depth = torch.nn.functional.interpolate(predicted.unsqueeze(1), size=(288, 512), mode='bicubic', align_corners=False)[0, 0].cpu().numpy()
    return {'image': data_url(image, 'JPEG'), 'depth': data_url(Image.fromarray(normalize_depth(depth)), 'PNG'),
            'aspect': image.width / image.height, 'model': MODEL_ID,
            'message': 'Estimated relief. Original colours and photographed lighting are retained; hidden geometry and separate light sources cannot be recovered exactly.'}
