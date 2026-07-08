#!/usr/bin/env python3
"""
Extract precise coordinates from PDF floor plan
Converts PDF to SVG then extracts line coordinates
"""

import subprocess
import json
import re
import os

PDF_PATH = "House-Floor-Plans.pdf"
OUTPUT_JSON = "precise_floorplan.json"

def pdf_to_svg(pdf_path, page=1):
    """Convert PDF page to SVG for coordinate extraction"""
    svg_path = f"/tmp/floorplan_page_{page}.svg"
    try:
        # Use pdftocairo or pdf2svg to convert
        result = subprocess.run(
            ["pdftocairo", "-svg", "-f", str(page), "-l", str(page), pdf_path, svg_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        if os.path.exists(svg_path):
            return svg_path
    except Exception as e:
        print(f"pdftocairo failed: {e}")
    
    try:
        result = subprocess.run(
            ["pdf2svg", pdf_path, svg_path, str(page)],
            capture_output=True,
            text=True,
            timeout=30
        )
        if os.path.exists(svg_path):
            return svg_path
    except Exception as e:
        print(f"pdf2svg failed: {e}")
    
    return None

def parse_svg_lines(svg_path):
    """Extract line coordinates from SVG"""
    with open(svg_path, 'r') as f:
        content = f.read()
    
    walls = []
    rooms = []
    
    # Parse SVG paths and lines
    # Look for <line x1="..." y1="..." x2="..." y2="..." />
    line_pattern = r'<line[^>]+x1="([^"]+)"[^>]+y1="([^"]+)"[^>]+x2="([^"]+)"[^>]+y2="([^"]+)"'
    lines = re.findall(line_pattern, content, re.IGNORECASE)
    
    for x1, y1, x2, y2 in lines:
        walls.append({
            "start": {"x": float(x1), "y": float(y1)},
            "end": {"x": float(x2), "y": float(y2)},
            "height": 3,
            "thickness": 0.15
        })
    
    # Also parse <rect> for rooms
    rect_pattern = r'<rect[^>]+x="([^"]+)"[^>]+y="([^"]+)"[^>]+width="([^"]+)"[^>]+height="([^"]+)"'
    rects = re.findall(rect_pattern, content, re.IGNORECASE)
    
    for i, (x, y, w, h) in enumerate(rects):
        x, y, w, h = float(x), float(y), float(w), float(h)
        rooms.append({
            "id": f"room_{i}",
            "name": f"Room {i+1}",
            "height": 3,
            "points": [
                {"x": x, "y": y},
                {"x": x + w, "y": y},
                {"x": x + w, "y": y + h},
                {"x": x, "y": y + h}
            ]
        })
    
    return walls, rooms

def extract_from_pdf(pdf_path):
    """Main extraction function"""
    print(f"Extracting from {pdf_path}...")
    
    all_walls = []
    all_rooms = []
    
    # Try to extract from first few pages
    for page in range(1, 4):  # Check first 3 pages
        print(f"Processing page {page}...")
        svg_path = pdf_to_svg(pdf_path, page)
        if svg_path:
            walls, rooms = parse_svg_lines(svg_path)
            if walls:
                print(f"  Found {len(walls)} walls")
                all_walls.extend(walls)
            if rooms:
                print(f"  Found {len(rooms)} rooms")
                all_rooms.extend(rooms)
    
    # Create output structure
    layout = {
        "rooms": all_rooms,
        "walls": all_walls,
        "objects": [],  # Doors to be added manually
        "scale": {
            "units": "points",
            "note": "Convert to feet: divide by 72 (1 inch = 72 PDF points)"
        }
    }
    
    # Save
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(layout, f, indent=2)
    
    print(f"\n✓ Saved to {OUTPUT_JSON}")
    print(f"  Walls: {len(all_walls)}")
    print(f"  Rooms: {len(all_rooms)}")
    print(f"\nNext steps:")
    print(f"  1. Review {OUTPUT_JSON}")
    print(f"  2. Add door positions at wall openings")
    print(f"  3. Convert coordinates to feet (divide by 72)")
    
    return layout

if __name__ == "__main__":
    extract_from_pdf(PDF_PATH)
