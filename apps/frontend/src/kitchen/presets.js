export const PULLOUT_SLAB_ID = 'kitchen-pullout-slab';
export const EDITABLE_CABINET_ID = 'kitchen-editable-cabinet';
export const EDITABLE_CABINET_ITEM = Object.freeze({id:EDITABLE_CABINET_ID,label:'Editable Base Cabinet',icon:'🗄️',w:.80,d:.60,wallAttached:true,showLabel:true,note:'Place multiple cabinets, then edit width and height immediately.'});
export const PULLOUT_SLAB_ITEM = Object.freeze({
  id: PULLOUT_SLAB_ID, label: 'Slab with Pull-outs', icon: '🍳',
  w: 1.80, d: .60, wallAttached: true, showLabel: true,
  note: 'Three editable sections: bottle pull-out, cutlery drawer and wicker baskets. Select a section in Kitchen Accessories to change it.',
});

// Dimensions describe this generated cabinet, not measurements of an existing
// real kitchen. An explicit saved state (including empty bays) always wins.
export function pulloutSlabState() {
  return {version:1,cabinets:Object.fromEntries(
    ['concept-bottle-2','concept-cutlery','concept-wicker-3'].map((productModelId,i)=>[
      `bay-${i+1}`,{profile:{confirmed:true,type:'base'},accessory:{productModelId,openingState:0,laminateMode:'INHERIT'}},
    ]),
  )};
}
