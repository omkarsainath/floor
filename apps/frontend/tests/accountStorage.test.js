import test from 'node:test';
import assert from 'node:assert/strict';
import {activateUserStorage,createUserStorage} from '../src/auth/storage.js';
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
test('plans and deletes are scoped to the signed-in account',()=>{
    const raw=storage(),alice=createUserStorage('alice',raw),bob=createUserStorage('bob',raw);
    alice.setItem('preciseFloorplan','Alice plan');bob.setItem('preciseFloorplan','Bob plan');
    assert.equal(alice.getItem('preciseFloorplan'),'Alice plan');assert.equal(bob.getItem('preciseFloorplan'),'Bob plan');
    bob.removeItem('preciseFloorplan');assert.equal(alice.getItem('preciseFloorplan'),'Alice plan');
    assert.equal(raw.getItem('preciseFloorplan'),null);assert.throws(()=>createUserStorage(null,raw),/Sign in/);
});
test('legacy plans migrate only to the first administrator without overwriting current work',()=>{
    const raw=storage();raw.setItem('preciseFloorplan','Old plan');raw.setItem('easy2DPlanDraft','Old draft');
    activateUserStorage({id:'regular',role:'user'},raw);
    assert.equal(createUserStorage('regular',raw).getItem('preciseFloorplan'),null);
    const admin=createUserStorage('admin',raw);admin.setItem('easy2DPlanDraft','New draft');
    activateUserStorage({id:'admin',role:'admin'},raw);
    assert.equal(admin.getItem('preciseFloorplan'),'Old plan');assert.equal(admin.getItem('easy2DPlanDraft'),'New draft');
    activateUserStorage({id:'second-admin',role:'admin'},raw);
    assert.equal(createUserStorage('second-admin',raw).getItem('preciseFloorplan'),null);
    assert.equal(raw.getItem('preciseFloorplan'),'Old plan');
});
