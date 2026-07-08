import asyncio
import os
from collections import Counter


STRUCTURAL_CLASSES = {
    "pillar",
    "window",
    "glass-window",
    "glass-wall",
    "glass-grill",
    "stairs",
    "lift",
}


def _normalize_class_name(class_name: str) -> str:
    normalized = " ".join(str(class_name or "").strip().lower().replace("_", " ").split())
    synonyms = {
        "column": "pillar",
        "columns": "pillar",
        "pillars": "pillar",
        "window panel": "window",
        "windows": "window",
        "glass window": "glass-window",
        "glass windows": "glass-window",
        "glasswall": "glass-wall",
        "glass wall": "glass-wall",
        "glass walls": "glass-wall",
        "grill": "glass-grill",
        "grills": "glass-grill",
        "window grill": "glass-grill",
        "window grills": "glass-grill",
        "grill window": "glass-grill",
        "glass grill": "glass-grill",
        "glass grills": "glass-grill",
        "stair": "stairs",
        "staircase": "stairs",
        "staircases": "stairs",
        "elevator": "lift",
        "elevators": "lift",
        "elevator shaft": "lift",
    }
    return synonyms.get(normalized, normalized)


def evaluate_detection_quality(objects: list, low_conf_threshold: float = 0.25) -> dict:
    total = len(objects or [])
    structural_total = 0
    structural_low_conf = 0
    by_class = Counter()

    for obj in objects or []:
        cls = _normalize_class_name(obj.get("class"))
        conf = float(obj.get("confidence", 0.0) or 0.0)
        by_class[cls] += 1
        if cls in STRUCTURAL_CLASSES:
            structural_total += 1
            if conf < low_conf_threshold:
                structural_low_conf += 1

    structural_low_conf_rate = (
        (structural_low_conf / structural_total) if structural_total > 0 else 0.0
    )
    return {
        "objects_total": total,
        "objects_by_class": dict(by_class),
        "structural_total": structural_total,
        "structural_low_conf": structural_low_conf,
        "structural_low_conf_rate": round(structural_low_conf_rate, 4),
        "low_conf_threshold": low_conf_threshold,
    }


def run_detection_review(
    ai_module,
    image_bytes: bytes,
    walls: list,
    doors: list,
    objects: list,
    max_review_objects: int,
    structural_pass_enabled: bool,
) -> dict:
    review_objects = list(objects or [])
    truncated = False
    if len(review_objects) > max_review_objects:
        review_objects = review_objects[:max_review_objects]
        truncated = True

    review = ai_module.review_detections_with_vision(
        image_bytes, walls, doors, review_objects
    )
    structural_review = {"corrections": [], "summary": None, "error": None}
    if structural_pass_enabled:
        if USE_ADK_SDK:
            structural_review = review_structural_elements_with_adk_sdk(image_bytes)
        elif hasattr(ai_module, "review_structural_elements_with_vision"):
            structural_review = ai_module.review_structural_elements_with_vision(image_bytes)

    corrections = list(review.get("corrections", [])) + list(
        structural_review.get("corrections", [])
    )
    summary = " ".join(
        s for s in [review.get("summary"), structural_review.get("summary")] if s
    ) or None
    error = "; ".join(
        e for e in [review.get("error"), structural_review.get("error")] if e
    ) or None

    metrics = evaluate_detection_quality(objects)
    metrics["review_objects_count"] = len(review_objects)
    metrics["review_truncated"] = truncated

    return {
        "corrections": corrections,
        "summary": summary,
        "error": error,
        "metrics": metrics,
    }


# ── Experimental: same structural review, routed through the real google-adk SDK ──
# (google.adk.agents.Agent + Runner) instead of calling google.generativeai directly.
# Gated behind USE_ADK_SDK so it never runs unless explicitly opted into; the existing
# Gemini-direct path above (and in ai_assistant.py) is untouched.

USE_ADK_SDK = os.environ.get("USE_ADK_SDK", "0").lower() in ("1", "true", "yes")

_adk_agent = None
_adk_runner = None


def _get_adk_agent():
    global _adk_agent, _adk_runner
    if _adk_agent is not None:
        return _adk_agent, _adk_runner

    from google.adk.agents import Agent
    from google.adk.runners import InMemoryRunner

    # Prefer a dedicated free-tier key for the ADK path so it doesn't share the
    # spend cap/quota of the main GEMINI_API_KEY used by ai_assistant.py.
    adk_key = os.environ.get("ADK_GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if adk_key:
        os.environ["GOOGLE_API_KEY"] = adk_key

    model_name = os.environ.get("ADK_GEMINI_MODEL", "gemini-2.5-flash")
    _adk_agent = Agent(
        name="structural_reviewer",
        model=model_name,
        instruction=_STRUCTURAL_REVIEW_PROMPT_FOR_ADK,
    )
    _adk_runner = InMemoryRunner(agent=_adk_agent, app_name="floorplan-structural-review")
    return _adk_agent, _adk_runner


# Same content/rules as ai_assistant.STRUCTURAL_REVIEW_PROMPT, duplicated here so this
# experimental path has no import-time dependency on ai_assistant.py.
_STRUCTURAL_REVIEW_PROMPT_FOR_ADK = """You are a careful architectural floor-plan reviewer. A YOLO model has already run and
detected windows, pillars, and glass elements. Your job is ONLY to add the ones it clearly missed —
not to re-detect everything from scratch.

Be conservative: only add an object when you are highly confident (>80% sure) it is present and
was not already detected. Prefer precision over recall — a false positive is worse than a missed box.

What to look for (ONLY add if clearly not already in the existing detections):
- Pillars/columns: small filled or hatched squares/rectangles at wall corners or wall junctions.
  Do NOT mark door frames, double-door dividers, or anything inside a door opening as a pillar.
- Windows: clear gaps/notches along exterior walls only. Do not add windows on interior walls.
- Glass windows / glass walls: dashed or double-line wall segments clearly showing a glass partition.
- Glass grills: grill/bar patterns on windows or balcony openings.
- Stairs: clearly visible stair footprints (stepped outline or hatch pattern).
- Lift: labeled elevator/lift shaft near lobby or core.

Return ONLY raw JSON (no markdown fences, no prose) using this format:
{
  "corrections": [
    {
      "entity_type": "object",
      "action": "add",
      "class": "pillar" | "window" | "glass-window" | "glass-wall" | "glass-grill" | "stairs" | "lift",
      "bbox": {"x1": 0, "y1": 0, "x2": 0, "y2": 0},
      "reason": "<short reason>"
    }
  ],
  "summary": "<brief summary, including how many of each class you found>"
}

Rules:
- Do NOT return walls or doors here.
- Only return add actions for objects clearly missed by the YOLO model.
- Do NOT add objects you are uncertain about.
- If none found, return {"corrections": [], "summary": "No structural additions needed."}
"""


def _parse_adk_json(text: str) -> dict:
    import json
    import re

    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.MULTILINE).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
    return {"corrections": [], "summary": None}


async def _run_adk_structural_review_async(image_bytes: bytes) -> dict:
    from google.genai import types

    agent, runner = _get_adk_agent()
    user_id, session_id = "floorplan-test-user", "floorplan-test-session"
    await runner.session_service.create_session(
        app_name=runner.app_name, user_id=user_id, session_id=session_id
    )

    message = types.Content(
        role="user",
        parts=[
            types.Part.from_text(text="Review this floor plan image for structural elements."),
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
        ],
    )

    final_text = ""
    async for event in runner.run_async(
        user_id=user_id, session_id=session_id, new_message=message
    ):
        if event.is_final_response() and event.content and event.content.parts:
            final_text = "".join(p.text or "" for p in event.content.parts)

    return _parse_adk_json(final_text)


def review_structural_elements_with_adk_sdk(image_bytes: bytes) -> dict:
    """Experimental twin of ai_assistant.review_structural_elements_with_vision, but
    calling Gemini through the real google-adk SDK (Agent + Runner) instead of
    google.generativeai directly. Same input/output contract. Never raises."""
    try:
        result = asyncio.run(_run_adk_structural_review_async(image_bytes))
    except Exception as e:
        print(f"[adk-sdk] Structural review error: {e}")
        return {"corrections": [], "summary": None, "error": str(e)}

    allowed = {"pillar", "window", "glass-window", "glass-wall", "glass-grill", "stairs", "lift"}
    filtered = []
    for c in result.get("corrections", []):
        if c.get("entity_type") != "object" or c.get("action") != "add":
            continue
        cls = str(c.get("class") or "").strip().lower()
        if cls not in allowed:
            continue
        bbox = c.get("bbox")
        if not isinstance(bbox, dict) or not all(k in bbox for k in ("x1", "y1", "x2", "y2")):
            continue
        filtered.append(c)

    return {"corrections": filtered, "summary": result.get("summary"), "error": None}
