"""Short wall returns at window ends must not relax general wall acceptance."""
from pathlib import Path
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from wall_evidence import (paired_wall_proposals, assess_walls, recover_window_end_walls,
                           recover_door_end_walls, WallEvidenceConfig)


def wall(a,b,width,**extra):
    return {'start':dict(zip(('x','y'),a)), 'end':dict(zip(('x','y'),b)), 'thickness_px':width, **extra}


class WindowEndWallTests(unittest.TestCase):
    def scene(self,scale=1):
        im=np.full((1000*scale,1000*scale,3),255,np.uint8)
        def line(a,b,t=1):
            cv2.line(im,tuple(v*scale for v in a),tuple(v*scale for v in b),(0,0,0),t*scale)
        for x in (100,400): line((x,60),(x,400),16)
        for y in (190,210):
            line((100,y),(150,y)); line((350,y),(400,y))
        for y in (194,200,206):line((150,y),(350,y))
        for x in (150,350):line((x,190),(x,210))
        window={'class':'window','confidence':.9,'bbox':dict(x1=150*scale,y1=190*scale,x2=350*scale,y2=210*scale)}
        hosts=[wall((x*scale,60*scale),(x*scale,400*scale),16*scale) for x in (100,400)]
        return im,window,hosts

    def test_short_pairs_only_added_at_window_ends(self):
        im,window,_=self.scene()
        baseline=paired_wall_proposals(im)
        proposed=paired_wall_proposals(im,windows=[window])
        short=[w for w in proposed if w.get('window_end_candidate')]
        self.assertFalse(any(w.get('window_end_candidate') for w in baseline))
        self.assertTrue(any(w['end']['x']<155 for w in short))
        self.assertTrue(any(w['start']['x']>345 for w in short))
        self.assertTrue(all(w['end']['x']<155 or w['start']['x']>345 for w in short))

    def test_both_returns_recovered_without_crossing_window(self):
        for scale in (1,2):
            with self.subTest(scale=scale):
                im,window,hosts=self.scene(scale)
                result=assess_walls(im,hosts+paired_wall_proposals(im,windows=[window]),objects=[window])
                returns=[w for w in result['walls'] if w.get('window_end_recovered')]
                self.assertEqual(len(returns),2)
                for w in returns:
                    xs=sorted([w['start']['x'],w['end']['x']])
                    self.assertTrue(xs[1]<=150*scale or xs[0]>=350*scale)
                    self.assertEqual(w['geometry_reference'],'centreline')

    def test_square_or_low_confidence_boxes_do_not_enable_short_pairs(self):
        im,window,_=self.scene()
        for update in ({'confidence':.3},{'class':'bed'}, {'bbox':dict(x1=150,y1=190,x2=350,y2=390)}):
            proposed=paired_wall_proposals(im,windows=[{**window,**update}])
            self.assertFalse(any(w.get('window_end_candidate') for w in proposed))

    def test_unrelated_short_outline_remains_unchanged(self):
        im,window,_=self.scene()
        for y in (450,470):cv2.line(im,(220,y),(260,y),(0,0,0),1)
        proposed=paired_wall_proposals(im,windows=[window])
        self.assertFalse(any(w.get('window_end_candidate') and w['start']['y']>400 for w in proposed))

    def fixture(self):
        im,window,hosts=self.scene()
        edge=np.zeros(im.shape[:2],np.uint8)
        for y in (190,210):cv2.line(edge,(108,y),(150,y),255,1)
        candidate=wall((108,200),(150,200),20,geometry_evidence='paired_boundaries',
                       boundary_support=1.,evidence_score=.5,review_status='uncertain',
                       review_reasons=['short_wide_outline'])
        return hosts,[candidate],[window],edge,edge,1000,WallEvidenceConfig()

    def test_wide_return_exception_is_window_only(self):
        args=self.fixture()
        self.assertEqual(len(recover_window_end_walls(*args)[0]),3)
        self.assertEqual(recover_door_end_walls(*args),(args[0],args[1]))

    def test_requires_accepted_wall_anchor(self):
        args=list(self.fixture()); args[0]=[]
        self.assertEqual(recover_window_end_walls(*args),(args[0],args[1]))

    def test_requires_both_faces(self):
        args=list(self.fixture()); args[4]=args[4].copy(); args[4][210]=0
        self.assertEqual(recover_window_end_walls(*args),(args[0],args[1]))

    def test_furniture_and_text_rejections_are_not_overridden(self):
        for reason in ('furniture_overlap','text_overlap','door_swing_region','repeated_tread_or_slat_pattern'):
            args=self.fixture(); args[1][0]['review_reasons'].append(reason)
            self.assertEqual(recover_window_end_walls(*args),(args[0],args[1]))

    def test_vertical_window_returns(self):
        im,window,hosts=self.scene()
        b=window['bbox']; window['bbox']=dict(x1=b['y1'],y1=b['x1'],x2=b['y2'],y2=b['x2'])
        for w in hosts:
            for p in (w['start'],w['end']):p['x'],p['y']=p['y'],p['x']
        im=im.transpose(1,0,2).copy()
        result=assess_walls(im,hosts+paired_wall_proposals(im,windows=[window]),objects=[window])
        self.assertEqual(len([w for w in result['walls'] if w.get('window_end_recovered')]),2)


if __name__=='__main__':unittest.main()
