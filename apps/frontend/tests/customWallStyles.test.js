import test from 'node:test';
import assert from 'node:assert/strict';
import {registerCustomWallStyle,customMuralAssets} from '../src/design/customWallStyles.js';
import {getFinishStyle,normalizeRoomDesign,optionsFor} from '../src/design/roomDesignCatalog.js';
const data='data:image/png;base64,iVBORw0KGgo=';
test('uploaded relief persists assets, dimensions and region association through JSON',()=>{
  const style=registerCustomWallStyle({id:'custom-wall-roundtrip',label:'My sculpture',image:data,depth:data,aspect:2,reliefM:.12});
  assert.ok(optionsFor('living','wallPanel').includes(style));
  const selection=normalizeRoomDesign({roomType:'living',wallPanel:style.id,wallPanelRegions:[{id:'area',wallId:'wall',startM:0,endM:2,bottomM:0,topM:1,styleId:style.id}]});
  assert.equal(selection.customWallStyles.length,1);
  const restored=normalizeRoomDesign(JSON.parse(JSON.stringify(selection)));
  assert.equal(getFinishStyle(restored.wallPanel).image,data);
  assert.equal(restored.wallPanelRegions[0].styleId,style.id);
  assert.equal(customMuralAssets(getFinishStyle(style.id)).reliefM,.12);
});
test('custom relief rejects remote resources and invalid aspect ratios',()=>{
  assert.equal(registerCustomWallStyle({id:'custom-wall-test',image:'https://example.com/image',depth:data,aspect:2}),null);
  assert.equal(registerCustomWallStyle({id:'custom-wall-test',image:data,depth:data,aspect:Infinity}),null);
  assert.equal(registerCustomWallStyle({id:'wall-relief-horses',image:data,depth:data,aspect:2}),null);
});
