"""
Nehgz Bot — App Store / Play Store screenshot generator.

Builds 4 marketing screenshots at 1320 x 2868 (iPhone 6.9" required size,
also accepted for 6.5"). Each screenshot has:
  - Brand gradient background (deep blue -> royal -> yellow accent)
  - Bold Arabic headline + English subhead
  - A photoreal phone-frame mockup showing the corresponding app screen

Uses Pillow + RAQM for proper Arabic shaping. Fonts are pulled from the
project's existing Next.js subset (Noto Sans Arabic + Inter).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---- Paths ------------------------------------------------------------------

OUT_DIR = Path("/sessions/clever-blissful-lamport/mnt/outputs/store-assets")
OUT_DIR.mkdir(parents=True, exist_ok=True)

ICON_PATH = "/sessions/clever-blissful-lamport/mnt/whatsapp-cs/mobile/assets/icon.png"
ARABIC_TTF = "/tmp/fonts/NotoSansArabic.ttf"
INTER_TTF = "/tmp/fonts/Inter.ttf"

# ---- Brand ------------------------------------------------------------------

BRAND_NAVY = (24, 44, 110)        # deep brand blue
BRAND_ROYAL = (37, 70, 175)
BRAND_YELLOW = (255, 197, 27)
BRAND_WHITE = (255, 255, 255)
BRAND_OFFWHITE = (240, 244, 255)
WA_GREEN = (37, 211, 102)
TEXT_DARK = (15, 23, 42)
TEXT_MUTED = (100, 116, 139)

# Canvas (iPhone 6.9" = 1320 x 2868, also covers 6.5")
W, H = 1320, 2868


# ---- Helpers ----------------------------------------------------------------


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM)


def is_arabic(ch: str) -> bool:
    o = ord(ch)
    return (
        0x0600 <= o <= 0x06FF
        or 0xFB50 <= o <= 0xFDFF
        or 0xFE70 <= o <= 0xFEFF
    )


def split_runs(text: str) -> List[Tuple[str, str]]:
    """Split text into runs of (kind, text) where kind is 'ar' or 'lat'.
    Spaces, digits, and punctuation attach to the surrounding run; if no
    surrounding context, default to 'lat'."""
    if not text:
        return []
    runs: List[Tuple[str, str]] = []
    cur_kind = None
    cur_buf: List[str] = []
    for ch in text:
        if is_arabic(ch):
            kind = "ar"
        elif ch.isalpha():
            kind = "lat"
        else:
            kind = cur_kind or "lat"
        if kind != cur_kind and cur_buf:
            runs.append((cur_kind, "".join(cur_buf)))
            cur_buf = []
        cur_kind = kind
        cur_buf.append(ch)
    if cur_buf:
        runs.append((cur_kind, "".join(cur_buf)))
    return runs


def has_arabic(text: str) -> bool:
    return any(is_arabic(ch) for ch in text)


_ASCII_TO_ARABIC_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def ar_digits(text: str) -> str:
    """Convert ASCII digits to Arabic-Indic digits (so they stay inside the
    Arabic font's glyph set)."""
    return text.translate(_ASCII_TO_ARABIC_DIGITS)


def smart_font(text: str, size: int) -> ImageFont.FreeTypeFont:
    """Pick Arabic font if string has any Arabic, else Latin."""
    return load_font(ARABIC_TTF if has_arabic(text) else INTER_TTF, size)


def draw_mixed(
    d: ImageDraw.ImageDraw,
    pos: Tuple[int, int],
    text: str,
    *,
    arabic_font: ImageFont.FreeTypeFont,
    latin_font: ImageFont.FreeTypeFont,
    fill,
    align: str = "ltr",
) -> int:
    """Render mixed-script text with the right font per run.

    Returns total advance width.
    For Arabic-leading text use align='rtl' and pass pos as the right-edge
    starting point; runs are drawn right-to-left.
    """
    runs = split_runs(text)
    x, y = pos
    if align == "rtl":
        # Draw runs in reverse so they accumulate from the right edge
        cursor = x
        for kind, t in runs:
            font = arabic_font if kind == "ar" else latin_font
            bbox = font.getbbox(t)
            w = bbox[2] - bbox[0]
            cursor -= w
            d.text((cursor, y), t, font=font, fill=fill)
        return x - cursor
    else:
        cursor = x
        for kind, t in runs:
            font = arabic_font if kind == "ar" else latin_font
            d.text((cursor, y), t, font=font, fill=fill)
            bbox = font.getbbox(t)
            cursor += bbox[2] - bbox[0]
        return cursor - x


def gradient_bg(w: int, h: int, top: tuple, bottom: tuple) -> Image.Image:
    img = Image.new("RGB", (w, h), top)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def soft_circle(diameter: int, color: tuple, alpha: int = 160) -> Image.Image:
    layer = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((0, 0, diameter, diameter), fill=color + (alpha,))
    return layer.filter(ImageFilter.GaussianBlur(diameter // 6))


def rounded_rect(
    img: Image.Image,
    box: Tuple[int, int, int, int],
    radius: int,
    fill,
    outline=None,
    width: int = 0,
):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def drop_shadow(
    base: Image.Image,
    shape_img: Image.Image,
    offset: Tuple[int, int],
    blur: int,
    color: tuple = (0, 0, 0),
    alpha: int = 120,
) -> Image.Image:
    """Paste shape_img onto base with a soft drop shadow underneath."""
    sw, sh = shape_img.size
    shadow = Image.new("RGBA", (sw + blur * 4, sh + blur * 4), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    # silhouette of the shape
    if shape_img.mode != "RGBA":
        shape_img = shape_img.convert("RGBA")
    alpha_chan = shape_img.split()[-1]
    silhouette = Image.new("RGBA", shape_img.size, color + (alpha,))
    silhouette.putalpha(alpha_chan.point(lambda v: int(v * alpha / 255)))
    shadow.paste(silhouette, (blur * 2, blur * 2), silhouette)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(shadow, (offset[0] - blur * 2, offset[1] - blur * 2))
    base.alpha_composite(shape_img, offset)
    return base


# ---- Phone frame (iPhone-ish) ----------------------------------------------


def phone_frame(content: Image.Image) -> Image.Image:
    """Wrap a screen image (portrait) into a soft iPhone-ish frame."""
    cw, ch = content.size
    bezel = 28
    frame_w = cw + bezel * 2
    frame_h = ch + bezel * 2
    radius = 110

    frame = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)

    # Outer body — near-black with subtle bevel
    d.rounded_rectangle((0, 0, frame_w, frame_h), radius=radius, fill=(15, 18, 28, 255))
    # Inner bezel highlight
    d.rounded_rectangle(
        (4, 4, frame_w - 4, frame_h - 4),
        radius=radius - 4,
        outline=(60, 70, 100, 255),
        width=2,
    )

    # Screen
    screen_layer = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    mask = Image.new("L", (cw, ch), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, cw, ch), radius=radius - bezel, fill=255)
    screen_layer.paste(content.convert("RGBA"), (0, 0), mask=mask)

    frame.paste(screen_layer, (bezel, bezel), screen_layer)

    # Dynamic Island
    isl_w, isl_h = int(cw * 0.36), 70
    isl_x = bezel + (cw - isl_w) // 2
    isl_y = bezel + 26
    d.rounded_rectangle(
        (isl_x, isl_y, isl_x + isl_w, isl_y + isl_h),
        radius=isl_h // 2,
        fill=(8, 10, 16, 255),
    )

    return frame


# ---- Status bar -------------------------------------------------------------


def draw_status_bar(d: ImageDraw.ImageDraw, x: int, y: int, w: int, color=(15, 23, 42)):
    f = load_font(INTER_TTF, 30)
    d.text((x + 36, y + 12), "9:41", font=f, fill=color)
    # Right side icons (signal, wifi, battery) — simple shapes
    rx = x + w - 36
    # Battery
    d.rounded_rectangle((rx - 70, y + 18, rx, y + 38), radius=4, outline=color, width=2)
    d.rounded_rectangle((rx - 66, y + 22, rx - 26, y + 34), radius=2, fill=color)
    # Wifi (dots)
    d.pieslice((rx - 130, y + 14, rx - 90, y + 54), 200, 340, fill=color)
    # Signal
    for i, h in enumerate([8, 14, 20, 26]):
        d.rectangle(
            (rx - 200 + i * 12, y + 38 - h, rx - 192 + i * 12, y + 38), fill=color
        )


# ---- Background composition --------------------------------------------------


def make_background() -> Image.Image:
    bg = gradient_bg(W, H, (12, 26, 84), (32, 70, 196)).convert("RGBA")
    # Glow blobs
    glow1 = soft_circle(900, BRAND_YELLOW, alpha=70)
    bg.alpha_composite(glow1, (-200, 1900))
    glow2 = soft_circle(1100, (120, 180, 255), alpha=60)
    bg.alpha_composite(glow2, (W - 600, -300))
    glow3 = soft_circle(700, (255, 120, 180), alpha=40)
    bg.alpha_composite(glow3, (W // 2 - 350, H // 2 - 350))
    return bg


# ---- Header (logo + headline) -----------------------------------------------


def draw_header(
    canvas: Image.Image, headline_ar: str, subhead_en: str, accent: tuple = BRAND_YELLOW
):
    d = ImageDraw.Draw(canvas)

    # Tiny brand chip
    chip_w, chip_h = 360, 80
    chip_x = (W - chip_w) // 2
    chip_y = 130
    d.rounded_rectangle(
        (chip_x, chip_y, chip_x + chip_w, chip_y + chip_h),
        radius=chip_h // 2,
        fill=(255, 255, 255, 38),
        outline=(255, 255, 255, 80),
        width=2,
    )
    f_chip = load_font(INTER_TTF, 32)
    d.text(
        (chip_x + 60, chip_y + 22),
        "NEHGZ BOT",
        font=f_chip,
        fill=BRAND_WHITE,
    )
    # Yellow dot
    d.ellipse((chip_x + 26, chip_y + 32, chip_x + 50, chip_y + 56), fill=accent)

    # Arabic headline (large, centered)
    f_head_ar = load_font(ARABIC_TTF, 110)
    # Center each line
    for i, line in enumerate(headline_ar.split("\n")):
        bbox = d.textbbox((0, 0), line, font=f_head_ar)
        tw = bbox[2] - bbox[0]
        d.text(
            ((W - tw) // 2, 260 + i * 130),
            line,
            font=f_head_ar,
            fill=BRAND_WHITE,
        )

    # English subhead
    f_sub = load_font(INTER_TTF, 44)
    bbox = d.textbbox((0, 0), subhead_en, font=f_sub)
    tw = bbox[2] - bbox[0]
    d.text(
        ((W - tw) // 2, 260 + (headline_ar.count("\n") + 1) * 130 + 30),
        subhead_en,
        font=f_sub,
        fill=accent,
    )


# ---- Inner UI mockups -------------------------------------------------------


def screen_size() -> Tuple[int, int]:
    """Inner phone-screen dimensions (portrait)."""
    return 980, 2010


def screen_inbox() -> Image.Image:
    sw, sh = screen_size()
    img = Image.new("RGB", (sw, sh), BRAND_OFFWHITE)
    d = ImageDraw.Draw(img)

    # Top bar
    d.rectangle((0, 0, sw, 100), fill=BRAND_OFFWHITE)
    draw_status_bar(d, 0, 0, sw)

    # Header — Arabic title right-aligned
    f_title = load_font(ARABIC_TTF, 56)
    bb = d.textbbox((0, 0), "صندوق الوارد", font=f_title)
    d.text((sw - 40 - (bb[2] - bb[0]), 130), "صندوق الوارد", font=f_title, fill=TEXT_DARK)
    f_meta = load_font(INTER_TTF, 30)
    d.text((40, 150), "12 active", font=f_meta, fill=TEXT_MUTED)

    # Filter chips (lay out from right)
    chips = [("الكل", True), ("غير مقروء", False), ("مصعد", False), ("مغلق", False)]
    cx = sw - 40
    for label, active in chips:
        f_chip = load_font(ARABIC_TTF, 30)
        bbox = d.textbbox((0, 0), label, font=f_chip)
        cw = bbox[2] - bbox[0] + 50
        d.rounded_rectangle(
            (cx - cw, 230, cx, 290),
            radius=30,
            fill=BRAND_NAVY if active else (255, 255, 255),
            outline=BRAND_NAVY if active else (210, 215, 230),
            width=2,
        )
        d.text(
            (cx - cw + 25, 240),
            label,
            font=f_chip,
            fill=BRAND_WHITE if active else TEXT_DARK,
        )
        cx -= cw + 16

    # Conversation rows
    rows = [
        ("سارة العتيبي", "تمام احجزيلي طاولة لاربعة", "9:42", 2, True, "AI"),
        ("Mohammed K.", "Can I reschedule to Friday?", "9:31", 0, False, "AI"),
        ("نورة الدوسري", "كم سعر باقة الخصم", "9:18", 1, False, "AI"),
        ("أحمد", "شكرا تم الاستلام", "8:55", 0, False, "—"),
        ("Layla A.", "Need to escalate billing issue", "8:40", 0, True, "ESC"),
        ("فهد العنزي", "هل المطعم مفتوح الان", "8:22", 0, False, "AI"),
    ]
    # Arabic-first (RTL) conversation rows: avatar on the right.
    y = 340
    ar_to_lat = {
        "س": "S", "م": "M", "ن": "N", "أ": "A", "ا": "A",
        "ل": "L", "ف": "F", "ك": "K", "ر": "R", "ع": "A",
    }
    for name, msg, time, unread, escalated, tag in rows:
        d.rounded_rectangle(
            (24, y, sw - 24, y + 165), radius=24, fill=(255, 255, 255)
        )
        d.rounded_rectangle(
            (24, y, sw - 24, y + 165),
            radius=24,
            outline=(232, 236, 245),
            width=2,
        )

        # Avatar on RIGHT
        first = name[0]
        initial = ar_to_lat.get(first, first.upper())
        ax_l, ax_r = sw - 162, sw - 52
        d.ellipse((ax_l, y + 25, ax_r, y + 135), fill=BRAND_NAVY)
        f_av = load_font(INTER_TTF, 44)
        bb = d.textbbox((0, 0), initial, font=f_av)
        d.text((ax_l + (110 - (bb[2] - bb[0])) // 2, y + 60), initial, font=f_av, fill=BRAND_WHITE)

        # Name (right side, immediately to LEFT of avatar)
        f_name = smart_font(name, 36)
        bbn = d.textbbox((0, 0), name, font=f_name)
        d.text((ax_l - 20 - (bbn[2] - bbn[0]), y + 35), name, font=f_name, fill=TEXT_DARK)

        # Time (top-left of row)
        f_time = load_font(INTER_TTF, 24)
        d.text((52, y + 42), time, font=f_time, fill=TEXT_MUTED)

        # Tag pill — to the left of the time
        if tag == "AI":
            d.rounded_rectangle((130, y + 38, 210, y + 78), radius=20, fill=(220, 240, 255))
            f_tag = load_font(INTER_TTF, 24)
            d.text((146, y + 44), "AI", font=f_tag, fill=BRAND_NAVY)
        elif tag == "ESC":
            d.rounded_rectangle((130, y + 38, 230, y + 78), radius=20, fill=(255, 224, 224))
            f_tag = load_font(INTER_TTF, 22)
            d.text((148, y + 46), "ESC", font=f_tag, fill=(160, 30, 30))

        # Message preview (right-aligned for Arabic, left for Latin)
        f_msg = smart_font(msg, 28)
        bbm = d.textbbox((0, 0), msg, font=f_msg)
        if has_arabic(msg):
            d.text((ax_l - 20 - (bbm[2] - bbm[0]), y + 95), msg, font=f_msg, fill=TEXT_MUTED)
        else:
            d.text((52, y + 95), msg, font=f_msg, fill=TEXT_MUTED)

        # Unread badge (bottom-left)
        if unread:
            d.ellipse((52, y + 115, 102, y + 155), fill=WA_GREEN)
            f_b = load_font(INTER_TTF, 24)
            bb = d.textbbox((0, 0), str(unread), font=f_b)
            d.text((52 + (50 - (bb[2] - bb[0])) // 2, y + 122), str(unread), font=f_b, fill=BRAND_WHITE)

        y += 185

    # Bottom tab bar
    d.rectangle((0, sh - 130, sw, sh), fill=(255, 255, 255))
    d.line((0, sh - 130, sw, sh - 130), fill=(225, 228, 240), width=2)
    tabs = ["محادثات", "حجوزات", "حملات", "فريق", "حسابي"]
    tw = sw // len(tabs)
    f_tab = load_font(ARABIC_TTF, 24)
    for i, t in enumerate(tabs):
        bbox = d.textbbox((0, 0), t, font=f_tab)
        x = i * tw + (tw - (bbox[2] - bbox[0])) // 2
        color = BRAND_NAVY if i == 0 else TEXT_MUTED
        d.ellipse((i * tw + tw // 2 - 6, sh - 95, i * tw + tw // 2 + 6, sh - 83), fill=color)
        d.text((x, sh - 60), t, font=f_tab, fill=color)

    return img


def screen_chat() -> Image.Image:
    """Customer-facing AI chat with mixed Arabic / English bubbles."""
    sw, sh = screen_size()
    img = Image.new("RGB", (sw, sh), (236, 229, 221))
    d = ImageDraw.Draw(img)

    # Top header (WhatsApp-style)
    d.rectangle((0, 0, sw, 240), fill=(7, 94, 84))
    draw_status_bar(d, 0, 0, sw, color=BRAND_WHITE)
    # avatar
    d.ellipse((50, 130, 150, 230), fill=BRAND_YELLOW)
    f_avi = load_font(INTER_TTF, 38)
    d.text((84, 158), "K", font=f_avi, fill=BRAND_NAVY)
    f_h = load_font(ARABIC_TTF, 38)
    d.text((180, 138), "مطعم كيارا", font=f_h, fill=BRAND_WHITE)
    f_st = load_font(INTER_TTF, 26)
    d.text((180, 188), "online - powered by Nehgz Bot", font=f_st, fill=(180, 220, 215))

    # Bubbles  (alternating) — single-line phrases; ASCII digits remapped
    # to Arabic-Indic so they fit the Arabic font's glyph set.
    raw_bubbles = [
        ("in",  ["السلام عليكم", "ابي احجز طاولة الجمعة 8 مساء", "لاربعة اشخاص"], BRAND_OFFWHITE, TEXT_DARK),
        ("out", ["وعليكم السلام، اهلا فيك", "اكدت حجز طاولة لاربعة", "الجمعة 8 مساء بانتظارك"], (220, 248, 198), TEXT_DARK),
        ("out", ["حابب تضيف كيكة عيد ميلاد؟"], (220, 248, 198), TEXT_DARK),
        ("in",  ["نعم بسعر كم؟"], BRAND_OFFWHITE, TEXT_DARK),
        ("out", ["كيكة عيد ميلاد بـ 95 ريال", "اضيف للحجز؟"], (220, 248, 198), TEXT_DARK),
        ("in",  ["ايوة اضف"], BRAND_OFFWHITE, TEXT_DARK),
        ("out", ["تم حجز رقم 4218 جاهز", "شكرا لاختيارك كيارا"], (220, 248, 198), TEXT_DARK),
    ]
    bubbles = [
        (side, [ar_digits(ln) for ln in lines], fill, fg)
        for side, lines, fill, fg in raw_bubbles
    ]
    y = 280
    f_bub = load_font(ARABIC_TTF, 28)
    line_h = 40
    for side, lines, fill, fg in bubbles:
        # measure widest line
        max_w = max(d.textbbox((0, 0), ln, font=f_bub)[2] for ln in lines)
        bw = max_w + 60
        bh = len(lines) * line_h + 30
        if side == "out":
            x = sw - 40 - bw
        else:
            x = 40
        d.rounded_rectangle((x, y, x + bw, y + bh), radius=24, fill=fill)
        for i, ln in enumerate(lines):
            # right-align Arabic inside bubble
            ln_bb = d.textbbox((0, 0), ln, font=f_bub)
            ln_w = ln_bb[2] - ln_bb[0]
            tx = x + bw - 30 - ln_w
            d.text((tx, y + 15 + i * line_h), ln, font=f_bub, fill=fg)
        y += bh + 18
        if y > sh - 320:
            break

    # AI badge
    f_ai = load_font(INTER_TTF, 28)
    label = "AI replied"
    bb = d.textbbox((0, 0), label, font=f_ai)
    lw = bb[2] - bb[0]
    px, py = sw // 2 - lw // 2 - 30, sh - 290
    d.rounded_rectangle((px, py, px + lw + 60, py + 60), radius=30, fill=BRAND_NAVY)
    d.text((px + 30, py + 14), label, font=f_ai, fill=BRAND_WHITE)

    # Input bar
    d.rounded_rectangle((24, sh - 180, sw - 200, sh - 80), radius=50, fill=BRAND_WHITE)
    f_in = load_font(ARABIC_TTF, 28)
    placeholder = "اكتب رسالة"
    bb = d.textbbox((0, 0), placeholder, font=f_in)
    d.text((sw - 240 - (bb[2] - bb[0]), sh - 158), placeholder, font=f_in, fill=TEXT_MUTED)
    d.ellipse((sw - 170, sh - 180, sw - 70, sh - 80), fill=WA_GREEN)
    return img


def screen_bookings() -> Image.Image:
    sw, sh = screen_size()
    img = Image.new("RGB", (sw, sh), BRAND_OFFWHITE)
    d = ImageDraw.Draw(img)
    draw_status_bar(d, 0, 0, sw)

    f_t = load_font(ARABIC_TTF, 56)
    title_ar = "الحجوزات والطلبات"
    bb = d.textbbox((0, 0), title_ar, font=f_t)
    d.text((sw - 40 - (bb[2] - bb[0]), 130), title_ar, font=f_t, fill=TEXT_DARK)

    # KPI cards
    kpis = [
        ("اليوم", "47", "+12%", BRAND_NAVY),
        ("هذا الأسبوع", "284", "+8%", (10, 130, 90)),
        ("متوسط الطلب", "138", "+5%", (180, 80, 20)),
    ]
    cx = 40
    for label, value, delta, color in kpis:
        cw = (sw - 80 - 40) // 3
        d.rounded_rectangle((cx, 230, cx + cw, 410), radius=24, fill=BRAND_WHITE)
        # right-align Arabic label
        f_l = load_font(ARABIC_TTF, 26)
        bb = d.textbbox((0, 0), label, font=f_l)
        d.text((cx + cw - 24 - (bb[2] - bb[0]), 250), label, font=f_l, fill=TEXT_MUTED)
        f_v = load_font(INTER_TTF, 56)
        d.text((cx + 24, 290), value, font=f_v, fill=color)
        f_d = load_font(INTER_TTF, 26)
        d.text((cx + 24, 360), delta, font=f_d, fill=(20, 140, 70))
        cx += cw + 20

    # Chart card (bar chart)
    d.rounded_rectangle((40, 440, sw - 40, 870), radius=24, fill=BRAND_WHITE)
    f_ct = load_font(ARABIC_TTF, 36)
    title_ar = "الحجوزات خلال الاسبوع"
    bb = d.textbbox((0, 0), title_ar, font=f_ct)
    d.text((sw - 60 - (bb[2] - bb[0]), 470), title_ar, font=f_ct, fill=TEXT_DARK)
    bar_h_max = 320
    bars = [60, 95, 110, 80, 140, 175, 220]
    bar_w = (sw - 200) // len(bars)
    for i, v in enumerate(bars):
        bh = int(v / 250 * bar_h_max)
        x0 = 80 + i * bar_w + 10
        x1 = x0 + bar_w - 20
        y1 = 830
        y0 = y1 - bh
        # gradient bar
        for yy in range(y0, y1):
            t = (yy - y0) / max(bh, 1)
            r = int(BRAND_NAVY[0] + (BRAND_YELLOW[0] - BRAND_NAVY[0]) * t)
            g = int(BRAND_NAVY[1] + (BRAND_YELLOW[1] - BRAND_NAVY[1]) * t)
            b = int(BRAND_NAVY[2] + (BRAND_YELLOW[2] - BRAND_NAVY[2]) * t)
            d.rectangle((x0, yy, x1, yy + 1), fill=(r, g, b))
        # day label
        f_dl = load_font(INTER_TTF, 24)
        labels = ["S", "S", "M", "T", "W", "T", "F"]
        d.text((x0 + (bar_w - 30) // 2, 845), labels[i], font=f_dl, fill=TEXT_MUTED)

    # Recent bookings list (right-aligned)
    f_lt = load_font(ARABIC_TTF, 36)
    title_ar = "اخر الحجوزات"
    bb = d.textbbox((0, 0), title_ar, font=f_lt)
    d.text((sw - 40 - (bb[2] - bb[0]), 920), title_ar, font=f_lt, fill=TEXT_DARK)
    raw_items = [
        ("4218", "سارة العتيبي", "طاولة لاربعة الجمعة 8م", "SAR 95", BRAND_NAVY),
        ("4217", "Ahmed Salem", "Table for 2 - Tonight 9pm", "SAR 220", (10, 130, 90)),
        ("4216", "نورة الدوسري", "كيكة عيد ميلاد لستة اشخاص", "SAR 410", (180, 80, 20)),
        ("4215", "Layla A.", "Brunch - Sat 11am", "SAR 165", BRAND_NAVY),
    ]
    items = []
    for code, name, detail, price, color in raw_items:
        # If detail contains Arabic + digits, map the digits to Arabic-Indic
        if has_arabic(detail):
            detail = ar_digits(detail)
        items.append((code, name, detail, price, color))
    yy = 990
    for code, name, detail, price, color in items:
        d.rounded_rectangle((40, yy, sw - 40, yy + 170), radius=20, fill=BRAND_WHITE)
        d.rounded_rectangle((40, yy, 56, yy + 170), radius=8, fill=color)
        # Name (right-aligned for Arabic, left for Latin)
        f_n = smart_font(name, 34)
        if has_arabic(name):
            bb = d.textbbox((0, 0), name, font=f_n)
            d.text((sw - 80 - (bb[2] - bb[0]), yy + 28), name, font=f_n, fill=TEXT_DARK)
        else:
            d.text((90, yy + 28), name, font=f_n, fill=TEXT_DARK)
        # Detail line (always right-aligned if Arabic, else left)
        f_d = smart_font(detail, 26)
        if has_arabic(detail):
            bb = d.textbbox((0, 0), detail, font=f_d)
            d.text((sw - 80 - (bb[2] - bb[0]), yy + 80), detail, font=f_d, fill=TEXT_MUTED)
        else:
            d.text((90, yy + 80), detail, font=f_d, fill=TEXT_MUTED)
        # Order code on left bottom, price on right bottom
        f_c = load_font(INTER_TTF, 26)
        d.text((90, yy + 128), f"#{code}", font=f_c, fill=TEXT_MUTED)
        f_p = load_font(INTER_TTF, 32)
        bbox = d.textbbox((0, 0), price, font=f_p)
        d.text((sw - 80 - (bbox[2] - bbox[0]), yy + 125), price, font=f_p, fill=color)
        yy += 185

    # Bottom tab bar (re-use simple)
    d.rectangle((0, sh - 130, sw, sh), fill=BRAND_WHITE)
    d.line((0, sh - 130, sw, sh - 130), fill=(225, 228, 240), width=2)
    tabs = ["محادثات", "حجوزات", "حملات", "فريق", "حسابي"]
    tw = sw // len(tabs)
    f_tab = load_font(ARABIC_TTF, 24)
    for i, t in enumerate(tabs):
        bbox = d.textbbox((0, 0), t, font=f_tab)
        x = i * tw + (tw - (bbox[2] - bbox[0])) // 2
        active = i == 1
        color = BRAND_NAVY if active else TEXT_MUTED
        d.ellipse((i * tw + tw // 2 - 6, sh - 95, i * tw + tw // 2 + 6, sh - 83), fill=color)
        d.text((x, sh - 60), t, font=f_tab, fill=color)
    return img


def screen_team_shifts() -> Image.Image:
    sw, sh = screen_size()
    img = Image.new("RGB", (sw, sh), BRAND_OFFWHITE)
    d = ImageDraw.Draw(img)
    draw_status_bar(d, 0, 0, sw)

    f_t = load_font(ARABIC_TTF, 56)
    title_ar = "الفريق والمناوبات"
    bb = d.textbbox((0, 0), title_ar, font=f_t)
    d.text((sw - 40 - (bb[2] - bb[0]), 130), title_ar, font=f_t, fill=TEXT_DARK)

    # Online now strip
    d.rounded_rectangle((40, 230, sw - 40, 410), radius=24, fill=BRAND_NAVY)
    f_n = load_font(ARABIC_TTF, 30)
    txt = "متاحون الان لاستلام التصعيدات"
    bb = d.textbbox((0, 0), txt, font=f_n)
    d.text((sw - 70 - (bb[2] - bb[0]), 252), txt, font=f_n, fill=BRAND_WHITE)
    members = [
        ("S", "Salma", BRAND_YELLOW),
        ("M", "Majed", (255, 130, 90)),
        ("F", "Fatima", (90, 200, 250)),
        ("R", "Rakan", (180, 240, 160)),
        ("+", "5 more", (255, 255, 255)),
    ]
    mx = 70
    for letter, name, color in members:
        d.ellipse((mx, 310, mx + 90, 400), fill=color)
        f_l = load_font(INTER_TTF, 36)
        bbox = d.textbbox((0, 0), letter, font=f_l)
        d.text(
            (mx + (90 - (bbox[2] - bbox[0])) // 2, 332),
            letter,
            font=f_l,
            fill=BRAND_NAVY,
        )
        mx += 110

    # Shift schedule cards (right-aligned title)
    f_h = load_font(ARABIC_TTF, 38)
    txt = "جدول مناوبات اليوم"
    bb = d.textbbox((0, 0), txt, font=f_h)
    d.text((sw - 40 - (bb[2] - bb[0]), 460), txt, font=f_h, fill=TEXT_DARK)
    shifts = [
        ("صباحي", "8:00 — 14:00", ["Salma", "Rakan"], BRAND_NAVY),
        ("مسائي", "14:00 — 22:00", ["Majed", "Fatima", "Khaled"], (10, 130, 90)),
        ("ليلي", "22:00 — 02:00", ["Noura"], (180, 80, 20)),
    ]
    yy = 540
    for label, hours, people, color in shifts:
        d.rounded_rectangle((40, yy, sw - 40, yy + 200), radius=24, fill=BRAND_WHITE)
        d.rounded_rectangle((40, yy, 56, yy + 200), radius=8, fill=color)
        # Label right-aligned (Arabic word like "صباحي")
        f_l = load_font(ARABIC_TTF, 38)
        bb = d.textbbox((0, 0), label, font=f_l)
        d.text((sw - 80 - (bb[2] - bb[0]), yy + 24), label, font=f_l, fill=TEXT_DARK)
        # Hours on left
        f_hh = load_font(INTER_TTF, 32)
        d.text((90, yy + 30), hours, font=f_hh, fill=TEXT_MUTED)
        # Avatar pile (left-side)
        ax = 90
        for i, p in enumerate(people[:4]):
            colors = [BRAND_YELLOW, (255, 130, 90), (90, 200, 250), (180, 240, 160)]
            d.ellipse((ax, yy + 110, ax + 70, yy + 180), fill=colors[i % 4])
            f_p = load_font(INTER_TTF, 30)
            initial = p[0] if p[0].isascii() else "T"
            d.text((ax + 22, yy + 128), initial, font=f_p, fill=BRAND_NAVY)
            ax += 50
        # Names list right-aligned (Latin names — use Inter)
        names_str = ", ".join(people)
        f_pp = load_font(INTER_TTF, 24)
        bb = d.textbbox((0, 0), names_str, font=f_pp)
        d.text((sw - 80 - (bb[2] - bb[0]), yy + 140), names_str, font=f_pp, fill=TEXT_MUTED)
        yy += 220

    # Recent escalations card
    d.rounded_rectangle((40, 1240, sw - 40, 1620), radius=24, fill=BRAND_WHITE)
    f_h2 = load_font(ARABIC_TTF, 36)
    txt = "تصعيدات تنتظر الرد"
    bb = d.textbbox((0, 0), txt, font=f_h2)
    d.text((sw - 70 - (bb[2] - bb[0]), 1265), txt, font=f_h2, fill=TEXT_DARK)
    esc = [
        ("Layla A.", "مشكلة فاتورة عاجلة", "2m", (255, 60, 60)),
        ("سارة", "طلب خاص خارج القائمة", "8m", (255, 150, 30)),
        ("Khaled", "تاكيد حجز كبير", "15m", BRAND_NAVY),
    ]
    yy = 1340
    for name, msg, ago, c in esc:
        d.rounded_rectangle((70, yy, sw - 70, yy + 80), radius=18, fill=BRAND_OFFWHITE)
        d.ellipse((90, yy + 18, 134, yy + 62), fill=c)
        # Latin/short name immediately right of avatar (left side)
        f_n = smart_font(name, 28)
        d.text((150, yy + 14), name, font=f_n, fill=TEXT_DARK)
        # Arabic message under the name
        f_a = load_font(ARABIC_TTF, 26)
        bb = d.textbbox((0, 0), msg, font=f_a)
        d.text((sw - 200 - (bb[2] - bb[0]), yy + 18), msg, font=f_a, fill=TEXT_MUTED)
        # ago on far right
        f_m = load_font(INTER_TTF, 22)
        bbm = d.textbbox((0, 0), ago, font=f_m)
        d.text((sw - 100 - (bbm[2] - bbm[0]), yy + 22), ago, font=f_m, fill=TEXT_MUTED)
        yy += 88

    # Bottom tab
    d.rectangle((0, sh - 130, sw, sh), fill=BRAND_WHITE)
    d.line((0, sh - 130, sw, sh - 130), fill=(225, 228, 240), width=2)
    tabs = ["محادثات", "حجوزات", "حملات", "فريق", "حسابي"]
    tw = sw // len(tabs)
    f_tab = load_font(ARABIC_TTF, 24)
    for i, t in enumerate(tabs):
        bbox = d.textbbox((0, 0), t, font=f_tab)
        x = i * tw + (tw - (bbox[2] - bbox[0])) // 2
        active = i == 3
        color = BRAND_NAVY if active else TEXT_MUTED
        d.ellipse((i * tw + tw // 2 - 6, sh - 95, i * tw + tw // 2 + 6, sh - 83), fill=color)
        d.text((x, sh - 60), t, font=f_tab, fill=color)
    return img


def screen_campaigns() -> Image.Image:
    sw, sh = screen_size()
    img = Image.new("RGB", (sw, sh), BRAND_OFFWHITE)
    d = ImageDraw.Draw(img)
    draw_status_bar(d, 0, 0, sw)

    f_t = load_font(ARABIC_TTF, 56)
    txt = "الحملات التسويقية"
    bb = d.textbbox((0, 0), txt, font=f_t)
    d.text((sw - 40 - (bb[2] - bb[0]), 130), txt, font=f_t, fill=TEXT_DARK)

    # Active campaign hero card (gradient)
    box = (40, 230, sw - 40, 600)
    grad = Image.new("RGB", (box[2] - box[0], box[3] - box[1]))
    gpx = grad.load()
    bw, bh = grad.size
    for y in range(bh):
        t = y / max(bh - 1, 1)
        r = int(BRAND_NAVY[0] + (BRAND_ROYAL[0] - BRAND_NAVY[0]) * t)
        g = int(BRAND_NAVY[1] + (BRAND_ROYAL[1] - BRAND_NAVY[1]) * t)
        b = int(BRAND_NAVY[2] + (BRAND_ROYAL[2] - BRAND_NAVY[2]) * t)
        for x in range(bw):
            gpx[x, y] = (r, g, b)
    mask = Image.new("L", grad.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, bw, bh), radius=24, fill=255)
    img.paste(grad, (box[0], box[1]), mask=mask)

    f_h = load_font(ARABIC_TTF, 36)
    h_text = "حملة عيد الفطر الجمعة"
    bb = d.textbbox((0, 0), h_text, font=f_h)
    d.text((box[2] - 40 - (bb[2] - bb[0]), box[1] + 40), h_text, font=f_h, fill=BRAND_WHITE)
    f_m = load_font(ARABIC_TTF, 30)
    m_text = "خصم على الحجوزات لباقة العائلة"
    bb = d.textbbox((0, 0), m_text, font=f_m)
    d.text(
        (box[2] - 40 - (bb[2] - bb[0]), box[1] + 100),
        m_text,
        font=f_m,
        fill=(220, 230, 255),
    )
    # Stats — laid out left-to-right, but Arabic labels right-aligned within their column
    stats = [("ارسلت", "1,284"), ("فتحت", "974"), ("ردت", "318"), ("حجزت", "112")]
    col_w = (bw - 80) // 4
    sx = box[0] + 40
    for label, value in stats:
        f_v = load_font(INTER_TTF, 48)
        d.text((sx, box[1] + 220), value, font=f_v, fill=BRAND_YELLOW)
        f_l = load_font(ARABIC_TTF, 26)
        d.text((sx, box[1] + 280), label, font=f_l, fill=(200, 210, 240))
        sx += col_w

    # Templates list header
    f_h2 = load_font(ARABIC_TTF, 38)
    h_text = "قوالب معتمدة"
    bb = d.textbbox((0, 0), h_text, font=f_h2)
    d.text((sw - 40 - (bb[2] - bb[0]), 640), h_text, font=f_h2, fill=TEXT_DARK)
    f_a = load_font(ARABIC_TTF, 26)
    d.text((40, 654), "اعتماد واتساب", font=f_a, fill=(20, 140, 70))

    templates = [
        ("تذكير حجز", "مرحبا تذكير حجزك الساعة المحددة", "approved", BRAND_NAVY),
        ("عرض ترويجي", "خصم 20 بالمئة للمناسبات احجز الان", "approved", (10, 130, 90)),
        ("استبيان رضا", "كيف كانت تجربتك مع كيارا", "pending", (200, 140, 0)),
        ("تاكيد دفع", "تم استلام الدفع بنجاح الفاتورة جاهزة", "approved", (180, 80, 20)),
    ]
    yy = 710
    for title, body, status, color in templates:
        d.rounded_rectangle((40, yy, sw - 40, yy + 180), radius=20, fill=BRAND_WHITE)
        d.rounded_rectangle((40, yy, 56, yy + 180), radius=8, fill=color)
        # Right-align both title and body (Arabic-first)
        f_tt = load_font(ARABIC_TTF, 34)
        bb = d.textbbox((0, 0), title, font=f_tt)
        d.text((sw - 80 - (bb[2] - bb[0]), yy + 24), title, font=f_tt, fill=TEXT_DARK)
        f_tb = load_font(ARABIC_TTF, 28)
        bb = d.textbbox((0, 0), body, font=f_tb)
        d.text((sw - 80 - (bb[2] - bb[0]), yy + 78), body, font=f_tb, fill=TEXT_MUTED)
        # status pill
        if status == "approved":
            pill_color = (224, 247, 230)
            pill_fg = (16, 120, 70)
            pill_text = "معتمد"
        else:
            pill_color = (255, 240, 200)
            pill_fg = (160, 100, 0)
            pill_text = "بانتظار"
        f_p = load_font(ARABIC_TTF, 26)
        bb = d.textbbox((0, 0), pill_text, font=f_p)
        pw = bb[2] - bb[0] + 40
        # Place pill on the LEFT (Arabic body is right-aligned, pill goes left)
        d.rounded_rectangle((90, yy + 130, 90 + pw, yy + 170), radius=20, fill=pill_color)
        d.text((110, yy + 138), pill_text, font=f_p, fill=pill_fg)
        yy += 200

    # Bottom tab
    d.rectangle((0, sh - 130, sw, sh), fill=BRAND_WHITE)
    d.line((0, sh - 130, sw, sh - 130), fill=(225, 228, 240), width=2)
    tabs = ["محادثات", "حجوزات", "حملات", "فريق", "حسابي"]
    tw = sw // len(tabs)
    f_tab = load_font(ARABIC_TTF, 24)
    for i, t in enumerate(tabs):
        bbox = d.textbbox((0, 0), t, font=f_tab)
        x = i * tw + (tw - (bbox[2] - bbox[0])) // 2
        active = i == 2
        color = BRAND_NAVY if active else TEXT_MUTED
        d.ellipse((i * tw + tw // 2 - 6, sh - 95, i * tw + tw // 2 + 6, sh - 83), fill=color)
        d.text((x, sh - 60), t, font=f_tab, fill=color)
    return img


# ---- Composer ---------------------------------------------------------------


def compose(
    name: str,
    headline_ar: str,
    subhead_en: str,
    inner: Image.Image,
    accent=BRAND_YELLOW,
):
    bg = make_background()
    draw_header(bg, headline_ar, subhead_en, accent=accent)

    # Wrap inner content into a phone frame
    framed = phone_frame(inner)
    fw, fh = framed.size
    # Scale to fit within nice region
    target_h = 1900
    scale = target_h / fh
    new_w = int(fw * scale)
    framed = framed.resize((new_w, target_h), Image.LANCZOS)

    # Paste with shadow
    px = (W - framed.size[0]) // 2
    py = 730
    bg = drop_shadow(bg, framed, (px, py), blur=40, color=(0, 0, 30), alpha=160)

    out_path = OUT_DIR / f"{name}.png"
    bg.convert("RGB").save(out_path, optimize=True)
    print("wrote", out_path)
    return out_path


# ---- Main -------------------------------------------------------------------


def main():
    compose(
        "01-inbox",
        "محادثات الواتساب\nفي مكان واحد",
        "Every chat. Every team. Every escalation.",
        screen_inbox(),
        accent=BRAND_YELLOW,
    )
    compose(
        "02-ai-chat",
        "ذكاء اصطناعي\nيرد عن عملك على مدار الساعة",
        "AI replies in Arabic & English. Books, upsells, escalates.",
        screen_chat(),
        accent=(255, 220, 80),
    )
    compose(
        "03-bookings",
        "حجوزات وطلبات\nتلقائية",
        "Bookings captured straight from WhatsApp into your dashboard.",
        screen_bookings(),
        accent=(255, 220, 80),
    )
    compose(
        "04-team-shifts",
        "فريقك ومناوباتك\nبضغطة زر",
        "Schedule shifts, assign roles, never miss an escalation.",
        screen_team_shifts(),
        accent=BRAND_YELLOW,
    )
    compose(
        "05-campaigns",
        "حملات واتساب\nمعتمدة وآمنة",
        "Approved templates, segmented sends, real-time analytics.",
        screen_campaigns(),
        accent=BRAND_YELLOW,
    )


if __name__ == "__main__":
    main()
