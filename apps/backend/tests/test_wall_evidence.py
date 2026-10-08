"""Geometry regression fixtures; these are not labelled real-plan accuracy tests."""
from pathlib import Path
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from wall_evidence import paired_wall_proposals, assess_walls, deduplicate, split_openings, points, repeated_line_regions, labelled_furniture_regions, door_leaf_overlap
from plan_measurements import plausible_text_regions, _original_bbox


def wall(a,b,width=8,**extra):
    return {'start':dict(zip(('x','y'),a)), 'end':dict(zip(('x','y'),b)), 'thickness_px':width, **extra}


class WallEvidenceTests(unittest.TestCase):
    def test_ocr_missed_title_corners_cannot_support_each_other_as_walls(self):
        im=np.full((800,800,3),255,np.uint8)
        building=[(100,200),(700,200),(700,700),(100,700)]
        glyph=[(250,40),(280,40),(280,70),(250,70)]
        proposals=[]
        for polygon,width in [(building,10),(glyph,6)]:
            for i,a in enumerate(polygon):
                b=polygon[(i+1)%4]
                cv2.line(im,a,b,(0,0,0),width)
                proposals.append(wall(a,b,width))
        result=assess_walls(im,proposals)
        self.assertTrue(result['walls'])
        self.assertTrue(all(min(w['start']['y'],w['end']['y'])>150 for w in result['walls']))
        self.assertTrue(any('detached_symbol_component' in w['review_reasons'] for w in result['wall_review']))

    def test_faint_stair_treads_share_boundary_evidence_with_wall_proposals(self):
        im=np.full((800,700,3),255,np.uint8)
        cv2.rectangle(im,(30,30),(660,750),(0,0,0),10)
        for x in range(140,301,25):cv2.line(im,(x,300),(x,460),(190,190,190),1)
        # Black walls dominate Otsu; the grey treads are still visible in Canny.
        self.assertTrue(repeated_line_regions(im))
        candidate=wall((152.5,300),(152.5,460),25,geometry_evidence='paired_boundaries',band_style='outlined')
        result=assess_walls(im,[candidate])
        self.assertFalse(result['walls'])
        self.assertIn('repeated_tread_or_slat_pattern',result['wall_review'][0]['review_reasons'])

    def test_caption_and_closed_bed_outline_cover_missing_model_detection(self):
        im=np.full((600,800,3),255,np.uint8)
        cv2.rectangle(im,(200,200),(400,350),(0,0,0),2)
        cv2.rectangle(im,(180,170),(420,370),(0,0,0),3)
        m={'furniture_labels':[{'class':'bed','bbox':[240,260,340,280]}]}
        regions=labelled_furniture_regions(im,m)
        self.assertEqual(len(regions),1)
        self.assertGreater(regions[0][0],195)
        self.assertLess(regions[0][2],405)
        bed=wall((220,200),(380,200),3)
        perimeter=wall((180,170),(420,170),3,source='manual')
        result=assess_walls(im,[bed,perimeter],m)
        self.assertEqual(len(result['walls']),1)
        self.assertIn('furniture_overlap',result['wall_review'][0]['review_reasons'])
        self.assertFalse(labelled_furniture_regions(im,{}))

    def test_fallback_door_leaf_is_not_a_wall_or_a_frame_mask(self):
        door={'bbox':dict(x1=100,y1=100,x2=200,y2=200)}
        diagonal=np.linspace([102,102],[190,180],61)
        self.assertTrue(door_leaf_overlap(diagonal,14,door,1000))
        frame=np.linspace([100,100],[100,200],61)
        self.assertFalse(door_leaf_overlap(frame,8,door,1000))
        narrow={'bbox':dict(x1=100,y1=100,x2=110,y2=200)}
        self.assertFalse(door_leaf_overlap(frame,8,narrow,1000))

    def test_diagonal_hollow_band_coordinates_and_thickness(self):
        im=np.full((500,700,3),255,np.uint8)
        a=np.array([80.,100.]); b=np.array([590.,365.]); n=np.array([-265.,510.]); n/=np.linalg.norm(n)
        for sign in (-1,1):
            cv2.line(im,tuple(np.rint(a+sign*n*6).astype(int)),tuple(np.rint(b+sign*n*6).astype(int)),(40,40,40),2)
        found=paired_wall_proposals(im)
        matches=[w for w in found if w.get('geometry_evidence')=='paired_boundaries'
                 and abs(w['thickness_px']-12)<3 and np.linalg.norm(points(w)[1]-points(w)[0])>400]
        self.assertTrue(matches)
        self.assertTrue(any(abs(np.dot((points(w)[0]+points(w)[1])/2-a,n))<2 for w in matches))
        result=assess_walls(im,found)
        self.assertEqual(result['wall_geometry']['width'],700)
        self.assertTrue(any(abs(w['end']['x']-w['start']['x'])>350 and abs(w['end']['y']-w['start']['y'])>150
                            for w in result['walls']))
        self.assertTrue(all(w['geometry_reference']=='centreline' for w in result['walls']))

    def test_nearby_partitions_and_opening_gap_never_merged(self):
        ws=[wall((20,30),(180,30),4),wall((20,38),(180,38),4),
            wall((200,30),(280,30),4),wall((40,30),(140,30),4)]
        out=deduplicate(ws,500)
        self.assertEqual(len(out),3)
        self.assertFalse(any(w['start']['x']<180 and w['end']['x']>200 for w in out))

    def test_aligned_opening_cut_and_square_swing_box_ignored(self):
        w=wall((20,80),(300,80),12)
        result=split_openings(w,[{'bbox':dict(x1=100,y1=72,x2=160,y2=88)}],500)
        self.assertEqual([(x['start']['x'],x['end']['x']) for x in result],[(20,100),(160,300)])
        result=split_openings(w,[{'bbox':dict(x1=100,y1=80,x2=160,y2=140)}],500)
        self.assertEqual(len(result),1)

    def test_text_proposals_are_excluded_but_authored_walls_survive(self):
        im=np.full((400,500,3),255,np.uint8)
        cv2.line(im,(100,150),(160,150),(0,0,0),3)
        w=wall((100,150),(160,150),3)
        m={'ocr_text_regions':[[95,140,165,160]]}
        result=assess_walls(im,[w],m)
        self.assertEqual(len(result['walls']),0)
        self.assertIn('text_overlap',result['wall_rejected'][0]['review_reasons'])
        w['source']='manual'
        result=assess_walls(im,[w],m)
        self.assertEqual(len(result['walls']),1)
        self.assertEqual(result['walls'][0]['start'],w['start'])

    def test_local_stair_run_does_not_span_page(self):
        im=np.full((700,550,3),255,np.uint8)
        cv2.rectangle(im,(40,60),(500,650),(0,0,0),8)
        for x in range(300,451,25): cv2.line(im,(x,490),(x,635),(0,0,0),2)
        runs=repeated_line_regions(im)
        self.assertTrue(runs)
        self.assertTrue(all(box[3]-box[1]<250 for box in runs))
        # A white band between two treads is not an architectural wall.
        w=wall((312.5,490),(312.5,635),25,geometry_evidence='paired_boundaries')
        result=assess_walls(im,[w])
        self.assertFalse(result['walls'])
        self.assertIn('repeated_tread_or_slat_pattern',result['wall_review'][0]['review_reasons'])

    def test_hatching_and_faint_faces_produce_candidates(self):
        for shade in (0,175):
            im=np.full((400,600,3),255,np.uint8)
            for y in (100,110): cv2.line(im,(50,y),(550,y),(shade,shade,shade),1)
            if shade==0:
                for x in range(55,540,14): cv2.line(im,(x,110),(x+8,100),(120,120,120),1)
            found=paired_wall_proposals(im)
            self.assertTrue(any(w.get('geometry_evidence')=='paired_boundaries' and 7<w['thickness_px']<13
                                and np.linalg.norm(points(w)[1]-points(w)[0])>350 for w in found))

    def test_oversized_ocr_region_cannot_erase_ensuite_walls(self):
        words=[[347,699,470,728],[372,740,444,768]]
        oversized=[[157,419,538,836],[157,785,522,984]]
        self.assertEqual(plausible_text_regions(words+oversized,(2048,2048,3)),words)

    def test_actual_rounded_resize_is_reversed_on_each_axis(self):
        self.assertEqual(_original_bbox(10,20,30,40,0,333,200,(333/1000,200/601)),
                         [30.03,60.1,120.12,180.3])

    def test_authored_geometry_is_fixed_and_unmatched_automatic_lengths_survive(self):
        manual=wall((100,101),(200,101),10,source='manual')
        auto=wall((20,100),(300,100),10)
        result=deduplicate([auto,manual],500)
        self.assertIn(manual,result)
        self.assertEqual(len(result),3)

    def test_dimension_rule_cannot_be_paired_with_a_wall(self):
        im=np.full((400,600,3),255,np.uint8)
        for y in (100,112): cv2.line(im,(50,y),(550,y),(0,0,0),1)
        proposal=wall((50,106),(550,106),12,geometry_evidence='paired_boundaries')
        measurement={'linear':[{'reference':wall((50,100),(550,100),1)}]}
        result=assess_walls(im,[proposal],measurement)
        self.assertFalse(result['walls'])
        self.assertIn('dimension_rule_overlap',result['wall_rejected'][0]['review_reasons'])


if __name__=='__main__': unittest.main()
