"""
Floor plan image embeddings using YOLOv8 backbone.
Extracts feature vectors from the YOLO backbone for image similarity matching.
Falls back to a lightweight CNN (torchvision) if YOLO is unavailable.
"""

import json
import numpy as np
import cv2

try:
    import torch
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

# ── Cache ────────────────────────────────────────────────
_model_cache = {}
_EMBED_DIM = 512  # target embedding dimension


def _get_yolo_backbone(model_path: str):
    """Load YOLO model and return it for feature extraction."""
    if model_path in _model_cache:
        return _model_cache[model_path]
    if YOLO is None:
        return None
    try:
        model = YOLO(model_path)
        _model_cache[model_path] = model
        return model
    except Exception as e:
        print(f"[embeddings] Failed to load YOLO model: {e}")
        return None


def extract_embedding_yolo(image: np.ndarray, model_path: str) -> np.ndarray:
    """Extract embedding from image using YOLO backbone features.
    Returns a normalized 1-D float32 numpy array."""
    if not TORCH_AVAILABLE:
        return _fallback_embedding(image)

    model = _get_yolo_backbone(model_path)
    if model is None:
        return _fallback_embedding(image)

    try:
        # Run YOLO and capture backbone features
        results = model.predict(source=image, conf=0.1, verbose=False, embed=[12])
        # embed=[12] returns features from backbone layer 12
        # ultralytics >= 8.0.120 supports embed parameter
        if results and hasattr(results[0], 'extra') and results[0].extra:
            feat = results[0].extra[0]
        else:
            # Fallback: use model's internal feature extraction
            feat = _extract_features_manual(model, image)

        if feat is None:
            return _fallback_embedding(image)

        # Global average pool → flat vector
        if isinstance(feat, torch.Tensor):
            if feat.dim() == 4:  # (B, C, H, W)
                emb = F.adaptive_avg_pool2d(feat, 1).flatten().detach().cpu().numpy()
            elif feat.dim() == 3:  # (C, H, W)
                emb = F.adaptive_avg_pool2d(feat.unsqueeze(0), 1).flatten().detach().cpu().numpy()
            else:
                emb = feat.flatten().detach().cpu().numpy()
        elif isinstance(feat, np.ndarray):
            if feat.ndim >= 3:
                emb = feat.mean(axis=tuple(range(2, feat.ndim))).flatten()
            else:
                emb = feat.flatten()
        else:
            return _fallback_embedding(image)

        # Reduce/pad to target dim — every embedding must come out at exactly _EMBED_DIM,
        # otherwise cosine_similarity() can't compare it against embeddings from other
        # floor plans (and YOLO backbone layers can yield far fewer than 512 channels,
        # e.g. layer 12 on yolov8n produced a 256-dim vector here before this fix).
        if len(emb) > _EMBED_DIM:
            # PCA-like reduction via random projection (deterministic seed)
            rng = np.random.RandomState(42)
            proj = rng.randn(_EMBED_DIM, len(emb)).astype(np.float32)
            proj /= np.linalg.norm(proj, axis=1, keepdims=True)
            emb = proj @ emb.astype(np.float32)
        elif len(emb) < _EMBED_DIM:
            emb = np.pad(emb.astype(np.float32), (0, _EMBED_DIM - len(emb)))

        # L2 normalize
        norm = np.linalg.norm(emb)
        if norm > 1e-8:
            emb = emb / norm

        return emb.astype(np.float32)

    except Exception as e:
        print(f"[embeddings] YOLO embedding failed: {e}")
        return _fallback_embedding(image)


def _extract_features_manual(model, image: np.ndarray):
    """Manually extract backbone features from YOLO model."""
    if not TORCH_AVAILABLE:
        return None
    try:
        # Preprocess image
        img = cv2.resize(image, (640, 640))
        img = img[:, :, ::-1].transpose(2, 0, 1)  # BGR→RGB, HWC→CHW
        img = np.ascontiguousarray(img, dtype=np.float32) / 255.0
        tensor = torch.from_numpy(img).unsqueeze(0)

        # Get the PyTorch model
        pt_model = model.model
        if hasattr(pt_model, 'model'):
            # Ultralytics wraps the model
            backbone = pt_model.model
        else:
            backbone = pt_model

        # Forward through backbone layers only (first ~10 layers)
        x = tensor
        with torch.no_grad():
            for i, layer in enumerate(backbone):
                x = layer(x)
                if i >= 9:  # Stop after backbone
                    break
        return x
    except Exception as e:
        print(f"[embeddings] Manual feature extraction failed: {e}")
        return None


def _fallback_embedding(image: np.ndarray) -> np.ndarray:
    """Lightweight CNN-free embedding using image statistics.
    Not as good as YOLO features but works without GPU/torch issues."""
    # Resize to consistent size
    resized = cv2.resize(image, (128, 128))
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if len(resized.shape) == 3 else resized

    features = []

    # 1. Spatial histogram (8x8 grid of average intensities)
    for r in range(8):
        for c in range(8):
            patch = gray[r*16:(r+1)*16, c*16:(c+1)*16]
            features.append(float(patch.mean()))
            features.append(float(patch.std()))

    # 2. Edge orientation histogram (like HOG-lite)
    sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    mag = np.sqrt(sobelx**2 + sobely**2)
    angle = np.arctan2(sobely, sobelx) * 180 / np.pi
    angle[angle < 0] += 360
    # 12 orientation bins
    for r in range(4):
        for c in range(4):
            patch_mag = mag[r*32:(r+1)*32, c*32:(c+1)*32]
            patch_angle = angle[r*32:(r+1)*32, c*32:(c+1)*32]
            hist, _ = np.histogram(patch_angle, bins=12, range=(0, 360), weights=patch_mag)
            hist_sum = hist.sum()
            if hist_sum > 0:
                hist = hist / hist_sum
            features.extend(hist.tolist())

    # 3. Line density features (important for floor plans)
    edges = cv2.Canny(gray, 50, 150)
    for r in range(4):
        for c in range(4):
            patch = edges[r*32:(r+1)*32, c*32:(c+1)*32]
            features.append(float(patch.sum()) / (32*32*255))

    # 4. Color histogram (if color image)
    if len(resized.shape) == 3:
        for ch in range(3):
            hist = cv2.calcHist([resized], [ch], None, [16], [0, 256]).flatten()
            hist = hist / (hist.sum() + 1e-8)
            features.extend(hist.tolist())

    emb = np.array(features, dtype=np.float32)

    # Pad or truncate to _EMBED_DIM
    if len(emb) < _EMBED_DIM:
        emb = np.pad(emb, (0, _EMBED_DIM - len(emb)))
    elif len(emb) > _EMBED_DIM:
        emb = emb[:_EMBED_DIM]

    # L2 normalize
    norm = np.linalg.norm(emb)
    if norm > 1e-8:
        emb = emb / norm

    return emb


# ── Public API ───────────────────────────────────────────

def compute_embedding(image: np.ndarray, yolo_model_path: str = None) -> np.ndarray:
    """Compute embedding for an image. Uses YOLO backbone if available, fallback otherwise."""
    if yolo_model_path and YOLO is not None and TORCH_AVAILABLE:
        return extract_embedding_yolo(image, yolo_model_path)
    return _fallback_embedding(image)


def cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    """Compute cosine similarity between two embeddings. Returns 0.0 to 1.0.
    Returns 0.0 (rather than raising) on a dimension mismatch — guards against any
    rows stored before the embedding-dimension fix above, which could be shorter
    than _EMBED_DIM."""
    if emb1 is None or emb2 is None:
        return 0.0
    if emb1.shape != emb2.shape:
        return 0.0
    dot = np.dot(emb1, emb2)
    n1 = np.linalg.norm(emb1)
    n2 = np.linalg.norm(emb2)
    if n1 < 1e-8 or n2 < 1e-8:
        return 0.0
    return float(np.clip(dot / (n1 * n2), 0.0, 1.0))


def embedding_to_json(emb: np.ndarray) -> str:
    """Serialize embedding to JSON string for DB storage."""
    return json.dumps(emb.tolist())


def embedding_from_json(json_str: str) -> np.ndarray:
    """Deserialize embedding from JSON string."""
    if not json_str:
        return None
    try:
        return np.array(json.loads(json_str), dtype=np.float32)
    except Exception:
        return None
