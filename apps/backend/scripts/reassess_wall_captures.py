"""Replay final evidence rules on recorded API candidates, without model/OCR drift.

Keeps the API capture in raw-api/, writes final overlays/JSON to after/, and
explicitly records replay provenance. Does not masquerade as a new model run.
"""
import json
from pathlib import Path
import sys
import shutil

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from wall_evidence import assess_walls
from room_boundaries import detect_room_boundaries
from validate_wall_examples import overlay

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/wall-validation'


def main():
    sources={p.stem:p for p in list(ROOT.iterdir())+list((ROOT/'apps/backend/uploads').iterdir())
             if p.suffix.lower() in ('.jpg','.jpeg','.webp','.png','.avif')}
    (OUT/'raw-api').mkdir(exist_ok=True)
    for path in sorted((OUT/'after').glob('*.json')):
        data=json.loads(path.read_text())
        if not isinstance(data,dict) or 'walls' not in data or path.stem not in sources: continue
        backup=OUT/'raw-api'/path.name
        if not backup.exists(): shutil.copyfile(path,backup)
        data=json.loads(backup.read_text())
        source=sources[path.stem]
        image=cv2.imread(str(source))
        if image is None: image=cv2.cvtColor(np.asarray(Image.open(source).convert('RGB')),cv2.COLOR_RGB2BGR)
        proposals=data['walls']+data.get('wall_review',[])+data.get('wall_rejected',[])
        result=assess_walls(image,proposals,data['measurements'],data.get('rooms_and_objects',[]),data.get('doors',[]))
        data.update(result)
        scan=detect_room_boundaries(image,data['walls'],data.get('doors',[]),data.get('rooms_and_objects',[]),data['measurements'])
        data['room_boundaries']=scan['rooms']; data['room_scan']={k:v for k,v in scan.items() if k!='rooms'}
        data['detection_summary']['walls']=len(data['walls']); data['detected_count']=len(data['walls'])
        data['validation']={'mode':'final_evidence_replay_on_recorded_api_candidates',
                            'original':str(source.relative_to(ROOT)), 'model_rerun':False,
                            'raw_api_capture':f'raw-api/{path.name}'}
        path.write_text(json.dumps(data,indent=2))
        cv2.imwrite(str(path.with_suffix('.png')),overlay(image,data))
        cv2.imwrite(str(path.with_name(path.stem+'-accepted.png')),overlay(image,{**data,'wall_review':[]}))
        print(path.stem,len(data['walls']),len(data['wall_review']),flush=True)


if __name__=='__main__': main()
