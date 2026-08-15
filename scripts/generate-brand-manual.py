#!/usr/bin/env python3
"""Generate the verified ClasesDe10 visual identity manual."""

from __future__ import annotations

import io
import shutil
import urllib.request
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
SOURCE_LOGO = ROOT / "assets" / "img" / "logo-512.png"
OUTPUT = ROOT / "output" / "pdf" / "manual-identidad-visual-clasesde10.pdf"
TMP = ROOT / "tmp" / "pdfs" / "brand-manual"
PAGE = landscape(A4)
W, H = PAGE

NAVY = HexColor("#0F1F3D")
NAVY_LIGHT = HexColor("#1A3260")
GOLD = HexColor("#E8A030")
GOLD_LIGHT = HexColor("#F5C060")
GOLD_TEXT = HexColor("#8A5A00")
CREAM = HexColor("#FAF8F3")
WHITE = HexColor("#FFFFFF")
GRAY_SOFT = HexColor("#F0EDE6")
GRAY_MID = HexColor("#6F695F")
TEXT_DARK = HexColor("#1A1612")
TEXT_BODY = HexColor("#3D3830")
TEAL = HexColor("#1D7A6B")
SUCCESS = HexColor("#16A34A")
WARNING = HexColor("#D97706")
DANGER = HexColor("#DC2626")
INFO = HexColor("#2563EB")


def download(url: str, target: Path) -> Path:
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=30) as response:
            target.write_bytes(response.read())
    return target


def static_font(variable_path: Path, target: Path, axes: dict[str, float]) -> Path:
    if target.exists():
        return target
    from fontTools.ttLib import TTFont as FontToolsFont
    from fontTools.varLib.instancer import instantiateVariableFont

    font = FontToolsFont(str(variable_path))
    instantiateVariableFont(font, axes, inplace=True)
    font.save(str(target))
    return target


def register_fonts() -> None:
    try:
        dm_var = download(
            "https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz,wght%5D.ttf",
            TMP / "DMSans-variable.ttf",
        )
        playfair_var = download(
            "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
            TMP / "PlayfairDisplay-variable.ttf",
        )
        files = {
            "DM Sans": static_font(dm_var, TMP / "DMSans-Regular.ttf", {"opsz": 14, "wght": 400}),
            "DM Sans Medium": static_font(dm_var, TMP / "DMSans-Medium.ttf", {"opsz": 14, "wght": 500}),
            "DM Sans Bold": static_font(dm_var, TMP / "DMSans-Bold.ttf", {"opsz": 14, "wght": 700}),
            "Playfair Display": static_font(playfair_var, TMP / "PlayfairDisplay-Regular.ttf", {"wght": 400}),
            "Playfair Display Bold": static_font(playfair_var, TMP / "PlayfairDisplay-Bold.ttf", {"wght": 700}),
        }
        for name, path in files.items():
            pdfmetrics.registerFont(TTFont(name, str(path)))
    except Exception:
        # The manual remains reproducible offline with metrically safe fallbacks.
        pdfmetrics.registerFont(TTFont("DM Sans", r"C:\Windows\Fonts\arial.ttf"))
        pdfmetrics.registerFont(TTFont("DM Sans Medium", r"C:\Windows\Fonts\arial.ttf"))
        pdfmetrics.registerFont(TTFont("DM Sans Bold", r"C:\Windows\Fonts\arialbd.ttf"))
        pdfmetrics.registerFont(TTFont("Playfair Display", r"C:\Windows\Fonts\georgia.ttf"))
        pdfmetrics.registerFont(TTFont("Playfair Display Bold", r"C:\Windows\Fonts\georgiab.ttf"))


def transparent_crop(source: Image.Image, box: tuple[int, int, int, int]) -> ImageReader:
    crop = source.crop(box)
    stream = io.BytesIO()
    crop.save(stream, format="PNG")
    stream.seek(0)
    return ImageReader(stream)


def fit_image(c: canvas.Canvas, image: ImageReader, x: float, y: float, w: float, h: float) -> None:
    iw, ih = image.getSize()
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, mask="auto")


def paragraph(c: canvas.Canvas, text: str, x: float, y_top: float, width: float, size: float = 11,
              color=TEXT_BODY, leading: float | None = None, align: int = TA_LEFT,
              font: str = "DM Sans") -> float:
    style = ParagraphStyle(
        "manual",
        fontName=font,
        fontSize=size,
        leading=leading or size * 1.4,
        textColor=color,
        alignment=align,
        spaceAfter=0,
    )
    p = Paragraph(text, style)
    _, ph = p.wrap(width, H)
    p.drawOn(c, x, y_top - ph)
    return ph


def label(c: canvas.Canvas, text: str, x: float, y: float, color=GOLD_TEXT) -> None:
    c.setFillColor(color)
    c.setFont("DM Sans Bold", 8)
    c.drawString(x, y, text.upper())


def page_header(c: canvas.Canvas, section: str, number: int, dark: bool = False) -> None:
    ink = WHITE if dark else NAVY
    c.setFillColor(ink)
    c.setFont("DM Sans Bold", 8)
    c.drawString(36, H - 29, "CLASESDE10 - IDENTIDAD VISUAL")
    c.setFont("DM Sans", 8)
    c.drawRightString(W - 36, H - 29, section.upper())
    c.setStrokeColor(Color(1, 1, 1, .18) if dark else HexColor("#DCD7CD"))
    c.line(36, H - 39, W - 36, H - 39)
    c.setFillColor(ink)
    c.drawRightString(W - 36, 22, f"{number:02d}")


def title(c: canvas.Canvas, kicker: str, heading: str, body: str, dark: bool = False) -> None:
    label(c, kicker, 48, H - 76, GOLD if dark else GOLD_TEXT)
    c.setFillColor(WHITE if dark else NAVY)
    c.setFont("Playfair Display Bold", 30)
    c.drawString(48, H - 112, heading)
    paragraph(c, body, 48, H - 130, 500, 11, Color(1, 1, 1, .78) if dark else TEXT_BODY)


def card(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill=WHITE, stroke=HexColor("#DEDAD2")) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.roundRect(x, y, w, h, 4, fill=1, stroke=1)


def draw_wordmark(c: canvas.Canvas, x: float, y: float, size: float, centered: bool = False) -> None:
    c.setFont("Playfair Display Bold", size)
    left = x
    total = pdfmetrics.stringWidth("Clases", "Playfair Display Bold", size) + pdfmetrics.stringWidth("De10", "Playfair Display Bold", size)
    if centered:
        left = x - total / 2
    c.setFillColor(NAVY)
    c.drawString(left, y, "Clases")
    left += pdfmetrics.stringWidth("Clases", "Playfair Display Bold", size)
    c.setFillColor(GOLD)
    c.drawString(left, y, "De10")


def build() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE_LOGO).convert("RGBA")
    full = transparent_crop(source, (38, 72, 478, 421))
    isotype = transparent_crop(source, (151, 82, 342, 269))
    source_wordmark = transparent_crop(source, (42, 270, 476, 337))
    source_slogan = transparent_crop(source, (92, 337, 425, 416))

    c = canvas.Canvas(str(OUTPUT), pagesize=PAGE, pageCompression=1)
    c.setTitle("Manual de identidad visual - ClasesDe10")
    c.setAuthor("ClasesDe10")
    c.setSubject("Logotipo, isotipo, imagotipo, tipografia y paleta cromatica")

    # 1 - Cover
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Manual de marca", 1, dark=True)
    c.setFillColor(WHITE)
    c.roundRect(500, 106, 270, 338, 4, fill=1, stroke=0)
    fit_image(c, full, 510, 118, 250, 314)
    label(c, "Sistema visual 2026", 48, H - 104, GOLD)
    c.setFillColor(WHITE)
    c.setFont("Playfair Display Bold", 42)
    c.drawString(48, H - 158, "Manual de")
    c.drawString(48, H - 205, "identidad visual")
    paragraph(c, "Una guía práctica para aplicar la marca con claridad, coherencia y personalidad en web, paneles, documentos y comunicaciones.", 48, H - 239, 355, 13, Color(1, 1, 1, .78), 19)
    c.setFillColor(GOLD)
    c.rect(48, 72, 84, 4, fill=1, stroke=0)
    c.setFillColor(Color(1, 1, 1, .62))
    c.setFont("DM Sans", 9)
    c.drawString(48, 52, "Versión 1.0 - Agosto de 2026")
    c.showPage()

    # 2 - Terminology
    c.setFillColor(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Arquitectura de marca", 2)
    title(c, "01 - Fundamentos", "Qué es cada elemento", "La nomenclatura evita confusiones y ayuda a elegir la firma adecuada para cada contexto.")
    items = [
        ("ISOTIPO", "El símbolo reconocible sin texto: el libro con rostro y la estrella."),
        ("LOGOTIPO", "La denominación escrita ClasesDe10. No debe confundirse con la composición completa."),
        ("IMAGOTIPO", "La combinación separable de isotipo y logotipo: libro + nombre. Es la firma principal."),
        ("FIRMA COMPLETA", "Imagotipo acompañado por el eslogan: El mejor profesorado al alcance de la mano."),
    ]
    x0, y0, gap = 48, 270, 14
    cw = (W - 96 - gap * 3) / 4
    for i, (name, desc) in enumerate(items):
        x = x0 + i * (cw + gap)
        card(c, x, y0, cw, 150)
        label(c, f"0{i+1}", x + 16, y0 + 122)
        c.setFillColor(NAVY); c.setFont("Playfair Display Bold", 16); c.drawString(x + 16, y0 + 91, name)
        paragraph(c, desc, x + 16, y0 + 74, cw - 32, 9.5, TEXT_BODY, 13)
    paragraph(c, "Regla principal: cuando el espacio lo permita, utilizar el imagotipo. Reservar el isotipo para formatos pequeños o ya identificados, y la firma con eslogan para piezas institucionales.", 48, 230, W - 96, 11, NAVY, 16)
    c.showPage()

    # 3 - Isotype
    c.setFillColor(WHITE); c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Isotipo", 3)
    title(c, "02 - Símbolo", "El libro con la estrella", "El isotipo concentra la parte más memorable de la marca y funciona sin texto cuando ClasesDe10 ya está identificado.")
    card(c, 48, 82, 350, 330, CREAM)
    fit_image(c, isotype, 105, 137, 236, 225)
    c.setFillColor(NAVY); c.setFont("DM Sans Bold", 10); c.drawCentredString(223, 108, "ISOTIPO PRINCIPAL")
    rules = [
        ("Usos", "Avatar, favicon, icono de aplicación, sello y espacios inferiores a 120 px."),
        ("Fondo", "Prioridad: crema o blanco. Sobre azul marino debe conservarse el archivo con transparencia."),
        ("Integridad", "No redibujar, rotar, deformar, recolorear ni separar la estrella del libro."),
        ("Área de respeto", "Mantener alrededor un espacio mínimo equivalente a un cuarto del ancho del libro."),
    ]
    y = 380
    for name, desc in rules:
        label(c, name, 455, y)
        paragraph(c, desc, 455, y - 10, 315, 10.5, TEXT_BODY, 14)
        y -= 72
    c.showPage()

    # 4 - Wordmark and imagotype
    c.setFillColor(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Logotipo e imagotipo", 4)
    title(c, "03 - Firma principal", "Nombre y símbolo", "La palabra identifica; el símbolo aporta memoria. Juntos forman el imagotipo de uso preferente.")
    card(c, 48, 275, 330, 135, WHITE)
    fit_image(c, source_wordmark, 73, 306, 280, 62)
    label(c, "Logotipo - nombre sin símbolo", 68, 293)
    card(c, 402, 185, 390, 225, WHITE)
    fit_image(c, transparent_crop(source, (38, 74, 478, 347)), 438, 218, 320, 164)
    label(c, "Imagotipo - libro + nombre", 422, 203)
    paragraph(c, "El archivo maestro del logotipo es la pieza original. No se debe reconstruir el nombre con una fuente, aunque Playfair Display sea la tipografía editorial de la web.", 48, 238, 310, 10.5, TEXT_BODY, 15)
    paragraph(c, "El imagotipo es la opción recomendada para navegación, portadas, cabeceras, material comercial y comunicaciones generales.", 48, 164, 310, 10.5, TEXT_BODY, 15)
    c.showPage()

    # 5 - Complete signature
    c.setFillColor(NAVY); c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Firma con eslogan", 5, dark=True)
    title(c, "04 - Firma institucional", "El mensaje completo", "La firma completa añade el eslogan oficial y se reserva para piezas con suficiente tamaño y tiempo de lectura.", dark=True)
    card(c, 62, 100, 718, 310, WHITE, Color(1, 1, 1, .18))
    fit_image(c, full, 265, 123, 312, 266)
    c.showPage()

    # 6 - Layout variants
    c.setFillColor(WHITE); c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Composiciones", 6)
    title(c, "05 - Variantes", "Horizontal y vertical", "Dos composiciones adaptan la firma a formatos apaisados o estrechos sin perder jerarquía.")
    card(c, 48, 255, 744, 155, CREAM)
    fit_image(c, isotype, 78, 274, 122, 116)
    draw_wordmark(c, 236, 337, 32)
    c.setFillColor(TEXT_BODY); c.setFont("DM Sans Medium", 12); c.drawString(238, 306, "El mejor profesorado")
    c.drawString(238, 286, "al alcance de la mano")
    label(c, "Apaisado - texto en columna a la derecha", 620, 276)
    card(c, 48, 62, 300, 170, CREAM)
    fit_image(c, isotype, 143, 126, 110, 95)
    draw_wordmark(c, 198, 99, 23, centered=True)
    c.setFillColor(TEXT_BODY); c.setFont("DM Sans", 8.5); c.drawCentredString(198, 78, "El mejor profesorado al alcance de la mano")
    label(c, "Vertical", 64, 78)
    card(c, 372, 62, 420, 170, NAVY, NAVY)
    fit_image(c, isotype, 400, 92, 118, 105)
    c.setFillColor(WHITE); c.setFont("Playfair Display Bold", 25); c.drawString(548, 146, "Clases")
    c.setFillColor(GOLD); c.drawString(624, 146, "De10")
    c.setFillColor(Color(1, 1, 1, .76)); c.setFont("DM Sans", 9); c.drawString(550, 119, "El mejor profesorado")
    c.drawString(550, 102, "al alcance de la mano")
    label(c, "Negativo", 742, 78, GOLD)
    c.showPage()

    # 7 - Color palette
    c.setFillColor(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Color", 7)
    title(c, "06 - Paleta", "Colores de marca y producto", "La paleta nace del imagotipo y se completa con neutros y colores funcionales para la interfaz.")
    brand = [
        ("Azul marino", "#0F1F3D", NAVY, WHITE, "Fondos y estructura"),
        ("Azul apoyo", "#1A3260", NAVY_LIGHT, WHITE, "Niveles secundarios"),
        ("Dorado", "#E8A030", GOLD, NAVY, "CTA y selección"),
        ("Dorado claro", "#F5C060", GOLD_LIGHT, NAVY, "Acento suave"),
        ("Dorado texto", "#8A5A00", GOLD_TEXT, WHITE, "Texto sobre claro"),
        ("Verde azulado", "#1D7A6B", TEAL, WHITE, "Progreso"),
        ("Crema", "#FAF8F3", CREAM, NAVY, "Fondo principal"),
        ("Blanco", "#FFFFFF", WHITE, NAVY, "Superficies"),
        ("Gris suave", "#F0EDE6", GRAY_SOFT, NAVY, "Separadores"),
        ("Gris cálido", "#6F695F", GRAY_MID, WHITE, "Texto secundario"),
        ("Tinta", "#1A1612", TEXT_DARK, WHITE, "Titulares"),
        ("Texto cuerpo", "#3D3830", TEXT_BODY, WHITE, "Lectura"),
    ]
    x0, gap = 48, 10
    sw = (W - 96 - gap * 5) / 6
    for i, (name, code, color, ink, use) in enumerate(brand):
        col, row = i % 6, i // 6
        x = x0 + col * (sw + gap)
        y0 = 305 - row * 102
        c.setFillColor(color); c.setStrokeColor(HexColor("#D7D1C7")); c.roundRect(x, y0, sw, 88, 4, fill=1, stroke=1)
        c.setFillColor(ink); c.setFont("DM Sans Bold", 8); c.drawString(x + 9, y0 + 62, name)
        c.setFont("DM Sans", 8); c.drawString(x + 9, y0 + 46, code)
        c.setFont("DM Sans", 7); c.drawString(x + 9, y0 + 22, use)
    label(c, "Estados funcionales", 48, 174)
    states = [("Éxito", "#16A34A", SUCCESS), ("Aviso", "#D97706", WARNING), ("Error", "#DC2626", DANGER), ("Información", "#2563EB", INFO)]
    for i, (name, code, color) in enumerate(states):
        x = 48 + i * 186
        c.setFillColor(color); c.rect(x, 102, 38, 46, fill=1, stroke=0)
        c.setFillColor(NAVY); c.setFont("DM Sans Bold", 8.5); c.drawString(x + 50, 132, name)
        c.setFont("DM Sans", 8); c.drawString(x + 50, 116, code)
    paragraph(c, "Accesibilidad: no comunicar un estado únicamente mediante color. Combinar siempre color con una etiqueta textual, icono funcional o patrón de estado.", 48, 78, W - 96, 9.5, TEXT_BODY, 13)
    c.showPage()

    # 8 - Typography
    c.setFillColor(WHITE); c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Tipografía", 8)
    title(c, "07 - Tipografía", "Playfair Display + DM Sans", "Las dos familias utilizadas realmente en la web separan la voz editorial de la información operativa.")
    c.setFillColor(NAVY); c.setFont("Playfair Display Bold", 38); c.drawString(48, 350, "Playfair Display")
    paragraph(c, "Titulares, portadas y momentos de marca. Aporta carácter editorial y confianza. Pesos recomendados: 600 y 700.", 50, 326, 340, 10.5, TEXT_BODY, 15)
    c.setFillColor(TEXT_DARK); c.setFont("DM Sans", 32); c.drawString(430, 350, "DM Sans")
    paragraph(c, "Interfaz, párrafos, formularios, botones, tablas y datos. Pesos recomendados: 400, 500 y 600.", 432, 326, 330, 10.5, TEXT_BODY, 15)
    c.setStrokeColor(GRAY_SOFT); c.line(48, 258, W - 48, 258)
    samples = [
        ("H1 / Portada", "Playfair Display Bold", 27, "Clases que marcan la diferencia"),
        ("H2 / Sección", "Playfair Display Bold", 19, "Encuentra el profesor adecuado"),
        ("Cuerpo / UI", "DM Sans", 11, "Información clara, directa y fácil de revisar."),
        ("Botón / Etiqueta", "DM Sans Bold", 9, "PEDIR UN PROFESOR"),
    ]
    y = 220
    for name, font, size, sample in samples:
        label(c, name, 50, y)
        c.setFillColor(NAVY); c.setFont(font, size); c.drawString(198, y - 4, sample)
        y -= 48
    c.showPage()

    # 9 - Usage rules
    c.setFillColor(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Aplicación", 9)
    title(c, "08 - Uso", "Jerarquía, espacio y fondos", "Estas reglas mantienen una presencia sobria, legible y coherente en todos los puntos de contacto.")
    blocks = [
        ("Tamaño mínimo", "Isotipo digital: 32 px. Imagotipo digital: 120 px. Firma con eslogan: 220 px."),
        ("Área de respeto", "Dejar un margen libre equivalente a la altura de la estrella alrededor de la firma."),
        ("Fondos", "Preferir blanco, crema o azul marino uniforme. Evitar fotografías ruidosas y degradados."),
        ("Interfaz", "Usar radios contenidos de 2-4 px. Reservar hover y movimiento para controles interactivos."),
        ("Color", "Dorado para acciones principales; azul marino para estructura; verde azulado para confirmación."),
        ("Consistencia", "No mezclar versiones reconstruidas con el archivo maestro del logotipo."),
    ]
    for i, (name, desc) in enumerate(blocks):
        col, row = i % 3, i // 3
        x, y = 48 + col * 250, 250 - row * 128
        card(c, x, y, 226, 106, WHITE)
        label(c, f"0{i+1} - {name}", x + 14, y + 78)
        paragraph(c, desc, x + 14, y + 63, 198, 9.5, TEXT_BODY, 13)
    c.showPage()

    # 10 - Do / don't and assets
    c.setFillColor(NAVY); c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, "Control de calidad", 10, dark=True)
    title(c, "09 - Cierre", "Una marca reconocible", "La coherencia importa más que la variedad. Utilizar pocas versiones, bien aplicadas y siempre desde archivos maestros.", dark=True)
    card(c, 48, 170, 352, 210, WHITE)
    label(c, "Sí", 66, 348, TEAL)
    for i, text in enumerate([
        "Mantener proporciones y transparencia.",
        "Elegir la composición según el espacio.",
        "Conservar contraste y área de respeto.",
        "Aplicar la paleta y tipografías definidas.",
    ]):
        c.setFillColor(NAVY); c.setFont("DM Sans", 10); c.drawString(68, 315 - i * 35, f"•  {text}")
    card(c, 438, 170, 354, 210, HexColor("#FFF7F2"), HexColor("#E8C9C2"))
    label(c, "No", 456, 348, DANGER)
    for i, text in enumerate([
        "No deformar, inclinar ni añadir sombras.",
        "No cambiar los colores del símbolo.",
        "No usar fondos degradados o ruidosos.",
        "No recrear el logotipo con otra fuente.",
    ]):
        c.setFillColor(TEXT_DARK); c.setFont("DM Sans", 10); c.drawString(458, 315 - i * 35, f"•  {text}")
    c.setFillColor(Color(1, 1, 1, .65)); c.setFont("DM Sans", 9)
    c.drawString(48, 126, "Archivos maestros actuales: assets/img/logo-192.png, logo-512.png y logo-clasesde10.png")
    c.setFillColor(GOLD); c.setFont("Playfair Display Bold", 18)
    c.drawString(48, 88, "El mejor profesorado al alcance de la mano")
    c.save()


if __name__ == "__main__":
    try:
        build()
        print(OUTPUT)
    finally:
        # Keep downloaded fonts cached for reproducibility; remove render-only files elsewhere.
        pass
