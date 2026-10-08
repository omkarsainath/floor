"""Fast isolated evaluation of evidence refinement using captured API proposals.

Does not rerun models/OCR. For end-to-end validation use validate_wall_examples.
"""
import argparse
import json
from pathlib import Path
import sys

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from wall_evidence import assess_walls, paired_wall_proposals
from validate_wall_examples import overlay


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('images', nargs='+', type=Path)
    parser.add_argument('--baseline', type=Path, default=Path('docs/wall-validation/before'))
    parser.add_argument('--output', type=Path, default=Path('/tmp/wall-refined'))
    args=parser.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
    for path in args.images:
        im=cv2.imread(str(path)); old=json.loads((args.baseline/(path.stem+'.json')).read_text())
        result=assess_walls(im,old['walls']+paired_wall_proposals(im,old['measurements']),
                            old['measurements'],old['rooms_and_objects'],old['doors'])
        (args.output/(path.stem+'.json')).write_text(json.dumps(result,indent=2))
        cv2.imwrite(str(args.output/(path.stem+'.png')),overlay(im,result))
        accepted={**result,'wall_review':[]}
        cv2.imwrite(str(args.output/(path.stem+'-accepted.png')),overlay(im,accepted))
        print(path.name,'before',len(old['walls']),'accepted',len(result['walls']),
              'review',len(result['wall_review']),'rejected',len(result['wall_rejected']),flush=True)


if __name__=='__main__': main()
