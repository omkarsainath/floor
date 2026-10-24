import test from 'node:test';
import assert from 'node:assert/strict';
import { WALL_RELIEF_STYLES, createReliefGeometry } from '../src/design/wallReliefs.js';
import { optionsFor, getFinishStyle, normalizeRoomDesign } from '../src/design/roomDesignCatalog.js';
for(const style of WALL_RELIEF_STYLES) test(`${style.label}: persisted selection and clipped relief on both wall faces`,()=>{
  for(const roomType of ['living','bedroom','kitchen','bathroom']) {
    assert.ok(optionsFor(roomType,'wallPanel').includes(style));
    assert.equal(normalizeRoomDesign({wallPanel:style.id},roomType).wallPanel,style.id);
    assert.equal(getFinishStyle(style.id),style);
  }
  // Deliberately restrict to a lintel-like span within a larger design region.
  for(const side of [-1,1]) {
    const g=createReliefGeometry({motif:style.motif,span:{lo:.7,hi:2.3,bottom:2.1,top:2.7},left:0,right:3,bottom:0,top:3,side});
    g.computeBoundingBox();const b=g.boundingBox;
    assert.ok(b.min.x>=.7-1e-6&&b.max.x<=2.3+1e-6);
    assert.ok(b.min.y>=2.1-1e-6&&b.max.y<=2.7+1e-6);
    assert.ok(b.min.z*side>0||b.max.z*side>0);
    for(const value of g.attributes.normal.array)assert.ok(Number.isFinite(value));
    g.dispose();
  }
});
