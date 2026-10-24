"""Extract only visible upholstery from the user-supplied PDF catalogue photos.
No generative replacements or invented detail. Rectangles are normalized against
existing PDF product crops. Keep the small source resolutions explicit.
"""
import json,base64
from pathlib import Path
from PIL import Image
# Interior of a back cushion, excluding silhouettes, buttons, seams and labels.
crops={
 'sf-sofas-p11-1':(.44,.18,.52,.34),
 'sf-sofas-p15-13':(.40,.24,.46,.42),
 'sf-sofas-p17-16':(.43,.39,.50,.53),
 'sf-sofas-p18-19':(.63,.18,.74,.37),
 'sf-sofas-p23-31':(.36,.13,.45,.24),
 'sf-sofas-p25-38':(.71,.29,.78,.34),
 'sf-economic-sofas-p26-02':(.35,.09,.42,.23),
 'sf-economic-sofas-p27-03':(.65,.19,.78,.30),
 'sf-economic-sofas-p28-06':(.60,.12,.73,.35),
 'sf-economic-sofas-p29-08':(.67,.20,.78,.32),
 'sf-economic-sofas-p29-09':(.40,.12,.50,.27),
 'sf-economic-sofas-p29-10':(.62,.08,.76,.26),
 'sf-economic-sofas-p31-13':(.66,.20,.77,.32),
 'sf-economic-sofas-p31-14':(.59,.12,.72,.32),
 'sf-economic-sofas-p33-19':(.61,.26,.75,.39),
 'sf-economic-sofas-p33-20':(.62,.12,.75,.29),
 'sf-economic-sofas-p34-21':(.17,.14,.28,.29),
 'sf-economic-sofas-p34-22':(.65,.1,.81,.29),
}
output={}
for ident,rect in crops.items():
 image=Image.open('apps/frontend/public/catalog/sofa-factory/'+ident+'.webp').convert('RGBA')
 bounds=[round(v*(image.width if i%2==0 else image.height)) for i,v in enumerate(rect)]
 swatch=image.crop(bounds)
 output[ident]={'source':ident+'.webp, original PDF photograph','bounds':bounds,'width':swatch.width,'height':swatch.height,'rgba':base64.b64encode(swatch.tobytes()).decode()}
for ident,file in [('sf-sofa-beds-p39-01','lounger-floral'),('sf-sofa-beds-p39-03','wooden-bed-floral')]:
 output[ident]=json.loads(Path('apps/frontend/src/generators/textures/'+file+'.json').read_text())
Path('apps/frontend/src/generators/textures/sofa-reference-prints.json').write_text(json.dumps(output,separators=(',',':'))+'\n')
print('Extracted',len(output),'original upholstery swatches; no artificial upscaling')
