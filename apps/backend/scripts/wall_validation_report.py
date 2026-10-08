"""Build a local before/after gallery from real API captures (no accuracy claim)."""
import html
import json
from pathlib import Path
import cv2
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/wall-validation'


def main():
    sections=[]; rows=[]
    for path in sorted((OUT/'before').glob('*.json')):
        before=json.loads(path.read_text())
        if not isinstance(before,dict) or 'walls' not in before: continue
        after_path=OUT/'after'/path.name
        if not after_path.exists(): continue
        after=json.loads(after_path.read_text()); name=path.stem
        counts=[len(before['walls']),len(after['walls']),len(after.get('wall_review',[])),len(after.get('wall_rejected',[]))]
        rows.append(f'<tr><td><a href="#{html.escape(name)}">{html.escape(name)}</a></td>'+''.join(f'<td>{v}</td>' for v in counts)+'</tr>')
        safe=html.escape(name)
        mode=html.escape(after.get('validation',{}).get('mode','end_to_end_API_capture'))
        sections.append(f'''<section id="{safe}"><h2>{safe}</h2>
        <p>Validation mode: {mode}</p>
        <p>Before: {counts[0]} segments. After: {counts[1]} accepted, {counts[2]} review, {counts[3]} rejected.
        <a href="after/{safe}.json">Structured JSON</a> · <a href="after/{safe}.png">Overlay including review</a></p>
        <div class="pair"><figure><figcaption>Before</figcaption><img loading="lazy" src="before/{safe}.png"></figure>
        <figure><figcaption>After — accepted walls</figcaption><img loading="lazy" src="after/{safe}-accepted.png"></figure></div></section>''')
    page='''<!doctype html><html><head><meta charset="utf-8"><title>Wall detection validation</title>
    <style>body{font:16px system-ui;max-width:1500px;margin:24px auto;padding:16px;color:#152238} .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px} img{width:100%}figure{margin:0}section{border-top:1px solid #bbb;margin-top:32px}table{border-collapse:collapse}td,th{padding:6px;border:1px solid #ccc}a{color:#1559a3}p{max-width:1000px}</style></head><body>
    <h1>Wall detection: recorded before/after results</h1>
    <p>Both columns use the same original pixels. Green lines are estimated boundary faces, blue lines are centrelines, red labels are wall IDs. Amber candidates appear only in the linked review overlays. Downloaded JSON identifies original-image coordinates, thickness source, model confidence when present, heuristic evidence score and review reasons.</p>
    <p>Counts are not accuracy: splitting at an opening increases segment count; removing furniture reduces it. These plans do not have manually labelled wall ground truth. Review the drawings at full resolution. The implementation does not claim every remaining accepted segment is correct or every real wall has been recovered.</p>
    <p>See <a href="../wall-evidence-implementation.md">implementation, parameters, observed limitations and training-label recommendations</a>.</p>
    <table><tr><th>Example</th><th>Before</th><th>Accepted</th><th>Review</th><th>Rejected</th></tr>'''+''.join(rows)+'</table>'+''.join(sections)+'</body></html>'
    (OUT/'index.html').write_text(page)
    # Small, directly comparable crops for the three user screenshots.
    examples=[('test12',(210,510,780,1010)),
              ('20261006_095745_upload',(330,1250,1065,1530)),
              ('20261006_104237_upload',(40,75,485,665))]
    for name,(x1,y1,x2,y2) in examples:
        panels=[]
        for folder,suffix,label in [('before','.png','BEFORE'),('after','-accepted.png','AFTER: ACCEPTED')]:
            im=cv2.imread(str(OUT/folder/(name+suffix)))
            if im is None: break
            crop=im[y1:y2,x1:x2]; panel=np.full((crop.shape[0]+30,crop.shape[1],3),255,np.uint8)
            panel[30:]=crop; cv2.putText(panel,label,(8,21),cv2.FONT_HERSHEY_SIMPLEX,.6,(30,30,30),1)
            panels.append(panel)
        if len(panels)==2: cv2.imwrite(str(OUT/(name+'-comparison.png')),np.hstack(panels))
    print(f'Gallery contains {len(rows)} before/after comparisons: {OUT / "index.html"}')


if __name__=='__main__': main()
