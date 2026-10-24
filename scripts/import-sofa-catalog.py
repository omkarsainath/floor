"""Import local user-supplied Sofa Factory PDF via pdftohtml -xml output.
Usage: .venv311/bin/python scripts/import-sofa-catalog.py /tmp/sofa-extract/catalog.xml
Photos are composited in PDF coordinates, including mirrored image transforms.
"""
import sys,json,re, pathlib,xml.etree.ElementTree as E
from PIL import Image, ImageOps
root=E.parse(sys.argv[1]).getroot();out=pathlib.Path('apps/frontend/public/catalog/sofa-factory');out.mkdir(parents=True,exist_ok=True)
sections=[(11,25,'sofas'),(26,35,'economic-sofas'),(37,37,'recliners'),(39,40,'sofa-beds'),(43,44,'wooden-sofas'),(48,52,'dining-glass'),(53,60,'dining-marble'),(64,67,'antique-chairs'),(68,69,'relaxing-chairs'),(70,71,'pouffes'),(72,72,'center-glass'),(73,79,'center-marble')]
items=[]
audit_path=pathlib.Path(__file__).with_name('sofa-dimension-audit.json')
audited=json.loads(audit_path.read_text()) if audit_path.exists() else {}
for p in root.findall('page'):
 n=int(p.get('number'));cat=next((c for a,b,c in sections if a<=n<=b),None)
 if not cat:continue
 ts=[dict(t.attrib,text=''.join(t.itertext()).strip()) for t in p.findall('text')]
 for t in ts:
  for k in ['left','top','width','height']:t[k]=int(t[k])
 numbers=sorted([t for t in ts if t['font']=='26' and t['text'].isdigit()],key=lambda t:t['top'])
 imgs=[]
 for im in p.findall('image'):
  x,y,w,h=[int(im.get(k)) for k in ['left','top','width','height']]
  if abs(w)>850 or abs(h)>600 or abs(w)<50:continue
  imgs.append((im,min(x,x+w),min(y,y+h),abs(w),abs(h)))
 # Product photos sit above labels for sofas, beside labels for tables/chairs.
 sofa=cat in ['sofas','economic-sofas','wooden-sofas','recliners','sofa-beds']
 assigned={i:[] for i in range(len(numbers))}
 for im,x,y,w,h in imgs:
  if not numbers:continue
  idx=min(range(len(numbers)),key=lambda j:abs((y+h if sofa else y+h/2)-(numbers[j]['top'] if sofa else numbers[j]['top'])))
  assigned[idx].append((im,x,y,w,h))
 for idx,num in enumerate(numbers):
  y=num['top'];label=' '.join(t['text'] for t in sorted(ts,key=lambda t:(t['top'],t['left'])) if t['font']=='25' and abs(t['top']-y)<40 and t['left']>num['left']+num['width']-4)
  name=f"{label.title()} · {num['text']}";ident=f'sf-{cat}-p{n}-{num["text"]}'
  photos=assigned[idx]
  if not photos:raise RuntimeError((n,name,'missing photo'))
  x0=min(x for _,x,y,w,h in photos);y0=min(y for _,x,y,w,h in photos);x1=max(x+w for _,x,y,w,h in photos);y1=max(y+h for _,x,y,w,h in photos)
  canvas=Image.new('RGB',(x1-x0,y1-y0),'white')
  for im,x,y,w,h in photos:
   image=Image.open(im.get('src')).convert('RGBA')
   if int(im.get('width'))<0:image=ImageOps.mirror(image)
   if int(im.get('height'))<0:image=ImageOps.flip(image)
   image=image.resize((w,h));canvas.paste(image,(x-x0,y-y0),image)
  rendered=pathlib.Path(f'/tmp/sofa-pages/page-{n:02d}.png')
  if rendered.exists():canvas=Image.open(rendered).convert('RGB').crop((x0,y0,x1,y1))
  canvas.thumbnail((640,400));canvas.save(out/f'{ident}.webp',quality=90)
  # Dimension tables: rows of three numeric cells at x~220/270/315.
  end=numbers[idx+1]['top']-50 if idx+1<len(numbers) else 1110
  start=y-30 if sofa else y+35
  cells=[t for t in ts if start<=t['top']<end and 200<=t['left']<=365 and t['font']=='24']
  rows=[]
  for t in sorted(cells,key=lambda t:(t['top'],t['left'])):
   if not rows or abs(rows[-1][0]['top']-t['top'])>5:rows.append([])
   rows[-1].append(t)
  dims=[]
  for row in rows:
   row=sorted(row,key=lambda t:t['left']);nums=[float(t['text']) for t in row if re.fullmatch(r'\d+(?:\.\d+)?',t['text'])]
   if len(nums)==3 and all(8<=v<=160 for v in nums):dims.append(nums)
  default=[84,36,34] if sofa else [30,32,38] if 'chairs' in cat else [20,20,18] if cat=='pouffes' else [48,30,30 if 'dining' in cat else 18]
  values=dims[0] if dims else default
  corner=next((re.findall(r'\d+(?:\.\d+)?',t['text']) for t in cells if re.fullmatch(r'\d+\s*[Xx]\s*\d+',t['text'])),None)
  if sofa and corner:
   dh=[float(t['text']) for t in cells if re.fullmatch(r'\d+',t['text']) and t['left']>260]
   values=[float(corner[0]),float(corner[1]),dh[1] if len(dh)>1 else 34]
  # Page 25's nearby corner table belongs to Twin Wood, not the Viva 3+2 set.
  if ident=='sf-sofas-p25-37':
   corner=None;dims=[[82,35,37],[60,35,37]];values=dims[0]
  # Representative upholstery from non-white photograph pixels.
  sample=canvas.resize((64,64));colors=[rgb for rgb in sample.getdata() if 35<sum(rgb)/3<220 and max(rgb)-min(rgb)<130]
  color=tuple(sorted(c[i] for c in colors)[len(colors)//2] for i in range(3)) if colors else (155,140,125)
  item=dict(id=ident,label=name,category=cat,kind='pdf-furniture',image=f'/catalog/sofa-factory/{ident}.webp',page=n,code=num['text'],w=round(values[0]*.0254,4),d=round(values[1]*.0254,4),h=round(values[2]*.0254,4),color='#%02x%02x%02x'%color,corner=bool(sofa and corner),dimensionSource='PDF' if dims or corner else 'estimated',dimensionRows=dims,note=f'Sofa Factory PDF page {n}. Reference-based 3D model; photograph is the original product. '+('Dimensions from PDF.' if dims or corner else 'Dimensions estimated.'))
  item['productWidth']=item['w'];item['productDepth']=item['d']
  if ident=='sf-sofas-p18-19':
   item['seatingDepth']=.8636
  if 'dining' in cat:
   item['w']=round(item['w']+1.15,4);item['d']=round(item['d']+1.15,4)
  if sofa and not corner:
   match=re.search(r'[123](?:\s*\+\s*[123])+',label)
   if match:
    item['setSeats']=[int(v) for v in re.findall(r'[123]',match.group())]
    item['w']=round(item['w']+item['d']*(1.1 if len(item['setSeats'])==2 else 2.2),4)
    item['d']=round(item['d']*2.8,4)
  item.update(audited.get(ident,{}))
  items.append(item)
pathlib.Path('apps/frontend/src/generators/sofaFactoryCatalog.json').write_text(json.dumps(items,indent=2)+'\n')
print('Imported',len(items),'products');from collections import Counter;print(Counter(i['category'] for i in items))
# Contact sheet to review image assignment and variants.
thumb=Image.new('RGB',(800,((len(items)+7)//8)*90),'white')
from PIL import ImageDraw
for j,item in enumerate(items):
 im=Image.open(out/(item['id']+'.webp'));im.thumbnail((96,65));x=j%8*100;y=j//8*90;thumb.paste(im,(x,y));ImageDraw.Draw(thumb).text((x,y+66),f"p{item['page']} {item['code']}",fill='black')
thumb.save('/tmp/sofa-contact.jpg')
