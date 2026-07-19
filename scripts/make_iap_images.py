"""IAP 코인 상품 이미지 생성 (1024x1024, 콘솔 업로드용)"""
from PIL import Image, ImageDraw, ImageFont
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets", "iap")
os.makedirs(OUT, exist_ok=True)

S = 4  # 슈퍼샘플링 배율 (안티앨리어싱)
W = 1024 * S

FONT = "C:/Windows/Fonts/malgunbd.ttf"  # 맑은고딕 볼드

GOLD = (255, 200, 60)
GOLD_DARK = (222, 160, 30)
GOLD_EDGE = (190, 130, 20)
NAVY_TOP = (20, 29, 48)
NAVY_BOT = (31, 45, 78)


def bg_gradient(img):
    d = ImageDraw.Draw(img)
    for y in range(img.height):
        t = y / img.height
        c = tuple(int(NAVY_TOP[i] + (NAVY_BOT[i] - NAVY_TOP[i]) * t) for i in range(3))
        d.line([(0, y), (img.width, y)], fill=c)


def draw_coin(d, cx, cy, r):
    """옆에서 본 동전 (두께 있는 타원)"""
    thick = r * 0.32
    ry = r * 0.62
    # 옆면
    d.ellipse([cx - r, cy - ry + thick, cx + r, cy + ry + thick], fill=GOLD_EDGE)
    d.rectangle([cx - r, cy, cx + r, cy + thick], fill=GOLD_EDGE)
    # 윗면
    d.ellipse([cx - r, cy - ry, cx + r, cy + ry], fill=GOLD, outline=GOLD_DARK, width=int(r * 0.05))
    # 안쪽 링
    ir = r * 0.72
    d.ellipse([cx - ir, cy - ry * 0.72, cx + ir, cy + ry * 0.72], outline=GOLD_DARK, width=int(r * 0.045))


def make(count, stack):
    img = Image.new("RGB", (W, W))
    bg_gradient(img)
    d = ImageDraw.Draw(img)

    # 코인 스택 (아래에서 위로)
    cx = W / 2
    r = W * 0.21
    step = r * 0.34
    base_y = W * 0.44
    for i in range(stack):
        draw_coin(d, cx, base_y - i * step, r)

    # 맨 위 코인에 '코인' 각인
    top_y = base_y - (stack - 1) * step
    f_stamp = ImageFont.truetype(FONT, int(r * 0.40))
    d.text((cx, top_y - r * 0.40 * 0.10), "코인", font=f_stamp, fill=GOLD_EDGE, anchor="mm")

    # 개수 텍스트
    f_num = ImageFont.truetype(FONT, int(W * 0.17))
    d.text((cx, W * 0.70), f"{count}", font=f_num, fill=(255, 255, 255), anchor="mm")

    f_label = ImageFont.truetype(FONT, int(W * 0.055))
    d.text((cx, W * 0.82), "코인", font=f_label, fill=(160, 180, 220), anchor="mm")

    out = img.resize((1024, 1024), Image.LANCZOS)
    path = os.path.join(OUT, f"coin_{count}.png")
    out.save(path)
    print("saved:", path)


make(10, 1)
make(35, 3)
make(100, 5)
