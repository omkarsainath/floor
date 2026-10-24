"""Extract catalogue swatches without labels/shadows. Requires pymupdf."""
import json, re, sys
from pathlib import Path
import pymupdf as fitz

pages = [
 ['Black Pearl|Black Forest|Black Galaxy|Jet Black|Absolute Black', 'Steel Grey|Black Markino|Bengal Black|Impala Black|Premium Black', 'Crystal Yellow|River Gold|New Kashmir Gold|Imperial Gold|Colonial Gold', 'Desert Brown|Rosewood|Ivory Brown|Bhama Ivory|Astoria Ivory'],
 ['New Kashmir White|Imperial White|Moon White|River White|Colonial White', 'Platinum White|White Galaxy|Amba White|Mayflower White|Viscon White', 'Indian Juprana|French White|Blue Dunes|Alaska White|Monte Cristo', 'Colombo Juprana|Sira Grey|Lavender Blue|Himalaya Pink|Rosy Pink'],
 ['Romantic Pink|Atlantic Blue|Paradiso Classic|Paradiso Bash|Chiku Pearl', 'Hassan Green|Kuppam Green|Crystal Blue|Vizag Blue|Flash Blue', 'Red Pearl|Imperial Red|Multicolor Red|Cat’s Eye|Asian Top', 'Adoni Brown|Sapphire Blue|Indian Mahogany|Coffee Brown|Tan Brown'],
 ['Rainforest Gold|Rain Forest Brown|Mercury Black|Forest Green|Fantasy Brown', 'Makrana Brown|Makrana Pure White|Toronto|Spider Green|Rainforest Green', 'Black Marinace|Bianco Antico|Azul Bahia|Aquarius|Antique Brown', 'Crema Delicatus|Cosmic Black|Volga Blue|Calcita Blue|Blue Pearl'],
 ['Matrix|Magma Gold|Lemurian Blue|Labrador Brown|Emerald Pearl', 'Vienna|Titanium|Santa Cecilia|Palleon|Nilo River', 'Crema Marfil|Carrara|Breccia Oniciata|Breccia Classica|Botticino Classico', 'Golden Empire|Emperador Light|Emperador Dark|Diana|Desert Beige'],
 ['Rosso Levanto|Renero|Perlato Sicilia|Golden Wave|Golden Potro', 'Travertino Rosso Persiano|Travertino Beige|Travertino Aban|Supren|Statuario'],
]
root=Path(__file__).resolve().parents[1]
out=root/'apps/frontend/public/catalog/lavina';out.mkdir(parents=True,exist_ok=True)
doc=fitz.open(sys.argv[1]);catalog=[]
for index, columns in enumerate(pages):
    page=doc[index+5]
    for col, names in enumerate(columns):
        for row, name in enumerate(reversed(names.split('|'))):
            x=[75.75,361.49,656.17,943.08][col];y=[70.12,226.02,381.59,536.98,692.78][row]
            rect=fitz.Rect(x+1,y+1,x+226,y+126)
            slug='lavina-'+re.sub('[^a-z0-9]+','-',name.lower()).strip('-')
            page.get_pixmap(matrix=fitz.Matrix(2,2),clip=rect,alpha=False).save(str(out/(slug+'.jpg')))
            kind='Granite' if index<3 or (index==3 and col>=2) or (index==4 and col<2) else 'Marble'
            catalog.append(dict(id=slug,name=name,kind=kind,image='/catalog/lavina/'+slug+'.jpg',page=index+6))
target=root/'apps/frontend/src/materials/stoneCatalog.js'
target.write_text('export default '+json.dumps(catalog,indent=2)+';\n')
print(f'Extracted {len(catalog)} named stone swatches')
