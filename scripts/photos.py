"""Builds public/img/*.webp (max 1280px) and public/img/t/*.webp (480px thumbs) from the source photos.
Sources: Donald's Eshcol share-page zip (extracted under /workspace/occupancy-portal/site) and the public
websites listed in docs/PROPERTY-DATA.md (downloaded to /tmp/ph). Re-run: python3 scripts/photos.py"""
import os
from PIL import Image, ImageOps

Z = '/workspace/occupancy-portal/site/Eshcol Share Page Small 20260707-183938/images/PXL_20260706_'
W = '/tmp/ph/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'img')
M = {
    'eshcol-exterior': '/workspace/occupancy-portal/site/Eshcol Share Page Small 20260707-183938/images/DSC_5493-01.jpg',
    'eshcol-entrance': Z + '115703689.jpg',
    'eshcol-kitchen': Z + '115210849.jpg',
    'eshcol-games': Z + '115430907.jpg',
    'eshcol-deck': Z + '115607724.jpg',
    'eshcol-lounge': Z + '121437538.jpg',
    'eshcol-flat-kitchen': Z + '121840362.jpg',
    'eshcol-room1': Z + '115830493.jpg', 'eshcol-room1-bath': Z + '120558758.jpg',
    'eshcol-room2': Z + '115914996.jpg', 'eshcol-room2-bath': Z + '115956339.jpg',
    'eshcol-room3': Z + '120036680.MP.jpg', 'eshcol-room3-bath': Z + '120123271.MP.jpg',
    'eshcol-room4': Z + '120329498.jpg', 'eshcol-room4-bath': Z + '120511662.jpg',
    'eshcol-room5': Z + '121120102.jpg', 'eshcol-room5-bath': Z + '121042801.jpg',
    'eshcol-room6': Z + '121222547.MP.jpg', 'eshcol-room6-bath': Z + '121340924.jpg',
    'eshcol-room7': Z + '120753203.jpg', 'eshcol-room7-bath': Z + '120944752.jpg',
    'eshcol-room8': Z + '122000921.jpg', 'eshcol-flat-shower': Z + '121813045.jpg',
    'eshcol-room9': Z + '122111202.jpg',
    'eshcol-room10': Z + '122208240.jpg', 'eshcol-room10-bath': Z + '122305611.jpg',
    'pod-exterior': W + 'g-IMG-20190612-WA0002.jpg', 'pod-inside': W + 'cab2.jpg', 'pod-bed': W + 'cab3.jpg',
    'pod-shower': W + 'cab5.jpg', 'pod-kitchen': W + 'g-49223539188_4dd89f09c1_o.jpg', 'pod-view': W + 'cab1.jpg',
    'cottage-exterior': W + 'cot7.jpg', 'cottage-lounge': W + 'cot2.jpg', 'cottage-kitchen': W + 'cot1.jpg',
    'cottage-bed1': W + 'cot3.jpg', 'cottage-spa': W + 'cot4.jpg', 'cottage-bed2': W + 'cot5.jpg',
    'cottage-room3': W + 'cot6.jpg',
    'whitefalls-exterior': W + 'wf1.jpg', 'whitefalls-lounge': W + 'wf2.jpg', 'whitefalls-kitchen': W + 'wf3.jpg',
    'whitefalls-bedroom': W + 'wf4.jpg', 'whitefalls-spa': W + 'wf5.jpg',
}
os.makedirs(os.path.join(OUT, 't'), exist_ok=True)
total = 0
for name, src in M.items():
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    for d, size, q in (('', 1280, 72), ('t', 480, 66)):
        x = im.copy()
        x.thumbnail((size, size), Image.LANCZOS)
        p = os.path.join(OUT, d, name + '.webp')
        x.save(p, 'WEBP', quality=q, method=6)
        total += os.path.getsize(p)
print(len(M), 'photos', round(total / 1e6, 2), 'MB')
