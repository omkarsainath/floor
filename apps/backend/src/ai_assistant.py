"""
AI Assistant for 3D Floor Plan Viewer.
Uses Google Gemini (free tier) for:
  1. Room detection from wall layout
  2. Auto-furnish rooms with appropriate furniture
  3. Interior design suggestions
  4. Chat-based scene modifications
"""

import json
import os

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None
    print("[ai] python-dotenv not installed; continuing with process environment only.")

if load_dotenv is not None:
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("[ai] google-generativeai not installed. Run: pip install google-generativeai")

# ── Config ────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# Use 2.5-flash for better floor-plan review quality; override via GEMINI_MODEL.
GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
_model = None

SYSTEM_PROMPT = """You are an AI interior design assistant for a 3D floor plan viewer.
You help users with:
1. Identifying room types from wall layouts
2. Placing furniture in rooms
3. Suggesting interior design styles, colors, and materials
4. Modifying the 3D scene based on user requests

IMPORTANT: When the user asks you to add, move, or remove objects, or change materials,
you MUST respond with a JSON action block that the frontend can parse.

Available object types you can place:
bed, sofa, chair, accent chair, table, dining table, coffee table, study table,
side table, tv, wardrobe, fridge, stove, kitchen-slab, sink, washing machine,
commode, crockery unit, foyer cabinet, book cabinet, breakfast counter, stairs, door, window

Available floor materials: wood, tile, marble, carpet

Response format rules:
- Always include a "message" field with your text response to the user.
- If you need to modify the scene, include an "actions" array.
- Each action has a "type" and relevant parameters.

Action types:
1. "add_object" - Add furniture
   {"type": "add_object", "object_type": "sofa", "x": 5.0, "z": 3.0, "width": 2.0, "depth": 0.8}

2. "remove_object" - Remove by label/type
   {"type": "remove_object", "object_type": "sofa", "near_x": 5.0, "near_z": 3.0}

3. "change_floor" - Change floor material
   {"type": "change_floor", "material": "wood"}

4. "change_wall_color" - Change wall color
   {"type": "change_wall_color", "color": "#f5f2ed"}

5. "detect_rooms" - Identify rooms from the layout
   {"type": "detect_rooms"}

6. "auto_furnish" - Auto-place furniture in all rooms
   {"type": "auto_furnish"}

Always respond in valid JSON format:
{
  "message": "your helpful response text",
  "actions": [...]
}
If no actions are needed (just chatting), use an empty actions array.
"""

VISION_REVIEW_PROMPT = """You are a meticulous architectural floor-plan reviewer.
You will be shown a floor plan image, plus a numbered list of detections a YOLO model
already made (walls, doors, and room/furniture objects) for that same image. Your job:

1. Check each existing detection against the actual image. If its class is wrong (e.g.
   labeled "Chair" but it's clearly a "Sofa"), or its bounding box is badly wrong (covers
   the wrong area or a different object entirely), propose a "modify" correction.
2. If a detection corresponds to nothing real in the image, propose a "delete" correction.
3. Look for any wall, door, or furniture/room object clearly visible in the image that is
   MISSING from the list entirely, and propose an "add" correction with its class and a
   tight bounding box in the same pixel coordinate space as the existing detections.
   Include structural objects too (e.g., pillar/column shafts, windows, grills, glass partitions,
   stairs, and lifts).
   Use these canonical class names when relevant: "pillar", "window", "glass-window",
   "glass-wall", "glass-grill", "stairs", "lift".
4. Be conservative: only propose a correction when you are reasonably confident. Do not
   relabel or invent objects you can't actually see in the image.

Bounding boxes must be {"x1": float, "y1": float, "x2": float, "y2": float} in image pixel
coordinates, matching the scale of the detections you were given.

Respond with ONLY this JSON shape, no other text:
{
  "corrections": [
    {
      "entity_type": "wall" | "door" | "object",
      "action": "modify" | "delete" | "add",
      "index": <int, required for modify/delete — the number from the list you were given>,
      "class": "<string, required for object on modify/add>",
      "bbox": {"x1": 0, "y1": 0, "x2": 0, "y2": 0},
      "reason": "<short reason, one sentence>"
    }
  ],
  "summary": "<one or two sentence summary of what you changed and why>"
}
If you find no issues and nothing missing, respond with {"corrections": [], "summary": "No changes needed."}
"""

STRUCTURAL_REVIEW_PROMPT = """You are a meticulous architectural floor-plan reviewer focused on structural objects.
You will be shown a floor plan image. The detection model that ran before you has NEVER been
trained on pillars/columns, windows, glass windows, glass wall/partitions, or glass grills —
so you are the ONLY source for these structural classes. Treat this as a careful manual count,
not a quick scan.

Scan systematically, room by room and corner by corner:
- Pillars/columns: usually small filled or hatched squares/rectangles at wall corners, wall
  junctions, or free-standing within a room (structural columns). Do NOT mark a door's leaf
  divider, door frame, or the gap/line between two adjacent door panels (a double door) as a
  pillar — those belong to the door, not a structural column. A pillar must sit on solid wall
  or floor space, never inside a door opening.
- Windows: gaps/marks along exterior walls, often near balconies or facades.
- Glass windows / glass walls: dashed or double-line wall segments, often around balconies,
  terraces, or interior glass partitions — visually distinct from solid wall lines.
- Glass grills: grill/bar-like protective patterns or screened openings on windows,
  balconies, utility shafts, or facades.
- Stairs: straight/spiral stair blocks or staircase footprints.
- Lift: elevator shaft/core labeled lift/elevator, usually near lobby/passage cores.
Include every instance you can see, even small or partially obscured ones — for these
structural classes, a missed detection is worse than an extra box, as long as you are not
duplicating a box for the same visible element.

Return your findings using this JSON format:
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
- Only return add actions.
- Avoid duplicate boxes for the same visible element, but do not skip real instances for fear of over-reporting.
- If none found, return {"corrections": [], "summary": "No structural additions needed."}
"""


_configured = False


def _parse_model_json(text: str, fallback: dict | None = None) -> dict:
    """Parse JSON from model output, handling markdown fences and extra prose."""
    fallback = fallback or {"message": "AI response parsing failed.", "actions": []}
    if not text:
        return fallback

    raw = text.strip()
    try:
        return json.loads(raw)
    except Exception:
        pass

    if raw.startswith("```"):
        lines = raw.splitlines()
        if len(lines) >= 2:
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            fenced = "\n".join(lines).strip()
            try:
                return json.loads(fenced)
            except Exception:
                pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        snippet = raw[start:end + 1]
        try:
            return json.loads(snippet)
        except Exception:
            pass

    return fallback


def _ensure_configured() -> bool:
    """Configure the Gemini SDK once (API key + transport). Safe to call repeatedly."""
    global _configured
    if _configured:
        return True
    if not GEMINI_AVAILABLE:
        return False
    if not GEMINI_API_KEY:
        print("[ai] GEMINI_API_KEY not set. Export it: export GEMINI_API_KEY=your_key")
        return False
    try:
        genai.configure(api_key=GEMINI_API_KEY, transport="rest")
        _configured = True
        return True
    except Exception as e:
        print(f"[ai] Failed to configure Gemini: {e}")
        return False


def _get_model():
    """Initialize and cache the Gemini chat/design model."""
    global _model
    if _model is not None:
        return _model
    if not _ensure_configured():
        return None
    try:
        _model = genai.GenerativeModel(
            GEMINI_MODEL_NAME,
            system_instruction=SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.7,
                max_output_tokens=2048,
            ),
        )
        print(f"[ai] Gemini model initialized ({GEMINI_MODEL_NAME})")
        return _model
    except Exception as e:
        print(f"[ai] Failed to initialize Gemini: {e}")
        return None


def _build_context(layout_data: dict) -> str:
    """Build context string from the current floor plan layout."""
    walls = layout_data.get("walls", [])
    objects = layout_data.get("objects", [])
    rooms = layout_data.get("rooms", [])

    # Compute bounding box
    xs, ys = [], []
    for w in walls:
        if w.get("start") and w.get("end"):
            xs.extend([w["start"]["x"], w["end"]["x"]])
            ys.extend([w["start"]["y"], w["end"]["y"]])

    bounds = ""
    if xs and ys:
        bounds = f"Floor plan bounds: x=[{min(xs):.1f}, {max(xs):.1f}], y=[{min(ys):.1f}, {max(ys):.1f}]"

    ctx = f"""Current floor plan state:
- {len(walls)} walls
- {len(objects)} objects: {', '.join(set(o.get('class','?') for o in objects)) or 'none'}
- {len(rooms)} defined rooms: {', '.join(r.get('type', r.get('name','?')) for r in rooms) or 'none'}
- {bounds}

Wall coordinates (x,y start -> end):
"""
    for i, w in enumerate(walls[:30]):  # Limit to avoid token overflow
        s, e = w.get("start", {}), w.get("end", {})
        ctx += f"  Wall {i}: ({s.get('x',0):.1f},{s.get('y',0):.1f}) -> ({e.get('x',0):.1f},{e.get('y',0):.1f})\n"

    if objects:
        ctx += "\nExisting objects:\n"
        for o in objects[:20]:
            b = o.get("bbox", {})
            ctx += f"  {o.get('class','?')}: bbox({b.get('x1',0):.1f},{b.get('y1',0):.1f})-({b.get('x2',0):.1f},{b.get('y2',0):.1f})\n"

    return ctx


# ── Room Detection ───────────────────────────────────────

def detect_rooms_from_layout(layout_data: dict) -> dict:
    """Use AI to identify room types from wall layout."""
    model = _get_model()
    if model is None:
        return _fallback_room_detection(layout_data)

    context = _build_context(layout_data)
    prompt = f"""{context}

Analyze the wall layout above and identify the rooms. For each room, determine:
1. Room type (bedroom, bathroom, kitchen, living room, dining room, hallway, balcony, etc.)
2. Approximate center position (x, z coordinates)
3. Approximate dimensions (width, depth)

Respond with:
{{
  "message": "description of identified rooms",
  "actions": [{{"type": "detect_rooms"}}],
  "rooms": [
    {{"type": "bedroom", "center_x": 5.0, "center_z": 3.0, "width": 4.0, "depth": 3.5}},
    ...
  ]
}}
"""
    try:
        response = model.generate_content(prompt)
        return _parse_model_json(
            response.text,
            fallback={"message": "Room detection parsing failed.", "actions": [], "rooms": []},
        )
    except Exception as e:
        print(f"[ai] Room detection failed: {e}")
        return _fallback_room_detection(layout_data)


def _fallback_room_detection(layout_data: dict) -> dict:
    """Simple rule-based room detection when AI is unavailable."""
    walls = layout_data.get("walls", [])
    if not walls:
        return {"message": "No walls found to detect rooms.", "actions": [], "rooms": []}

    xs, ys = [], []
    for w in walls:
        if w.get("start") and w.get("end"):
            xs.extend([w["start"]["x"], w["end"]["x"]])
            ys.extend([w["start"]["y"], w["end"]["y"]])

    if not xs:
        return {"message": "No valid walls.", "actions": [], "rooms": []}

    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    total_w = max(xs) - min(xs)
    total_h = max(ys) - min(ys)

    # Simple heuristic: divide into quadrants and assign room types
    rooms = []
    if total_w > 4 and total_h > 4:
        rooms = [
            {"type": "living room", "center_x": cx - total_w / 4, "center_z": cy - total_h / 4,
             "width": total_w / 2, "depth": total_h / 2},
            {"type": "bedroom", "center_x": cx + total_w / 4, "center_z": cy - total_h / 4,
             "width": total_w / 2, "depth": total_h / 2},
            {"type": "kitchen", "center_x": cx - total_w / 4, "center_z": cy + total_h / 4,
             "width": total_w / 2, "depth": total_h / 2},
            {"type": "bathroom", "center_x": cx + total_w / 4, "center_z": cy + total_h / 4,
             "width": total_w / 2, "depth": total_h / 2},
        ]
    else:
        rooms = [
            {"type": "living room", "center_x": cx, "center_z": cy,
             "width": total_w, "depth": total_h},
        ]

    return {
        "message": f"Detected {len(rooms)} rooms based on layout analysis.",
        "actions": [{"type": "detect_rooms"}],
        "rooms": rooms,
    }


# ── Auto-Furnish ─────────────────────────────────────────

ROOM_FURNITURE = {
    "bedroom": [
        {"type": "bed", "rel_x": 0, "rel_z": -0.15, "width": 1.8, "depth": 2.2},
        {"type": "wardrobe", "rel_x": 0.35, "rel_z": 0.4, "width": 1.5, "depth": 0.6},
        {"type": "side table", "rel_x": -0.4, "rel_z": -0.15, "width": 0.5, "depth": 0.5},
    ],
    "living room": [
        {"type": "sofa", "rel_x": 0, "rel_z": 0.2, "width": 2.2, "depth": 0.9},
        {"type": "coffee table", "rel_x": 0, "rel_z": -0.05, "width": 1.0, "depth": 0.6},
        {"type": "tv", "rel_x": 0, "rel_z": -0.35, "width": 1.2, "depth": 0.3},
    ],
    "kitchen": [
        {"type": "kitchen-slab", "rel_x": 0, "rel_z": -0.35, "width": 2.5, "depth": 0.65},
        {"type": "stove", "rel_x": -0.25, "rel_z": -0.35, "width": 0.7, "depth": 0.6},
        {"type": "fridge", "rel_x": 0.4, "rel_z": -0.35, "width": 0.7, "depth": 0.7},
        {"type": "sink", "rel_x": 0.1, "rel_z": -0.35, "width": 0.6, "depth": 0.5},
    ],
    "dining room": [
        {"type": "dining table", "rel_x": 0, "rel_z": 0, "width": 1.8, "depth": 1.0},
        {"type": "chair", "rel_x": -0.25, "rel_z": -0.2, "width": 0.45, "depth": 0.45},
        {"type": "chair", "rel_x": 0.25, "rel_z": -0.2, "width": 0.45, "depth": 0.45},
        {"type": "chair", "rel_x": -0.25, "rel_z": 0.2, "width": 0.45, "depth": 0.45},
        {"type": "chair", "rel_x": 0.25, "rel_z": 0.2, "width": 0.45, "depth": 0.45},
    ],
    "bathroom": [
        {"type": "commode", "rel_x": -0.3, "rel_z": -0.3, "width": 0.5, "depth": 0.65},
        {"type": "wash", "rel_x": 0.3, "rel_z": -0.35, "width": 0.5, "depth": 0.45},
    ],
    "study room": [
        {"type": "study table", "rel_x": 0, "rel_z": -0.25, "width": 1.2, "depth": 0.65},
        {"type": "chair", "rel_x": 0, "rel_z": 0.05, "width": 0.5, "depth": 0.5},
        {"type": "book cabinet", "rel_x": 0.35, "rel_z": -0.35, "width": 0.8, "depth": 0.4},
    ],
    "hallway": [],
    "balcony": [
        {"type": "chair", "rel_x": 0, "rel_z": 0, "width": 0.5, "depth": 0.5},
    ],
}


def auto_furnish(rooms: list) -> dict:
    """Generate furniture placement actions for detected rooms."""
    actions = []
    placed = []

    for room in rooms:
        rtype = room.get("type", "").lower()
        cx = room.get("center_x", 0)
        cz = room.get("center_z", 0)
        rw = room.get("width", 4)
        rd = room.get("depth", 4)

        furniture_list = ROOM_FURNITURE.get(rtype, ROOM_FURNITURE.get("living room", []))

        for furn in furniture_list:
            fx = cx + furn["rel_x"] * rw
            fz = cz + furn["rel_z"] * rd
            action = {
                "type": "add_object",
                "object_type": furn["type"],
                "x": round(fx, 2),
                "z": round(fz, 2),
                "width": furn["width"],
                "depth": furn["depth"],
            }
            actions.append(action)
            placed.append(f"{furn['type']} in {rtype}")

    summary = ", ".join(set(f"{placed.count(p)}x {p.split(' in ')[0]} in {p.split(' in ')[1]}"
                            for p in placed)) if placed else "nothing"

    return {
        "message": f"Auto-furnished {len(rooms)} rooms. Placed: {summary}.",
        "actions": actions,
    }


# ── Chat ──────────────────────────────────────────────────

def chat(user_message: str, layout_data: dict, conversation_history: list = None) -> dict:
    """Process a chat message and return AI response with optional scene actions."""
    msg_lower = user_message.lower().strip()

    # Quick commands (no AI call needed)
    if msg_lower in ("detect rooms", "identify rooms", "find rooms"):
        return detect_rooms_from_layout(layout_data)

    if msg_lower in ("auto furnish", "furnish", "add furniture", "auto-furnish"):
        rooms_result = detect_rooms_from_layout(layout_data)
        rooms = rooms_result.get("rooms", [])
        if rooms:
            furnish_result = auto_furnish(rooms)
            furnish_result["rooms"] = rooms
            furnish_result["message"] = rooms_result["message"] + "\n\n" + furnish_result["message"]
            return furnish_result
        return rooms_result

    # AI-powered response
    model = _get_model()
    if model is None:
        return {
            "message": "AI is not available. Please set GEMINI_API_KEY environment variable. "
                       "Get a free key at https://aistudio.google.com/apikey\n\n"
                       "Quick commands available: 'detect rooms', 'auto furnish'",
            "actions": [],
        }

    context = _build_context(layout_data)

    # Build conversation
    history = conversation_history or []
    messages = []
    for h in history[-6:]:  # Keep last 6 messages for context
        messages.append({"role": h["role"], "parts": [h["content"]]})

    user_prompt = f"""Floor plan context:
{context}

User request: {user_message}

Respond with a JSON object containing "message" (your response text) and "actions" (array of scene modification actions). If the user asks to detect rooms, include room data. If they ask to furnish, include furniture placement actions with correct x,z positions within the floor plan bounds."""

    messages.append({"role": "user", "parts": [user_prompt]})

    try:
        chat_session = model.start_chat(history=messages[:-1])
        response = chat_session.send_message(messages[-1]["parts"][0])
        result = _parse_model_json(response.text)

        # If AI triggered auto_furnish, process it
        if any(a.get("type") == "auto_furnish" for a in result.get("actions", [])):
            rooms = result.get("rooms", [])
            if not rooms:
                rooms_result = detect_rooms_from_layout(layout_data)
                rooms = rooms_result.get("rooms", [])
            if rooms:
                furnish_result = auto_furnish(rooms)
                result["actions"] = [a for a in result["actions"] if a["type"] != "auto_furnish"]
                result["actions"].extend(furnish_result["actions"])
                result["rooms"] = rooms

        return result
    except Exception as e:
        print(f"[ai] Chat error: {e}")
        return {
            "message": f"Sorry, I encountered an error: {str(e)}",
            "actions": [],
        }


# ── Interior Design ──────────────────────────────────────

def suggest_design(style: str, layout_data: dict) -> dict:
    """Get interior design suggestions for a given style."""
    model = _get_model()

    styles_prompt = {
        "modern": "modern minimalist with clean lines, neutral tones, and sleek furniture",
        "traditional": "traditional warm style with rich wood tones, ornate details",
        "scandinavian": "Scandinavian style with light wood, white walls, cozy textiles",
        "industrial": "industrial style with exposed elements, dark metals, concrete",
        "bohemian": "bohemian style with vibrant colors, patterns, eclectic furniture",
    }

    style_desc = styles_prompt.get(style.lower(), style)

    if model is None:
        # Fallback style presets
        presets = {
            "modern": {"wall_color": "#f5f5f5", "floor": "marble", "accent": "#2196F3"},
            "traditional": {"wall_color": "#f5efe0", "floor": "wood", "accent": "#8D6E63"},
            "scandinavian": {"wall_color": "#fafafa", "floor": "wood", "accent": "#90CAF9"},
            "industrial": {"wall_color": "#e0e0e0", "floor": "tile", "accent": "#616161"},
            "bohemian": {"wall_color": "#fff8e1", "floor": "carpet", "accent": "#FF7043"},
        }
        preset = presets.get(style.lower(), presets["modern"])
        return {
            "message": f"Applied {style} design: {style_desc}",
            "actions": [
                {"type": "change_wall_color", "color": preset["wall_color"]},
                {"type": "change_floor", "material": preset["floor"]},
            ],
            "style": preset,
        }

    context = _build_context(layout_data)
    prompt = f"""{context}

The user wants a {style_desc} interior design. Suggest:
1. Wall color (hex)
2. Floor material for each room type
3. Furniture style recommendations
4. Accent colors

Respond with scene modification actions to apply this style."""

    try:
        response = model.generate_content(prompt)
        return _parse_model_json(response.text)
    except Exception as e:
        print(f"[ai] Design suggestion error: {e}")
        return {"message": f"Error generating design: {e}", "actions": []}


# ── Vision-based detection review (hybrid YOLO + Gemini) ────

_vision_model = None


def _get_vision_model():
    """Initialize and cache the Gemini vision-review model (separate system prompt/
    response schema from the chat model, so it does not share the cached singleton)."""
    global _vision_model
    if _vision_model is not None:
        return _vision_model
    if not _ensure_configured():
        return None
    try:
        _vision_model = genai.GenerativeModel(
            GEMINI_MODEL_NAME,
            system_instruction=VISION_REVIEW_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.4,
                # Large floor plans can have 100+ detections — each potential correction
                # in the response costs tokens, so this needs real headroom or Gemini's
                # JSON gets truncated mid-object and fails to parse. Model supports up to
                # 65536; 16384 covers even dense multi-unit plans with margin to spare.
                max_output_tokens=16384,
            ),
        )
        return _vision_model
    except Exception as e:
        print(f"[ai] Failed to initialize Gemini vision model: {e}")
        return None


def _format_detection_list(label: str, items: list, line_fn) -> str:
    if not items:
        return f"{label}: (none)\n"
    lines = [f"{label}:"]
    for i, item in enumerate(items):
        lines.append(f"  {i}: {line_fn(item)}")
    return "\n".join(lines) + "\n"


def _wall_line(w):
    return f"line from ({w['start']['x']:.0f},{w['start']['y']:.0f}) to ({w['end']['x']:.0f},{w['end']['y']:.0f})"


def _door_line(d):
    return f"bbox({d['bbox']['x1']:.0f},{d['bbox']['y1']:.0f})-({d['bbox']['x2']:.0f},{d['bbox']['y2']:.0f})"


def _object_line(o):
    return f"{o.get('class','?')} bbox({o['bbox']['x1']:.0f},{o['bbox']['y1']:.0f})-({o['bbox']['x2']:.0f},{o['bbox']['y2']:.0f})"


# Dense plans (100+ objects) can make one huge prompt fail/time out and skip AI review.
# Use moderate default batching for stability, with env override for tuning.
OBJECTS_BATCH_SIZE = max(20, int(os.environ.get("AI_VISION_OBJECTS_BATCH_SIZE", "40")))


def _is_quota_error(message: str) -> bool:
    m = (message or "").lower()
    return (
        "quota" in m
        or "429" in m
        or "rate limit" in m
        or "exceeded your current quota" in m
    )


def _review_one_call(model, image_bytes: bytes, prompt: str) -> dict:
    try:
        response = model.generate_content([
            prompt,
            {"mime_type": "image/jpeg", "data": image_bytes},
        ])
        parsed = _parse_model_json(response.text, fallback={"corrections": [], "summary": None})
        return {
            "corrections": parsed.get("corrections", []),
            "summary": parsed.get("summary"),
            "error": None,
        }
    except Exception as e:
        err = str(e)
        print(f"[ai] Vision review error: {err}")
        if _is_quota_error(err):
            return {
                "corrections": [],
                "summary": None,
                "error": "Gemini quota exceeded (free tier). AI review paused until quota resets.",
            }
        return {"corrections": [], "summary": None, "error": err}


def review_detections_with_vision(image_bytes: bytes, walls: list, doors: list, objects: list) -> dict:
    """Send the floor plan image + current YOLO detections to Gemini for a visual
    cross-check, batched so no single call's response risks truncation on dense plans.
    Returns {"corrections": [...], "summary": str|None, "error": str|None}. Never raises —
    degrades per-batch on failure (quota, malformed response, etc.) rather than failing
    the whole review."""
    model = _get_vision_model()
    if model is None:
        return {"corrections": [], "summary": None, "error": "Gemini vision model unavailable"}

    all_corrections, summaries, errors = [], [], []

    # Walls + doors together — typically far fewer items than objects, low truncation risk.
    if walls or doors:
        prompt = (
            "Only review the Walls and Doors below (no Objects in this batch).\n"
            + _format_detection_list("Walls", walls, _wall_line)
            + _format_detection_list("Doors", doors, _door_line)
            + _format_detection_list("Objects", [], _object_line)
        )
        result = _review_one_call(model, image_bytes, prompt)
        all_corrections.extend(result["corrections"])
        if result["summary"]:
            summaries.append(result["summary"])
        if result["error"]:
            errors.append(result["error"])
            if _is_quota_error(result["error"]):
                return {
                    "corrections": all_corrections,
                    "summary": " ".join(summaries) if summaries else None,
                    "error": "; ".join(errors),
                }

    # Objects reviewed in fixed-size batches, with indices offset back to the global list.
    for start in range(0, len(objects), OBJECTS_BATCH_SIZE):
        batch = objects[start:start + OBJECTS_BATCH_SIZE]
        prompt = (
            f"Only review the Objects below, items {start}-{start + len(batch) - 1} of "
            f"{len(objects)} total (no Walls/Doors in this batch).\n"
            + _format_detection_list("Walls", [], _wall_line)
            + _format_detection_list("Doors", [], _door_line)
            + _format_detection_list("Objects", batch, _object_line)
        )
        result = _review_one_call(model, image_bytes, prompt)
        for c in result["corrections"]:
            if c.get("entity_type") == "object" and isinstance(c.get("index"), int):
                c["index"] += start
        all_corrections.extend(result["corrections"])
        if result["summary"]:
            summaries.append(result["summary"])
        if result["error"]:
            errors.append(result["error"])
            if _is_quota_error(result["error"]):
                break

    return {
        "corrections": all_corrections,
        "summary": " ".join(summaries) if summaries else None,
        "error": "; ".join(errors) if errors else None,
    }


def review_structural_elements_with_vision(image_bytes: bytes) -> dict:
    """Extra AI pass to find missing structural objects (pillar/window/glass-*).
    Returns add-only object corrections in the same schema used by the main review flow."""
    model = _get_vision_model()
    if model is None:
        return {"corrections": [], "summary": None, "error": "Gemini vision model unavailable"}

    prompt = STRUCTURAL_REVIEW_PROMPT

    result = _review_one_call(model, image_bytes, prompt)
    allowed = {"pillar", "window", "glass-window", "glass-wall", "glass-grill", "stairs", "lift"}
    filtered = []
    for c in result.get("corrections", []):
        if c.get("entity_type") != "object" or c.get("action") != "add":
            continue
        cls = str(c.get("class") or "").strip().lower()
        if cls not in allowed:
            continue
        bbox = c.get("bbox")
        if not isinstance(bbox, dict):
            continue
        if not all(k in bbox for k in ("x1", "y1", "x2", "y2")):
            continue
        filtered.append(c)

    return {
        "corrections": filtered,
        "summary": result.get("summary"),
        "error": result.get("error"),
    }
