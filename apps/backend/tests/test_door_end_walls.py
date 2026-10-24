"""Door-end recovery is a local exception, not a relaxed wall detector."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'src'))
from wall_evidence import WallEvidenceConfig, recover_door_end_walls, assess_walls


def wall(a, b, width=8, **extra):
    return {'start':dict(zip(('x','y'), a)), 'end':dict(zip(('x','y'), b)),
            'thickness_px':width, **extra}


class DoorEndWallTests(unittest.TestCase):
    def fixture(self, solid=False, scale=1):
        # A real wall runs from a T junction (inside its fitted span) to a jamb.
        candidate=wall((200,100),(200,200), geometry_evidence='solid_profile' if solid else 'paired_boundaries',
                       thickness_consistency=1., pixel_support=1., boundary_support=1.,
                       evidence_score=.6, review_status='uncertain',
                       review_reasons=['isolated_segment' if solid else 'unverified_thin_stroke'])
        anchor=wall((100,110),(400,110),16)
        door={'bbox':dict(x1=195,y1=200,x2=205,y2=260)}
        ink=np.zeros((600*scale,600*scale),np.uint8)
        for w in (candidate,anchor):
            for key in ('start','end'):
                for axis in ('x','y'): w[key][axis]*=scale
            w['thickness_px']*=scale
        door['bbox']={k:v*scale for k,v in door['bbox'].items()}
        if solid:
            cv2.line(ink,(200*scale,100*scale),(200*scale,200*scale),255,8*scale)
        else:
            for x in (196,204):cv2.line(ink,(x*scale,100*scale),(x*scale,200*scale),255,scale)
        return [anchor],[candidate],[door],ink,ink.copy(),600*scale,WallEvidenceConfig()

    def test_paired_jamb_return_is_recovered_without_changing_geometry(self):
        args=self.fixture(); original=deepcopy(args[:3])
        accepted,review=recover_door_end_walls(*args)
        self.assertEqual(len(accepted),2); self.assertFalse(review)
        self.assertTrue(accepted[-1]['door_end_recovered'])
        self.assertEqual(accepted[-1]['start'],original[1][0]['start'])
        self.assertEqual(accepted[-1]['end'],original[1][0]['end'])
        self.assertEqual(args[:3],tuple(original))

    def test_solid_wall_with_interior_t_junction_is_recovered(self):
        accepted,review=recover_door_end_walls(*self.fixture(solid=True))
        self.assertEqual(len(accepted),2); self.assertFalse(review)

    def test_horizontal_and_reversed_segments(self):
        args=list(self.fixture())
        for w in args[0]+args[1]:
            w['start'],w['end']=w['end'],w['start']
            for p in (w['start'],w['end']):p['x'],p['y']=p['y'],p['x']
        b=args[2][0]['bbox']; args[2][0]['bbox']=dict(x1=b['y1'],y1=b['x1'],x2=b['y2'],y2=b['x2'])
        args[3]=args[3].T.copy(); args[4]=args[4].T.copy()
        self.assertFalse(recover_door_end_walls(*args)[1])

    def test_scaled_drawing_has_same_decision(self):
        for scale in (1,2,3):
            self.assertFalse(recover_door_end_walls(*self.fixture(scale=scale))[1])

    def test_no_door_no_change(self):
        args=list(self.fixture()); args[2]=[]
        self.assertEqual(recover_door_end_walls(*args),(args[0],args[1]))

    def test_no_accepted_wall_anchor_no_change(self):
        args=list(self.fixture()); args[0]=[]
        self.assertEqual(recover_door_end_walls(*args),(args[0],args[1]))

    def test_semantic_rejections_are_never_overridden(self):
        for reason in ('furniture_overlap','door_swing_region','text_overlap','repeated_tread_or_slat_pattern',
                       'possible_page_border','dimension_rule_overlap','detached_symbol_component'):
            args=self.fixture(); args[1][0]['review_reasons'].append(reason)
            self.assertEqual(recover_door_end_walls(*args),(args[0],args[1]))

    def test_square_swing_box_and_offset_parallel_candidate_are_not_anchors(self):
        for box in (dict(x1=200,y1=200,x2=260,y2=260),dict(x1=220,y1=200,x2=230,y2=260)):
            args=self.fixture(); args[2][0]['bbox']=box
            self.assertEqual(recover_door_end_walls(*args),(args[0],args[1]))

    def test_gap_to_door_is_not_invented(self):
        args=self.fixture(); args[2][0]['bbox']['y1']=220
        self.assertEqual(recover_door_end_walls(*args),(args[0],args[1]))

    def test_candidate_across_opening_is_not_promoted(self):
        args=self.fixture(); args[1][0]['end']['y']=260
        self.assertEqual(recover_door_end_walls(*args),(args[0],args[1]))

    def test_weak_pixels_and_single_boundary_are_not_recovered(self):
        args=list(self.fixture()); args[4]=np.zeros_like(args[4])
        self.assertEqual(recover_door_end_walls(*args),(args[0],args[1]))
        args=self.fixture(); args[1][0]['geometry_evidence']='unverified_single_stroke'
        self.assertEqual(recover_door_end_walls(*args),(args[0],args[1]))

    def test_assessment_recovers_short_return_but_keeps_door_gap(self):
        image=np.full((800,800,3),255,np.uint8)
        cv2.line(image,(100,200),(700,200),(0,0,0),24)
        for x in (396,404):cv2.line(image,(x,200),(x,240),(0,0,0),1)
        proposals=[wall((100,200),(700,200),24),
                   wall((400,212),(400,240),8,geometry_evidence='paired_boundaries',band_style='outlined')]
        door={'bbox':dict(x1=395,y1=240,x2=405,y2=300)}
        before=assess_walls(image,proposals)
        self.assertTrue(any('unverified_thin_stroke' in w['review_reasons'] for w in before['wall_review']))
        after=assess_walls(image,proposals,doors=[door])
        recovered=[w for w in after['walls'] if w.get('door_end_recovered')]
        self.assertEqual(len(recovered),1)
        self.assertLessEqual(recovered[0]['end']['y'],240)
        self.assertEqual(recovered[0]['geometry_reference'],'centreline')


if __name__=='__main__':unittest.main()
