"""
MySQL database helper for AI 3D Floor Plan.
Requires: pip install pymysql
"""

import json
import os
import pymysql
import cv2
import numpy as np
from contextlib import contextmanager

from embeddings import compute_embedding, cosine_similarity, embedding_to_json, embedding_from_json

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "user": os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASS", ""),
    "database": os.environ.get("DB_NAME", "ai_3d_floorplan"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
    "unix_socket": os.environ.get("DB_SOCKET", "/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock"),
}


@contextmanager
def get_connection():
    conn = pymysql.connect(**DB_CONFIG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _migrate_schema():
    """Idempotent, best-effort schema migrations applied on module load.
    Failures are non-fatal — degrade gracefully like the rest of this module."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "ALTER TABLE corrections "
                    "ADD COLUMN IF NOT EXISTS proposed_by ENUM('human','ai') NOT NULL DEFAULT 'human'"
                )
                cur.execute(
                    "ALTER TABLE walls "
                    "ADD COLUMN IF NOT EXISTS wall_type ENUM('exterior','interior','half') "
                    "NOT NULL DEFAULT 'interior'"
                )
                # Seed production-score baselines from the currently deployed weights'
                # measured mAP50 (apps/*/runs/*/results.csv), so the regression guard in
                # auto_trainer._should_promote() has something to compare against on the
                # very first auto-retrain after this fix ships. INSERT IGNORE is a no-op
                # if a real score was already recorded by a prior promotion.
                cur.execute(
                    "INSERT IGNORE INTO training_config (config_key, config_value, description) "
                    "VALUES "
                    "('wall_yolo_production_score', '0.759', 'Seeded from production wall_yolo results.csv'), "
                    "('door_yolo_production_score', '0.959', 'Seeded from production door_yolo results.csv'), "
                    "('room_object_yolo_production_score', '0.751', 'Seeded from production room_object_yolo results.csv')"
                )
    except Exception as e:
        print(f"[db] Schema migration skipped (non-fatal): {e}")


_migrate_schema()


# -----------------------------------------------------------
# Floor Plans
# -----------------------------------------------------------

def save_floor_plan(filename: str, image_path: str, width: int = None, height: int = None,
                    image_hash: str = None, embedding: np.ndarray = None) -> int:
    """Save a floor plan entry. Stores embedding as JSON in the DB."""
    emb_json = embedding_to_json(embedding) if embedding is not None else None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO floor_plans (filename, image_path, image_width, image_height, "
                "image_hash, embedding, status) VALUES (%s, %s, %s, %s, %s, %s, 'uploaded')",
                (filename, image_path, width, height, image_hash, emb_json),
            )
            return cur.lastrowid


def save_embedding(fp_id: int, embedding: np.ndarray):
    """Update the embedding for an existing floor plan."""
    emb_json = embedding_to_json(embedding)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE floor_plans SET embedding = %s WHERE id = %s", (emb_json, fp_id))


def find_similar_by_embedding(query_emb: np.ndarray, min_similarity: float = 0.70) -> list:
    """Find floor plans whose embeddings are similar to query_emb.
    Uses cosine similarity. Returns list sorted by similarity (highest first)."""
    if query_emb is None:
        return []
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, embedding FROM floor_plans WHERE embedding IS NOT NULL")
            rows = cur.fetchall()
    matches = []
    for r in rows:
        stored_emb = embedding_from_json(r["embedding"])
        if stored_emb is None:
            continue
        sim = cosine_similarity(query_emb, stored_emb)
        if sim >= min_similarity:
            matches.append({"id": r["id"], "similarity": round(sim, 4)})
    matches.sort(key=lambda x: x["similarity"], reverse=True)
    return matches


def get_floor_plan_by_hash(image_hash: str) -> dict:
    """Return the most-recent floor_plan row with the given SHA-256 hash that has corrections.
    Falls back to most-recent row with the hash if none have corrections."""
    if not image_hash:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Prefer rows with user corrections
            cur.execute(
                "SELECT fp.* FROM floor_plans fp "
                "WHERE fp.image_hash = %s "
                "AND EXISTS (SELECT 1 FROM walls w WHERE w.floor_plan_id = fp.id "
                "            AND w.is_active = 1 AND w.source IN ('corrected','manual')) "
                "ORDER BY fp.id DESC LIMIT 1",
                (image_hash,),
            )
            row = cur.fetchone()
            if row:
                return row
            cur.execute(
                "SELECT * FROM floor_plans WHERE image_hash = %s ORDER BY id DESC LIMIT 1",
                (image_hash,),
            )
            return cur.fetchone()


def get_data_by_floor_plan_id(fp_id: int) -> dict:
    """Load walls/doors/objects for a specific floor_plan_id."""
    if not fp_id:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM walls WHERE floor_plan_id = %s AND is_active = 1 "
                "ORDER BY FIELD(source, 'corrected', 'manual', 'auto') DESC, id DESC",
                (fp_id,),
            )
            all_walls = cur.fetchall()
            cur.execute(
                "SELECT * FROM doors WHERE floor_plan_id = %s AND is_active = 1 "
                "ORDER BY FIELD(source, 'corrected', 'manual', 'auto') DESC, id DESC",
                (fp_id,),
            )
            all_doors = cur.fetchall()
            cur.execute(
                "SELECT * FROM objects WHERE floor_plan_id = %s AND is_active = 1 "
                "ORDER BY FIELD(source, 'corrected', 'manual', 'auto') DESC, id DESC",
                (fp_id,),
            )
            all_objects = cur.fetchall()

    has_corrections = any(w["source"] in ("corrected", "manual") for w in all_walls) or \
                      any(d["source"] in ("corrected", "manual") for d in all_doors)
    if not has_corrections:
        return None

    return {
        "walls": _dedupe_walls(all_walls),
        "doors": _dedupe_doors(all_doors),
        "objects": _dedupe_objects(all_objects),
        "source_fp_ids": [fp_id],
        "match_type": "exact_hash",
        "similarity": 1.0,
    }


def get_best_data_for_image(query_emb: np.ndarray = None, min_similarity: float = 0.97) -> dict:
    """Get the best corrected data for a similar image using YOLO embeddings.
    1. Find similar floor plans by embedding cosine similarity (>= min_similarity)
    2. Of those, pick the one with HIGHEST similarity that actually has user corrections
    3. Return its walls/doors/objects
    """
    if query_emb is None:
        return None

    similar = find_similar_by_embedding(query_emb, min_similarity)
    if not similar:
        return None

    # Pick the BEST (highest-similarity) floor_plan among those with user corrections.
    best_fp_id = None
    best_sim = 0.0
    with get_connection() as conn:
        with conn.cursor() as cur:
            for s in similar:  # already sorted by similarity desc
                cur.execute(
                    "SELECT COUNT(*) AS c FROM walls "
                    "WHERE floor_plan_id = %s AND is_active = 1 "
                    "AND source IN ('corrected', 'manual')",
                    (s["id"],),
                )
                row = cur.fetchone()
                w_count = row["c"] if row else 0
                cur.execute(
                    "SELECT COUNT(*) AS c FROM doors "
                    "WHERE floor_plan_id = %s AND is_active = 1 "
                    "AND source IN ('corrected', 'manual')",
                    (s["id"],),
                )
                row = cur.fetchone()
                d_count = row["c"] if row else 0
                if (w_count > 0 or d_count > 0) and s["similarity"] > best_sim:
                    best_fp_id = s["id"]
                    best_sim = s["similarity"]
            # similar is already sorted desc; the first match we found IS the best,
            # but the explicit > check makes intent clear and protects against unsorted input.

    if best_fp_id is None:
        return None

    fp_ids = [best_fp_id]
    match_type = f"embedding (similarity={best_sim})"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM walls WHERE floor_plan_id = %s AND is_active = 1 "
                "ORDER BY FIELD(source, 'corrected', 'manual', 'auto') DESC, id DESC",
                (best_fp_id,),
            )
            all_walls = cur.fetchall()

            cur.execute(
                "SELECT * FROM doors WHERE floor_plan_id = %s AND is_active = 1 "
                "ORDER BY FIELD(source, 'corrected', 'manual', 'auto') DESC, id DESC",
                (best_fp_id,),
            )
            all_doors = cur.fetchall()

            cur.execute(
                "SELECT * FROM objects WHERE floor_plan_id = %s AND is_active = 1 "
                "ORDER BY FIELD(source, 'corrected', 'manual', 'auto') DESC, id DESC",
                (best_fp_id,),
            )
            all_objects = cur.fetchall()

    # Check if we have any corrected/manual data
    has_corrections = any(w["source"] in ("corrected", "manual") for w in all_walls) or \
                      any(d["source"] in ("corrected", "manual") for d in all_doors)

    if not has_corrections:
        return None

    walls = _dedupe_walls(all_walls)
    doors = _dedupe_doors(all_doors)
    objects_ = _dedupe_objects(all_objects)

    return {
        "walls": walls,
        "doors": doors,
        "objects": objects_,
        "source_fp_ids": fp_ids,
        "match_type": match_type,
        "similarity": best_sim,
    }


def _dedupe_walls(rows, threshold=0.3):
    """Deduplicate walls by proximity, preferring corrected sources."""
    result = []
    for r in rows:
        w = {
            "start": {"x": r["start_x"], "y": r["start_y"]},
            "end": {"x": r["end_x"], "y": r["end_y"]},
            "height": r.get("height", 3.0),
            "thickness": r.get("thickness", 0.15),
            "wall_type": r.get("wall_type", "interior"),
            "source": r["source"],
        }
        # Check if a similar wall already exists
        duplicate = False
        for existing in result:
            d1 = ((w["start"]["x"] - existing["start"]["x"])**2 + (w["start"]["y"] - existing["start"]["y"])**2)**0.5
            d2 = ((w["end"]["x"] - existing["end"]["x"])**2 + (w["end"]["y"] - existing["end"]["y"])**2)**0.5
            if d1 < threshold and d2 < threshold:
                duplicate = True
                break
            # Also check reversed
            d1r = ((w["start"]["x"] - existing["end"]["x"])**2 + (w["start"]["y"] - existing["end"]["y"])**2)**0.5
            d2r = ((w["end"]["x"] - existing["start"]["x"])**2 + (w["end"]["y"] - existing["start"]["y"])**2)**0.5
            if d1r < threshold and d2r < threshold:
                duplicate = True
                break
        if not duplicate:
            result.append(w)
    return result


def _dedupe_doors(rows, threshold=0.3):
    result = []
    for r in rows:
        d = {
            "bbox": {"x1": r["bbox_x1"], "y1": r["bbox_y1"], "x2": r["bbox_x2"], "y2": r["bbox_y2"]},
            "class": "Door",
            "source": r["source"],
        }
        cx = (r["bbox_x1"] + r["bbox_x2"]) / 2
        cy = (r["bbox_y1"] + r["bbox_y2"]) / 2
        duplicate = False
        for existing in result:
            ecx = (existing["bbox"]["x1"] + existing["bbox"]["x2"]) / 2
            ecy = (existing["bbox"]["y1"] + existing["bbox"]["y2"]) / 2
            if ((cx - ecx)**2 + (cy - ecy)**2)**0.5 < threshold:
                duplicate = True
                break
        if not duplicate:
            result.append(d)
    return result


def _dedupe_objects(rows, threshold=0.3):
    result = []
    for r in rows:
        o = {
            "bbox": {"x1": r["bbox_x1"], "y1": r["bbox_y1"], "x2": r["bbox_x2"], "y2": r["bbox_y2"]},
            "class": r["class_name"],
            "source": r.get("source", "auto"),
        }
        cx = (r["bbox_x1"] + r["bbox_x2"]) / 2
        cy = (r["bbox_y1"] + r["bbox_y2"]) / 2
        duplicate = False
        for existing in result:
            ecx = (existing["bbox"]["x1"] + existing["bbox"]["x2"]) / 2
            ecy = (existing["bbox"]["y1"] + existing["bbox"]["y2"]) / 2
            if ((cx - ecx)**2 + (cy - ecy)**2)**0.5 < threshold:
                duplicate = True
                break
        if not duplicate:
            result.append(o)
    return result


def update_floor_plan_status(fp_id: int, status: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE floor_plans SET status = %s WHERE id = %s", (status, fp_id))


def get_floor_plan(fp_id: int) -> dict:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM floor_plans WHERE id = %s", (fp_id,))
            return cur.fetchone()


def get_all_floor_plans() -> list:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM v_floor_plan_summary ORDER BY created_at DESC")
            return cur.fetchall()


# -----------------------------------------------------------
# Walls
# -----------------------------------------------------------

def save_walls(fp_id: int, walls: list, source: str = "auto") -> list:
    ids = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            for w in walls:
                start = w.get("start", {})
                end = w.get("end", {})
                cur.execute(
                    "INSERT INTO walls (floor_plan_id, start_x, start_y, end_x, end_y, "
                    "height, thickness, wall_type, source, confidence) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (
                        fp_id,
                        start.get("x", 0), start.get("y", 0),
                        end.get("x", 0), end.get("y", 0),
                        w.get("height", 3.0), w.get("thickness", 0.15),
                        w.get("wall_type", "interior"),
                        source, w.get("confidence"),
                    ),
                )
                ids.append(cur.lastrowid)
    return ids


def get_walls(fp_id: int, active_only: bool = True) -> list:
    with get_connection() as conn:
        with conn.cursor() as cur:
            q = "SELECT * FROM walls WHERE floor_plan_id = %s"
            if active_only:
                q += " AND is_active = 1"
            cur.execute(q, (fp_id,))
            rows = cur.fetchall()
            return [
                {
                    "id": r["id"],
                    "start": {"x": r["start_x"], "y": r["start_y"]},
                    "end": {"x": r["end_x"], "y": r["end_y"]},
                    "height": r["height"],
                    "thickness": r["thickness"],
                    "wall_type": r.get("wall_type", "interior"),
                    "source": r["source"],
                }
                for r in rows
            ]


def update_wall(wall_id: int, start: dict = None, end: dict = None, source: str = None,
                wall_type: str = None):
    sets, params = [], []
    if start:
        sets += ["start_x = %s", "start_y = %s"]
        params += [start.get("x", 0), start.get("y", 0)]
    if end:
        sets += ["end_x = %s", "end_y = %s"]
        params += [end.get("x", 0), end.get("y", 0)]
    if source:
        sets.append("source = %s")
        params.append(source)
    if wall_type:
        sets.append("wall_type = %s")
        params.append(wall_type)
    if not sets:
        return
    params.append(wall_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE walls SET {', '.join(sets)} WHERE id = %s", params)


def deactivate_wall(wall_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE walls SET is_active = 0 WHERE id = %s", (wall_id,))


# -----------------------------------------------------------
# Doors
# -----------------------------------------------------------

def save_doors(fp_id: int, doors: list, source: str = "auto") -> list:
    ids = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            for d in doors:
                bbox = d.get("bbox", {})
                cur.execute(
                    "INSERT INTO doors (floor_plan_id, bbox_x1, bbox_y1, bbox_x2, bbox_y2, "
                    "swing_dir, source, confidence) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                    (
                        fp_id,
                        bbox.get("x1", 0), bbox.get("y1", 0),
                        bbox.get("x2", 0), bbox.get("y2", 0),
                        d.get("swing_dir", "auto"), source, d.get("confidence"),
                    ),
                )
                ids.append(cur.lastrowid)
    return ids


def get_doors(fp_id: int, active_only: bool = True) -> list:
    with get_connection() as conn:
        with conn.cursor() as cur:
            q = "SELECT * FROM doors WHERE floor_plan_id = %s"
            if active_only:
                q += " AND is_active = 1"
            cur.execute(q, (fp_id,))
            rows = cur.fetchall()
            return [
                {
                    "id": r["id"],
                    "bbox": {"x1": r["bbox_x1"], "y1": r["bbox_y1"], "x2": r["bbox_x2"], "y2": r["bbox_y2"]},
                    "swing_dir": r["swing_dir"],
                    "source": r["source"],
                }
                for r in rows
            ]


def update_door(door_id: int, bbox: dict = None, swing_dir: str = None, source: str = None):
    sets, params = [], []
    if bbox:
        sets += ["bbox_x1 = %s", "bbox_y1 = %s", "bbox_x2 = %s", "bbox_y2 = %s"]
        params += [bbox.get("x1", 0), bbox.get("y1", 0), bbox.get("x2", 0), bbox.get("y2", 0)]
    if swing_dir:
        sets.append("swing_dir = %s")
        params.append(swing_dir)
    if source:
        sets.append("source = %s")
        params.append(source)
    if not sets:
        return
    params.append(door_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE doors SET {', '.join(sets)} WHERE id = %s", params)


def deactivate_door(door_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE doors SET is_active = 0 WHERE id = %s", (door_id,))


# -----------------------------------------------------------
# Objects (rooms, furniture, appliances)
# -----------------------------------------------------------

def save_objects(fp_id: int, objects: list, source: str = "auto") -> list:
    ids = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            for o in objects:
                bbox = o.get("bbox", {})
                cur.execute(
                    "INSERT INTO objects (floor_plan_id, class_name, bbox_x1, bbox_y1, bbox_x2, bbox_y2, "
                    "confidence, source) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                    (
                        fp_id,
                        o.get("class", "unknown"),
                        bbox.get("x1", 0), bbox.get("y1", 0),
                        bbox.get("x2", 0), bbox.get("y2", 0),
                        o.get("confidence"), source,
                    ),
                )
                ids.append(cur.lastrowid)
    return ids


def get_objects(fp_id: int, active_only: bool = True) -> list:
    with get_connection() as conn:
        with conn.cursor() as cur:
            q = "SELECT * FROM objects WHERE floor_plan_id = %s"
            if active_only:
                q += " AND is_active = 1"
            cur.execute(q, (fp_id,))
            rows = cur.fetchall()
            return [
                {
                    "id": r["id"],
                    "class": r["class_name"],
                    "bbox": {"x1": r["bbox_x1"], "y1": r["bbox_y1"], "x2": r["bbox_x2"], "y2": r["bbox_y2"]},
                    "confidence": r["confidence"],
                    "source": r["source"],
                }
                for r in rows
            ]


def update_object(object_id: int, class_name: str = None, bbox: dict = None, source: str = None):
    sets, params = [], []
    if class_name:
        sets.append("class_name = %s")
        params.append(class_name)
    if bbox:
        sets += ["bbox_x1 = %s", "bbox_y1 = %s", "bbox_x2 = %s", "bbox_y2 = %s"]
        params += [bbox.get("x1", 0), bbox.get("y1", 0), bbox.get("x2", 0), bbox.get("y2", 0)]
    if source:
        sets.append("source = %s")
        params.append(source)
    if not sets:
        return
    params.append(object_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE objects SET {', '.join(sets)} WHERE id = %s", params)


def deactivate_object(object_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE objects SET is_active = 0 WHERE id = %s", (object_id,))


# -----------------------------------------------------------
# Corrections
# -----------------------------------------------------------

def save_correction(fp_id: int, entity_type: str, entity_id: int,
                    action: str, old_data: dict = None, new_data: dict = None,
                    proposed_by: str = "human") -> int:
    if entity_id is None:
        print(f"[db] Skipping correction insert with null entity_id (fp_id={fp_id}, entity_type={entity_type}, action={action})")
        return 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO corrections (floor_plan_id, entity_type, entity_id, action, old_data, new_data, proposed_by) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (fp_id, entity_type, entity_id, action,
                 json.dumps(old_data) if old_data else None,
                 json.dumps(new_data) if new_data else None,
                 proposed_by),
            )
            return cur.lastrowid


def get_pending_corrections(entity_type: str = None) -> list:
    with get_connection() as conn:
        with conn.cursor() as cur:
            if entity_type:
                cur.execute(
                    "SELECT * FROM v_pending_corrections WHERE entity_type = %s",
                    (entity_type,),
                )
            else:
                cur.execute("SELECT * FROM v_pending_corrections")
            return cur.fetchall()


def mark_corrections_trained(correction_ids: list):
    if not correction_ids:
        return
    with get_connection() as conn:
        with conn.cursor() as cur:
            placeholders = ",".join(["%s"] * len(correction_ids))
            cur.execute(
                f"UPDATE corrections SET applied_to_training = 1 WHERE id IN ({placeholders})",
                correction_ids,
            )


# -----------------------------------------------------------
# Training Logs
# -----------------------------------------------------------

def create_training_log(trigger_type: str, model_type: str, fp_id: int = None) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO training_logs (trigger_type, trigger_floor_plan_id, model_type, status) "
                "VALUES (%s,%s,%s,'queued')",
                (trigger_type, fp_id, model_type),
            )
            return cur.lastrowid


def update_training_log(log_id: int, **kwargs):
    if not kwargs:
        return
    cols = []
    vals = []
    for k, v in kwargs.items():
        cols.append(f"{k} = %s")
        vals.append(v)
    vals.append(log_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE training_logs SET {', '.join(cols)} WHERE id = %s", vals)


# -----------------------------------------------------------
# Training Config
# -----------------------------------------------------------

def get_config(key: str, default: str = None) -> str:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT config_value FROM training_config WHERE config_key = %s", (key,))
            row = cur.fetchone()
            return row["config_value"] if row else default


def get_all_config() -> dict:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT config_key, config_value FROM training_config")
            return {r["config_key"]: r["config_value"] for r in cur.fetchall()}


def set_config(key: str, value: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO training_config (config_key, config_value) VALUES (%s, %s) "
                "ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
                (key, value),
            )


# -----------------------------------------------------------
# Stats
# -----------------------------------------------------------

def get_stats() -> dict:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM floor_plans")
            total_fp = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) AS c FROM walls WHERE is_active = 1")
            total_walls = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) AS c FROM doors WHERE is_active = 1")
            total_doors = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) AS c FROM objects WHERE is_active = 1")
            total_objects = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) AS c FROM corrections WHERE applied_to_training = 0")
            pending_corrections = cur.fetchone()["c"]
            cur.execute(
                "SELECT * FROM training_logs ORDER BY created_at DESC LIMIT 1"
            )
            last_training = cur.fetchone()
            return {
                "floor_plans": total_fp,
                "walls": total_walls,
                "doors": total_doors,
                "objects": total_objects,
                "pending_corrections": pending_corrections,
                "last_training": last_training,
            }
