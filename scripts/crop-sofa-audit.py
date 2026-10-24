"""Crop rendered original PDF product images independently of their tables.
Requires pdftohtml XML and pdftoppm -scale-to 1450 rendered pages in /tmp.
Does not regenerate or overwrite the manually audited dimension tables.
"""
import json, pathlib, xml.etree.ElementTree as E
from PIL import Image
products=json.loads(pathlib.Path('apps/frontend/src/generators/sofaFactoryCatalog.json').read_text())
root=E.parse('/private/tmp/sofa-extract/catalog.xml').getroot()
out=pathlib.Path('docs/sofa-catalogue/reference');out.mkdir(parents=True,exist_ok=True)
manifest=[]
for page in root.findall('page'):
 n=int(page.get('number'));selected=[p for p in products if p['page']==n and p.get('referenceAudit')]
 if not selected:continue
 labels=sorted([t for t in page.findall('text') if t.get('font')=='26' and ''.join(t.itertext()).isdigit()],key=lambda t:int(t.get('top')))
 assigned={''.join(t.itertext()):[] for t in labels}
 for im in page.findall('image'):
  x,y,w,h=[int(im.get(k)) for k in ['left','top','width','height']]
  if not(50<abs(w)<850 and abs(h)<600):continue
  x,y,w,h=min(x,x+w),min(y,y+h),abs(w),abs(h)
  label=min(labels,key=lambda t:abs(y+h-int(t.get('top'))))
  assigned[''.join(label.itertext())].append((x,y,x+w,y+h))
 render=Image.open(f'/private/tmp/sofa-audit-{n}.png').convert('RGB');scale=render.height/int(page.get('height'))
 for product in selected:
  code=product['code'];label=next(t for t in labels if int(''.join(t.itertext()))==int(code));boxes=assigned[''.join(label.itertext())]
  x1=min(b[0] for b in boxes);y1=min(b[1] for b in boxes);x2=max(b[2] for b in boxes);y2=min(max(b[3] for b in boxes),int(label.get('top'))-40)
  if product['id']=='sf-sofas-p25-37': y1+=8;y2=700
  if product['id']=='sf-recliners-p37-03': y2=1040
  if product['id']=='sf-sofas-p25-36': y2=350
  crop=render.crop(tuple(round(v*scale) for v in (x1,y1,x2,y2)))
  crop.save(out/(product['id']+'.png'))
  # Browser thumbnails use the same isolated original image, not a 3D render.
  crop.thumbnail((800,450));crop.save('apps/frontend/public'+product['image'],quality=94)
  manifest.append(dict(id=product['id'],pdfPage=n,cropPDFPixels=[x1,y1,x2,y2],dimensions=product['referenceAudit']))
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Cropped {len(manifest)} original product references')
