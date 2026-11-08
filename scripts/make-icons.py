"""Generate the wrapper's original app icons. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]
out=root/"icons";out.mkdir(exist_ok=True)
im=Image.new("RGB",(1024,1024),"#111b2b")
d=ImageDraw.Draw(im)
d.arc((186,174,838,826),35,300,fill="#a4ed72",width=52)
d.polygon([(744,166),(807,318),(641,287)],fill="#a4ed72")
d.ellipse((438,282,550,394),fill="#f4f7fb")
d.line([(490,416),(550,548),(454,654)],fill="#f4f7fb",width=62,joint="curve")
d.line([(500,450),(356,462),(306,370)],fill="#f4f7fb",width=45,joint="curve")
d.line([(516,456),(622,392),(672,310)],fill="#f4f7fb",width=45,joint="curve")
d.line([(550,548),(658,620),(618,718)],fill="#f4f7fb",width=49,joint="curve")
for name,size in [("icon-192.png",192),("icon-512.png",512),("icon-maskable-512.png",512),("apple-touch-icon.png",180)]:
    im.resize((size,size),Image.Resampling.LANCZOS).save(out/name)
