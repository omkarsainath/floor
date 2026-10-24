"""Import verified swatches from the user-supplied Greenlam PDF.
Requires Pillow + Poppler. Usage: python3 scripts/import-greenlam-catalog.py PDF
Coordinates refer to a 2048-pixel-wide rendering, inset to exclude type/QR codes.
The filename says 2023-2025; the actual cover and metadata say 2025-2027.
This is a curated selection, not a transcription of the entire design index.
"""
from pathlib import Path
from PIL import Image, ImageStat
import json, subprocess, sys, tempfile, shutil

items=[]
# Standard spread positions: large left; two half-height + one tall right.
L=(111,142,924,957); LA=(124,142,501,517); LB=(124,582,501,957); LC=(534,142,911,957)
RA=(1149,142,1526,517); RB=(1149,582,1526,957); RC=(1559,142,1936,957)
R4=[(1149,142,1323,517),(1353,142,1526,517),(1149,584,1323,957),(1353,584,1526,957),RC]
def add(page,finish,kind,entries):
 for code,name,rect in entries:items.append(dict(id=f'gl-{code}-{finish.lower()}',code=str(code),name=name,finish=finish,kind=kind,pdfPage=page,printedPage=2*page-3+(rect[0]>1024),crop=rect))
def series(page,finish,kind,rects,values):
 add(page,finish,kind,[(code,name,r) for r,(code,name) in zip(rects,values,strict=True)])
series(10,'ARN','textile',[L,RA,RB,RC],[(175,'Heather'),(5648,'Luis Grey'),(5649,'Luis Brown'),(5641,'Kimono')])
series(11,'ARN','textile',[LA,LB,LC]+R4,[(148,'Tidal Sand'),(5643,'Manilla Beige'),(5642,'Manilla Taupe'),(5591,'Kota Pearl'),(5592,'Kota Sage'),(5601,'Woven Ash Grey'),(5602,'Woven Anthracite'),(401,'Black')])
series(12,'BRL','wood',[L,RA,RB,RC],[(5106,'Palermo Oak'),(5101,'Horizon Elm Beige'),(5102,'Horizon Elm Brown'),(277,'Charcoal')])
series(13,'BRL','wood',[LA,LB,LC]+R4,[(774,'Munich Acacia'),(5076,'Primeval Oak'),(5383,'Chelsea Chestnut Anthracite'),(5311,'California Ash'),(608,'American Walnut'),(5382,'Chelsea Chestnut Brown'),(5078,'Esoteric Oak'),(682,'Hiland Pine')])
series(14,'CNY','stone',[L,RA,RB,RC],[(5673,'Samsara'),(5672,'Capitol Travertine'),(5671,'Tivoli Travertine'),(5675,'Marco Marble')])
series(15,'CNY','stone',[LA,LB,LC,RA,RB,RC],[(265,'Grey Sand'),(277,'Charcoal'),(5674,'Zeus Brown'),(5596,'Manitoba'),(132,'Cyclone'),(5583,'Visconti')])
rects=[(x,y,x+158,end) for y,end in [(129,287),(358,518),(583,958)] for x in [1159,1358,1556,1755]]
series(16,'AFX','solid',rects,[(9851,'White X'),(9854,'Dove'),(9858,'Victorian Violet'),(9857,'Country Blue'),(9855,'Basalt Grey'),(9852,'Eden Grey'),(9859,'Sea Weed Green'),(9860,'Twilight Blue'),(9862,'Titan'),(9853,'Anthracite'),(9856,'Coffee Bean'),(9861,'Black X')])
for row,pair in enumerate([[(90107,'Wool'),(90124,'Mysore Ivory')],[(90207,'Divine Yellow'),(90217,'Light Orange')],[(90204,'Red Dynasty'),(90401,'Black')]]):
 for col,(code,name) in enumerate(pair):
  for k,finish in enumerate(['UNI-SUD','UNI-HDG']):
   x=[1164,1363,1561,1760][col*2+k];y=[209,435,659][row]
   add(17,finish,'solid',[(code,name,(x,y,x+158,y+158))])
rects=[(x,y,x+158,y+159) for y in [569,798] for x in [151,342,537,727]]+[(x,y,x+158,end) for y,end in [(127,285),(356,516),(582,957)] for x in [1176,1367,1561,1752]]
series(18,'SAT','solid',rects,[(111,'Designer White'),(107,'Wool'),(124,'Mysore Ivory'),(132,'Cyclone'),(271,'Light Grey'),(272,'Cloud'),(266,'Ash Grey'),(261,'Dark Grey'),(248,'Leaf Green'),(240,'Eucalyptus'),(467,'Mermaid'),(296,'Fog'),(274,'Pine Nut'),(244,'Green Pepper'),(245,'Dark Green'),(364,'Emerald'),(303,'Zephyr Blue'),(291,'Electric Blue'),(297,'Blue Galaxy'),(401,'Black')])
series(19,'SAT','solid',[(x,y,x+158,end) for y,end in [(142,517),(582,957)] for x in [151,342,537,727]]+[RA,RB,RC],[(175,'Heather'),(173,'Barbie Pink'),(203,'Red'),(452,'Plum'),(174,'Powder Pink'),(205,'Brick'),(138,'Terracotta'),(466,'Dark Cherry'),(146,'Oatmeal'),(181,'Chocolate'),(137,'Mustard')])
series(22,'SAT','wood',[L,(1149,142,1526,957),RC],[(5107,'Vienna Beech'),(5106,'Palermo Oak'),(5379,'Manor')])
series(25,'HDG','solid',[(127,568,286,727),(318,568,477,727),(529,568,906,727),(127,798,286,957),(318,798,477,957),(529,798,906,957)]+R4,[(101,'White'),(107,'Wool'),(124,'Mysore Ivory'),(270,'Silver Grey'),(261,'Dark Grey'),(401,'Black'),(295,'Azur'),(467,'Mermaid'),(243,'Sea Green'),(364,'Emerald'),(240,'Eucalyptus')])
series(30,'VRB','wood',[L,(1149,142,1526,957),RC],[(5101,'Horizon Elm Beige'),(5102,'Horizon Elm Brown'),(9605,'Livid Teak')])
series(33,'SY1','wood',[LA,LB,LC],[(5352,'Rovigo Elm'),(5353,'Rosenheim Elm'),(5351,'Cardiff Elm')])
series(33,'SY2','wood',[RA,RB,RC],[(5355,'Valencia Ash'),(5356,'Toledo Ash'),(5354,'Leon Ash')])
series(34,'SGL','solid',[(x,y,x+174,end) for y,end in [(142,517),(582,957)] for x in [126,329,533,737]]+[RA,(1559,142,1936,517),RB,(1559,582,1936,957)],[(101,'White'),(107,'Wool'),(124,'Mysore Ivory'),(148,'Tidal Sand'),(362,'Niagara'),(300,'Robin Blue'),(458,'Noir Current'),(401,'Black'),(229,'Yellow'),(217,'Light Orange'),(257,'Olive'),(361,'Golf Green')])
series(35,'SGL','stone',[(124,142,501,957),LC,(1149,142,1526,957),RC],[(5674,'Zeus Brown'),(5675,'Marco Marble'),(5584,'Athena'),(5575,'Black Marmor')])
series(36,'SGL','stone',[(124,142,501,957),LC,(1149,142,1526,957),RC],[(5574,'Statuario'),(5583,'Visconti'),(5597,'Sanganer Pearl'),(5596,'Manitoba')])

def main():
 pdf=Path(sys.argv[1]);out=Path('apps/frontend/public/catalog/greenlam');out.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='greenlam-import-') as tmp:
  cache={}
  for p in sorted({i['pdfPage'] for i in items}):
   prefix=str(Path(tmp)/str(p));subprocess.run(['pdftoppm','-f',str(p),'-l',str(p),'-singlefile','-scale-to','2400','-png',str(pdf),prefix],check=True)
   cache[p]=Image.open(prefix+'.png').convert('RGB')
  for item in items:
   page=cache[item['pdfPage']];s=page.width/2048
   x,y,x1,y1=item['crop'];crop=page.crop(tuple(round(v*s) for v in [x+4,y+4,x1-4,y1-4]));crop.thumbnail((768,1024))
   item['sampleAspect']=round(crop.width/crop.height,5)
   item['color']='#%02x%02x%02x'%tuple(round(v) for v in ImageStat.Stat(crop.resize((32,32))).median)
   filename=item['id']+'.webp';crop.save(out/filename,quality=92);item['image']='/catalog/greenlam/'+filename
  shutil.copyfile(pdf,out/'source.pdf')
 Path('apps/frontend/src/materials/greenlamCatalog.json').write_text(json.dumps(items,indent=2)+'\n')
 print(f'Imported {len(items)} verified swatches across {len(cache)} PDF spreads.')
if __name__=='__main__':main()
