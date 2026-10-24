import test from 'node:test';
import assert from 'node:assert/strict';
import {newPlan,addRoom,ROOM_PRESETS,saveDraft,loadSavedDraft,savedDrafts,deleteSavedDraft,DRAFT_KEY,DRAFT_ARCHIVE_KEY} from '../src/builder/model.js';

const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
test('fresh plans retain earlier homes and reopen their latest edits by ID',()=>{
    const s=storage(),first=newPlan();addRoom(first,ROOM_PRESETS[0]);saveDraft(first,s);
    const second=newPlan();saveDraft(second,s);
    assert.equal(JSON.parse(s.getItem(DRAFT_KEY)).rooms.length,0);
    assert.deepEqual(loadSavedDraft(first.id,s),first);
    addRoom(second,ROOM_PRESETS[1]);saveDraft(second,s);
    const reopened=loadSavedDraft(first.id,s);saveDraft(reopened,s);
    reopened.rooms[0].name='Updated bedroom';saveDraft(reopened,s);
    saveDraft(newPlan(),s);
    assert.equal(loadSavedDraft(first.id,s).rooms[0].name,'Updated bedroom');
    assert.equal(loadSavedDraft(second.id,s).rooms[0].name,'Living Room');
    assert.equal(savedDrafts(s).filter(entry=>entry.plan.id===first.id).length,1);
    assert.throws(()=>loadSavedDraft('missing',s),/could not be found/);
});
test('empty starts do not accumulate in saved plans, and archive failures preserve the current draft',()=>{
    const s=storage();saveDraft(newPlan(),s);saveDraft(newPlan(),s);assert.equal(savedDrafts(s).length,0);
    const first=newPlan();addRoom(first,ROOM_PRESETS[0]);saveDraft(first,s);
    const before=s.getItem(DRAFT_KEY);
    const full={...s,setItem:(key,value)=>{if(key===DRAFT_ARCHIVE_KEY)throw Error('Storage full');s.setItem(key,value);}};
    assert.throws(()=>saveDraft(newPlan(),full),/Storage full/);
    assert.equal(s.getItem(DRAFT_KEY),before);
    s.setItem(DRAFT_ARCHIVE_KEY,'not json');
    assert.throws(()=>saveDraft(newPlan(),s));
    assert.equal(s.getItem(DRAFT_KEY),before);
});
test('deleting an archived plan preserves other drafts and the separate 3D project',()=>{
    const s=storage(),first=newPlan(),second=newPlan();
    addRoom(first,ROOM_PRESETS[0]);addRoom(second,ROOM_PRESETS[1]);saveDraft(first,s);saveDraft(second,s);
    s.setItem('preciseFloorplan','keep 3D');
    deleteSavedDraft(first.id,s);
    assert.equal(s.getItem(DRAFT_ARCHIVE_KEY),null);
    assert.throws(()=>loadSavedDraft(first.id,s),/could not be found/);
    assert.deepEqual(loadSavedDraft(second.id,s),second);
    assert.equal(s.getItem('preciseFloorplan'),'keep 3D');
});
test('deleting the current draft also removes its older archived copy',()=>{
    const s=storage(),first=newPlan(),second=newPlan();
    addRoom(first,ROOM_PRESETS[0]);addRoom(second,ROOM_PRESETS[1]);
    saveDraft(first,s);saveDraft(second,s);saveDraft(first,s);
    deleteSavedDraft(first.id,s);
    assert.equal(s.getItem(DRAFT_KEY),null);
    assert.throws(()=>loadSavedDraft(first.id,s),/could not be found/);
    assert.deepEqual(loadSavedDraft(second.id,s),second);
    deleteSavedDraft(second.id,s);
    assert.equal(s.getItem(DRAFT_ARCHIVE_KEY),null);
});
test('a failed draft deletion restores its archived copy and leaves the draft intact',()=>{
    const s=storage(),p=newPlan();addRoom(p,ROOM_PRESETS[0]);saveDraft(p,s);
    s.setItem(DRAFT_ARCHIVE_KEY,JSON.stringify([{plan:p,savedAt:'earlier'}]));
    const before=s.getItem(DRAFT_ARCHIVE_KEY),draft=s.getItem(DRAFT_KEY);
    const failing={...s,removeItem:key=>{if(key===DRAFT_KEY)throw Error('Storage unavailable');s.removeItem(key);}};
    assert.throws(()=>deleteSavedDraft(p.id,failing),/Storage unavailable/);
    assert.equal(s.getItem(DRAFT_ARCHIVE_KEY),before);assert.equal(s.getItem(DRAFT_KEY),draft);
});
