# -*- coding: utf-8 -*-
from __future__ import annotations

import html
import os
import zipfile
from pathlib import Path


OUT = Path("ClickGuideLocal_팀설치_실행가이드.pptx")
EMU_PER_INCH = 914400
SLIDE_W = 12192000
SLIDE_H = 6858000


def emu(inches: float) -> int:
    return int(inches * EMU_PER_INCH)


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def tx_body(text: str, size: int = 22, color: str = "172026", bold: bool = False, align: str = "l") -> str:
    paragraphs = []
    for line in text.split("\n"):
        paragraphs.append(
            f"""
            <a:p>
              <a:pPr algn="{align}"/>
              <a:r>
                <a:rPr lang="ko-KR" sz="{size * 100}" b="{1 if bold else 0}">
                  <a:solidFill><a:srgbClr val="{color}"/></a:solidFill>
                  <a:latin typeface="Malgun Gothic"/>
                  <a:ea typeface="Malgun Gothic"/>
                </a:rPr>
                <a:t>{esc(line)}</a:t>
              </a:r>
            </a:p>"""
        )
    return f"""
      <p:txBody>
        <a:bodyPr wrap="square" anchor="t"/>
        <a:lstStyle/>
        {''.join(paragraphs)}
      </p:txBody>"""


class Slide:
    def __init__(self, title: str, bg: str = "FAFAF8"):
        self.title = title
        self.bg = bg
        self.parts: list[str] = []
        self.shape_id = 2

    def next_id(self) -> int:
        value = self.shape_id
        self.shape_id += 1
        return value

    def rect(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        fill: str = "FFFFFF",
        line: str | None = "D8DED8",
        text: str | None = None,
        size: int = 20,
        color: str = "172026",
        bold: bool = False,
        align: str = "l",
    ) -> None:
        sid = self.next_id()
        line_xml = "<a:ln><a:noFill/></a:ln>" if line is None else f'<a:ln w="12700"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>'
        text_xml = tx_body(text, size, color, bold, align) if text is not None else ""
        self.parts.append(
            f"""
            <p:sp>
              <p:nvSpPr><p:cNvPr id="{sid}" name="Shape {sid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>
                {line_xml}
              </p:spPr>
              {text_xml}
            </p:sp>"""
        )

    def line(self, x1: float, y1: float, x2: float, y2: float, color: str = "D8DED8", width: int = 2) -> None:
        sid = self.next_id()
        x = min(x1, x2)
        y = min(y1, y2)
        w = abs(x2 - x1) or 0.01
        h = abs(y2 - y1) or 0.01
        flip_h = " flipH=\"1\"" if x2 < x1 else ""
        flip_v = " flipV=\"1\"" if y2 < y1 else ""
        self.parts.append(
            f"""
            <p:cxnSp>
              <p:nvCxnSpPr><p:cNvPr id="{sid}" name="Line {sid}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>
              <p:spPr>
                <a:xfrm{flip_h}{flip_v}><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>
                <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
                <a:ln w="{width * 12700}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill></a:ln>
              </p:spPr>
            </p:cxnSp>"""
        )

    def text(self, x: float, y: float, w: float, h: float, text: str, size: int = 24, color: str = "172026", bold: bool = False, align: str = "l") -> None:
        sid = self.next_id()
        self.parts.append(
            f"""
            <p:sp>
              <p:nvSpPr><p:cNvPr id="{sid}" name="Text {sid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:noFill/><a:ln><a:noFill/></a:ln>
              </p:spPr>
              {tx_body(text, size, color, bold, align)}
            </p:sp>"""
        )

    def circle(self, x: float, y: float, d: float, fill: str = "EF4444", line: str | None = None, text: str | None = None, size: int = 16) -> None:
        sid = self.next_id()
        line_xml = "<a:ln><a:noFill/></a:ln>" if line is None else f'<a:ln w="25400"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>'
        text_xml = tx_body(text, size, "FFFFFF", True, "ctr") if text else ""
        self.parts.append(
            f"""
            <p:sp>
              <p:nvSpPr><p:cNvPr id="{sid}" name="Circle {sid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(d)}" cy="{emu(d)}"/></a:xfrm>
                <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>
                {line_xml}
              </p:spPr>
              {text_xml}
            </p:sp>"""
        )

    def outline_circle(self, x: float, y: float, d: float, line: str = "EF4444") -> None:
        sid = self.next_id()
        self.parts.append(
            f"""
            <p:sp>
              <p:nvSpPr><p:cNvPr id="{sid}" name="Marker {sid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(d)}" cy="{emu(d)}"/></a:xfrm>
                <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>
                <a:noFill/>
                <a:ln w="38100"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>
              </p:spPr>
            </p:sp>"""
        )

    def xml(self) -> str:
        return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="{self.bg}"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      {''.join(self.parts)}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""


def header(slide: Slide, section: str, page: int, total: int) -> None:
    slide.text(0.55, 0.25, 5.2, 0.25, section.upper(), 8, "6B766F", True)
    slide.text(11.7, 0.25, 1.1, 0.25, f"{page:02d} / {total:02d}", 8, "6B766F", True, "r")
    slide.line(0.55, 0.62, 12.75, 0.62, "D8DED8", 1)


def title(slide: Slide, text: str, subtitle: str | None = None) -> None:
    slide.text(0.75, 0.85, 7.3, 1.0, text, 34, "172026", False)
    if subtitle:
        slide.text(0.8, 1.75, 7.2, 0.45, subtitle, 14, "52605A")


def browser_window(slide: Slide, x: float, y: float, w: float, h: float, url: str, title_text: str = "Chrome") -> tuple[float, float, float, float]:
    slide.rect(x, y, w, h, "FFFFFF", "C9D1CC")
    slide.rect(x, y, w, 0.42, "F1F3F2", "C9D1CC")
    slide.circle(x + 0.22, y + 0.14, 0.11, "EF4444")
    slide.circle(x + 0.42, y + 0.14, 0.11, "F59E0B")
    slide.circle(x + 0.62, y + 0.14, 0.11, "10B981")
    slide.rect(x + 0.92, y + 0.10, w - 1.15, 0.22, "FFFFFF", "D8DED8", url, 7, "6B766F")
    slide.text(x + 0.08, y + 0.47, w - 0.16, 0.23, title_text, 8, "6B766F", True)
    return x + 0.18, y + 0.78, w - 0.36, h - 0.96


def popup_mock(slide: Slide, x: float, y: float, w: float, h: float) -> None:
    slide.rect(x, y, w, h, "F7F8F5", "C9D1CC")
    slide.text(x + 0.22, y + 0.18, w - 0.44, 0.25, "ClickGuide Local", 12, "172026", True)
    slide.rect(x + w - 1.0, y + 0.17, 0.75, 0.26, "FEE2E2", "FECACA", "녹화 중", 8, "B42318", True, "ctr")
    slide.rect(x + 0.22, y + 0.62, w - 0.44, 0.68, "FFFFFF", "D8DED8")
    slide.text(x + 0.42, y + 0.74, 1.0, 0.18, "기록된 단계", 7, "6B766F", True)
    slide.text(x + 0.42, y + 0.92, 0.8, 0.28, "3", 22, "172026", True)
    slide.rect(x + 0.22, y + 1.48, w - 0.44, 0.38, "0F766E", None, "녹화 시작", 10, "FFFFFF", True, "ctr")
    slide.rect(x + 0.22, y + 1.98, 1.15, 0.34, "FFFFFF", "D8DED8", "일시정지", 8, "172026", True, "ctr")
    slide.rect(x + 1.48, y + 1.98, 1.15, 0.34, "FFFFFF", "D8DED8", "녹화 종료", 8, "172026", True, "ctr")
    slide.rect(x + 0.22, y + 2.45, w - 0.44, 0.34, "FFFFFF", "FECACA", "마지막 단계 삭제", 8, "B42318", True, "ctr")


def editor_mock(slide: Slide, x: float, y: float, w: float, h: float) -> None:
    slide.rect(x, y, w, h, "FFFFFF", "C9D1CC")
    slide.rect(x, y, w, 0.45, "FFFFFF", "D8DED8")
    slide.text(x + 0.18, y + 0.13, 1.2, 0.18, "ClickGuide", 9, "0F766E", True)
    slide.rect(x + w - 1.25, y + 0.11, 0.95, 0.24, "0F766E", None, "HTML export", 7, "FFFFFF", True, "ctr")
    left_w = 2.0
    right_w = 2.25
    slide.rect(x, y + 0.45, left_w, h - 0.45, "FAFAF8", "D8DED8")
    slide.rect(x + w - right_w, y + 0.45, right_w, h - 0.45, "FAFAF8", "D8DED8")
    for i, label in enumerate(["고객 관리", "신규 등록", "저장"]):
        yy = y + 0.75 + i * 0.62
        slide.rect(x + 0.16, yy, left_w - 0.32, 0.44, "FFFFFF" if i else "E6FFFA", "D8DED8")
        slide.circle(x + 0.30, yy + 0.11, 0.20, "EF4444", None, str(i + 1), 8)
        slide.text(x + 0.58, yy + 0.14, 1.1, 0.14, label, 7, "172026", True)
    cx = x + left_w + 0.25
    cy = y + 0.78
    cw = w - left_w - right_w - 0.5
    ch = h - 1.05
    slide.rect(cx, cy, cw, ch, "F1F5F4", "D8DED8")
    slide.rect(cx + 0.35, cy + 0.35, cw - 0.7, 0.42, "FFFFFF", "D8DED8", "Customer Admin", 8, "52605A")
    slide.rect(cx + 0.65, cy + 1.05, 1.3, 0.45, "0F766E", None, "신규 등록", 9, "FFFFFF", True, "ctr")
    slide.outline_circle(cx + 1.00, cy + 0.94, 0.72, "EF4444")
    slide.circle(cx + 0.74, cy + 0.72, 0.33, "EF4444", None, "2", 11)
    slide.text(x + w - right_w + 0.22, y + 0.78, 1.7, 0.18, "단계 설명", 8, "52605A", True)
    slide.rect(x + w - right_w + 0.22, y + 1.08, right_w - 0.44, 0.78, "FFFFFF", "D8DED8", "\"신규 등록\"을 클릭하세요.", 8, "172026")
    slide.text(x + w - right_w + 0.22, y + 2.1, 1.4, 0.18, "좌표: x 842, y 312", 7, "52605A")


def make_slides() -> list[Slide]:
    total = 10
    slides: list[Slide] = []

    s = Slide("cover", "0F766E")
    s.rect(0, 0, 13.333, 7.5, "0F766E", None)
    s.text(0.65, 0.45, 3.2, 0.3, "CLICKGUIDE LOCAL", 9, "D7FFFA", True)
    s.text(10.9, 0.45, 1.8, 0.3, "TEAM GUIDE", 9, "D7FFFA", True, "r")
    s.line(0.65, 0.95, 12.7, 0.95, "D7FFFA", 1)
    s.text(0.85, 1.35, 9.5, 1.8, "팀 설치·실행\nPPT 가이드", 40, "FFFFFF", True)
    s.text(0.9, 4.1, 6.6, 0.75, "ZIP 파일 설치부터 녹화, 편집, HTML export까지\n가상의 캡처 화면을 보며 그대로 따라 하는 안내서", 17, "E6FFFA")
    s.rect(8.25, 4.0, 3.55, 1.8, "FFFFFF", None)
    s.text(8.55, 4.25, 2.9, 0.45, "배포 파일", 13, "0F766E", True)
    s.text(8.55, 4.85, 2.9, 0.3, "ClickGuideLocal-extension.zip", 12, "172026", True)
    s.text(8.55, 5.25, 2.9, 0.22, "압축 해제 후 Load unpacked", 9, "52605A")
    slides.append(s)

    s = Slide("team package")
    header(s, "배포 준비", 2, total)
    title(s, "팀원에게는 ZIP 하나만 보내면 됩니다", "받는 사람은 개발 환경 없이 Chrome에서 바로 설치합니다.")
    s.rect(0.85, 2.25, 3.1, 2.25, "FFFFFF", "D8DED8")
    s.text(1.15, 2.55, 2.45, 0.32, "전달 파일", 18, "0F766E", True)
    s.text(1.15, 3.18, 2.45, 0.32, "ClickGuideLocal-\nextension.zip", 22, "172026", True)
    s.text(1.15, 4.03, 2.4, 0.26, "이 파일만 공유", 12, "52605A")
    s.rect(4.6, 2.25, 3.2, 2.25, "F7F8F5", "D8DED8")
    s.text(4.95, 2.55, 2.55, 0.3, "압축 해제 후", 18, "0F766E", True)
    s.text(4.95, 3.15, 2.55, 0.3, "manifest.json이\n보이는 폴더 선택", 20, "172026", True)
    s.text(4.95, 4.04, 2.3, 0.24, "하위 폴더를 잘못 고르지 않기", 11, "52605A")
    s.rect(8.35, 2.25, 3.2, 2.25, "FFFFFF", "D8DED8")
    s.text(8.7, 2.55, 2.55, 0.3, "설치 후", 18, "0F766E", True)
    s.text(8.7, 3.15, 2.55, 0.3, "퍼즐 아이콘에서\nClickGuide 고정", 20, "172026", True)
    s.text(8.7, 4.04, 2.2, 0.24, "녹화 시작 버튼으로 사용", 11, "52605A")
    s.text(0.9, 5.65, 10.8, 0.45, "권장 공유 문구: “압축 풀고 chrome://extensions에서 개발자 모드 켠 뒤 Load unpacked로 폴더를 선택하세요.”", 16, "172026", True)
    slides.append(s)

    s = Slide("install timeline")
    header(s, "설치 순서", 3, total)
    title(s, "설치자는 6단계만 따라 하면 됩니다")
    steps = [
        ("1", "ZIP 압축 해제", "받은 파일을 원하는 위치에 풉니다."),
        ("2", "Chrome 확장 페이지", "주소창에 chrome://extensions 입력."),
        ("3", "개발자 모드 ON", "오른쪽 위 토글을 켭니다."),
        ("4", "Load unpacked", "압축 해제한 폴더를 선택합니다."),
        ("5", "아이콘 고정", "퍼즐 메뉴에서 ClickGuide를 고정합니다."),
        ("6", "업무 사이트에서 녹화", "녹화 시작 후 평소처럼 클릭합니다."),
    ]
    for i, (num, head, body) in enumerate(steps):
        x = 0.85 + (i % 3) * 4.05
        y = 2.0 + (i // 3) * 1.72
        s.rect(x, y, 3.5, 1.2, "FFFFFF", "D8DED8")
        s.circle(x + 0.28, y + 0.26, 0.42, "EF4444", None, num, 12)
        s.text(x + 0.88, y + 0.22, 2.4, 0.25, head, 16, "172026", True)
        s.text(x + 0.88, y + 0.62, 2.35, 0.24, body, 10, "52605A")
    s.text(0.9, 6.1, 8.6, 0.35, "설치 후 업데이트는 새 ZIP으로 폴더를 교체하고 확장 프로그램 카드의 새로고침 버튼만 누르면 됩니다.", 14, "52605A")
    slides.append(s)

    s = Slide("chrome extensions mock")
    header(s, "가상 캡처 1", 4, total)
    title(s, "Chrome 확장 프로그램 화면에서 설치합니다", "개발자 모드를 켠 뒤 Load unpacked 버튼을 누릅니다.")
    bx, by, bw, bh = browser_window(s, 0.75, 2.02, 11.85, 4.75, "chrome://extensions", "Extensions")
    s.text(bx + 0.25, by + 0.18, 2.2, 0.3, "확장 프로그램", 18, "172026", True)
    s.rect(bx + bw - 2.25, by + 0.12, 1.8, 0.34, "E6FFFA", "99F6E4", "개발자 모드  ON", 11, "0F766E", True, "ctr")
    s.rect(bx + 0.25, by + 0.82, 1.6, 0.38, "0F766E", None, "Load unpacked", 10, "FFFFFF", True, "ctr")
    s.rect(bx + 2.05, by + 0.82, 1.45, 0.38, "FFFFFF", "D8DED8", "Pack extension", 9, "52605A", True, "ctr")
    s.outline_circle(bx + bw - 2.45, by - 0.02, 0.86)
    s.circle(bx + bw - 2.7, by - 0.24, 0.35, "EF4444", None, "1", 11)
    s.outline_circle(bx + 0.72, by + 0.58, 0.78)
    s.circle(bx + 0.48, by + 0.36, 0.35, "EF4444", None, "2", 11)
    s.rect(bx + 0.25, by + 1.58, 3.05, 1.42, "FFFFFF", "D8DED8")
    s.text(bx + 0.48, by + 1.82, 2.0, 0.22, "ClickGuide Local", 12, "172026", True)
    s.text(bx + 0.48, by + 2.22, 2.3, 0.22, "Record browser clicks...", 8, "52605A")
    s.text(9.05, 5.95, 2.5, 0.3, "여기서 폴더 선택", 15, "EF4444", True)
    slides.append(s)

    s = Slide("folder selection")
    header(s, "가상 캡처 2", 5, total)
    title(s, "폴더 선택은 manifest.json이 기준입니다")
    s.rect(0.85, 2.1, 5.45, 3.6, "FFFFFF", "D8DED8")
    s.text(1.15, 2.42, 2.8, 0.25, "잘못된 선택", 17, "B42318", True)
    s.text(1.15, 2.9, 3.6, 0.25, "ClickGuideLocal-extension", 12, "172026", True)
    for i, name in enumerate(["assets", "guide-editor.html", "popup.html"]):
        s.rect(1.18, 3.35 + i * 0.46, 3.8, 0.3, "F7F8F5", "D8DED8", name, 9, "52605A")
    s.text(1.15, 4.95, 3.9, 0.25, "하위 폴더 assets를 고르면 실패합니다.", 11, "B42318", True)
    s.rect(7.05, 2.1, 5.45, 3.6, "E6FFFA", "99F6E4")
    s.text(7.35, 2.42, 2.8, 0.25, "올바른 선택", 17, "0F766E", True)
    s.text(7.35, 2.9, 3.6, 0.25, "ClickGuideLocal-extension", 12, "172026", True)
    for i, name in enumerate(["manifest.json", "assets", "guide-editor.html", "popup.html"]):
        fill = "FFFFFF" if name == "manifest.json" else "F7F8F5"
        color = "0F766E" if name == "manifest.json" else "52605A"
        s.rect(7.38, 3.35 + i * 0.41, 3.8, 0.27, fill, "D8DED8", name, 9, color, name == "manifest.json")
    s.outline_circle(7.15, 3.18, 0.72, "EF4444")
    s.circle(6.92, 2.98, 0.32, "EF4444", None, "1", 10)
    s.text(7.35, 5.08, 3.95, 0.25, "manifest.json이 바로 보이는 폴더를 선택합니다.", 11, "0F766E", True)
    slides.append(s)

    s = Slide("pin and popup")
    header(s, "가상 캡처 3", 6, total)
    title(s, "설치 후 아이콘을 고정하고 녹화를 시작합니다")
    bx, by, bw, bh = browser_window(s, 0.75, 1.9, 7.1, 4.6, "https://example.com/admin/customers", "Customer Admin")
    s.rect(bx + 0.25, by + 0.28, 1.45, 0.48, "172026", None, "관리 메뉴", 10, "FFFFFF", True, "ctr")
    s.rect(bx + 2.05, by + 0.28, 1.45, 0.48, "0F766E", None, "신규 등록", 10, "FFFFFF", True, "ctr")
    s.rect(bx + 0.25, by + 1.25, bw - 0.5, 2.2, "F7F8F5", "D8DED8")
    s.text(bx + 0.55, by + 1.62, 3.5, 0.22, "고객 목록", 16, "172026", True)
    s.outline_circle(bx + 2.37, by + 0.17, 0.72)
    s.circle(bx + 2.1, by - 0.04, 0.33, "EF4444", None, "1", 10)
    popup_mock(s, 8.45, 2.02, 3.15, 3.25)
    s.outline_circle(8.86, 3.38, 0.72)
    s.circle(8.62, 3.18, 0.33, "EF4444", None, "2", 10)
    s.text(8.35, 5.7, 3.3, 0.42, "녹화 중에는 클릭할 때마다\n좌표와 스크린샷이 저장됩니다.", 13, "52605A")
    slides.append(s)

    s = Slide("recording concept")
    header(s, "녹화 원리", 7, total)
    title(s, "사용자는 평소처럼 클릭하면 됩니다", "동그라미와 번호는 나중에 자동으로 표시됩니다.")
    bx, by, bw, bh = browser_window(s, 0.85, 2.0, 11.6, 4.55, "https://example.com/admin/customers", "Customer Admin")
    s.rect(bx + 0.3, by + 0.28, 1.55, 0.42, "172026", None, "고객 관리", 9, "FFFFFF", True, "ctr")
    s.rect(bx + 2.15, by + 0.28, 1.55, 0.42, "0F766E", None, "신규 등록", 9, "FFFFFF", True, "ctr")
    s.rect(bx + 0.3, by + 1.05, bw - 0.6, 2.55, "F7F8F5", "D8DED8")
    for i in range(4):
        s.rect(bx + 0.58, by + 1.36 + i * 0.42, bw - 1.16, 0.24, "FFFFFF", "E5E7EB")
    markers = [(bx + 0.85, by + 0.12, "1"), (bx + 2.65, by + 0.12, "2"), (bx + 8.9, by + 1.6, "3")]
    for mx, my, num in markers:
        s.outline_circle(mx, my, 0.62)
        s.circle(mx - 0.23, my - 0.2, 0.3, "EF4444", None, num, 10)
    s.rect(1.05, 5.8, 3.25, 0.46, "FFFFFF", "D8DED8", "URL / 제목 / 좌표 저장", 12, "172026", True, "ctr")
    s.rect(5.0, 5.8, 3.25, 0.46, "FFFFFF", "D8DED8", "클릭 순간 스크린샷 저장", 12, "172026", True, "ctr")
    s.rect(8.95, 5.8, 3.25, 0.46, "FFFFFF", "D8DED8", "순서 번호 자동 표시", 12, "172026", True, "ctr")
    slides.append(s)

    s = Slide("editor mock")
    header(s, "가상 캡처 4", 8, total)
    title(s, "녹화 종료 후 편집 화면에서 정리합니다")
    editor_mock(s, 0.8, 1.75, 11.8, 4.95)
    s.text(0.92, 6.88, 11.2, 0.22, "좌측 단계 선택 → 중앙 마커 확인/드래그 → 우측 설명 입력 → HTML export", 12, "52605A", True, "ctr")
    slides.append(s)

    s = Slide("export")
    header(s, "내보내기", 9, total)
    title(s, "HTML export 파일은 인터넷 없이 열립니다")
    s.rect(0.85, 2.1, 3.35, 3.35, "FFFFFF", "D8DED8")
    s.text(1.15, 2.45, 2.6, 0.3, "편집 화면", 18, "172026", True)
    s.rect(1.15, 3.0, 2.5, 0.55, "0F766E", None, "HTML export", 15, "FFFFFF", True, "ctr")
    s.text(1.15, 4.0, 2.6, 0.38, "마커가 합성된\n단일 HTML 생성", 16, "52605A")
    s.text(4.75, 3.35, 0.7, 0.3, "→", 28, "0F766E", True, "ctr")
    s.rect(5.85, 2.1, 3.35, 3.35, "FFFFFF", "D8DED8")
    s.text(6.15, 2.45, 2.6, 0.3, "guide.html", 18, "172026", True)
    s.rect(6.15, 3.0, 2.5, 1.35, "F7F8F5", "D8DED8")
    s.circle(6.88, 3.36, 0.28, "EF4444", None, "1", 9)
    s.outline_circle(7.12, 3.55, 0.55)
    s.text(6.15, 4.65, 2.6, 0.25, "메일/메신저로 공유", 14, "52605A")
    s.rect(9.75, 2.1, 2.65, 3.35, "E6FFFA", "99F6E4")
    s.text(10.0, 2.45, 2.1, 0.3, "팀원이 열기", 18, "0F766E", True)
    s.text(10.0, 3.08, 2.1, 0.62, "브라우저에서\n그대로 단계 확인", 17, "172026", True)
    s.text(10.0, 4.32, 2.1, 0.3, "서버/로그인 불필요", 13, "0F766E", True)
    slides.append(s)

    s = Slide("trouble shooting")
    header(s, "문제 해결", 10, total)
    title(s, "설치 중 막히면 이 네 가지만 확인합니다")
    cards = [
        ("폴더 선택 오류", "manifest.json이 바로 보이는 폴더를 선택했는지 확인"),
        ("버튼이 안 보임", "퍼즐 아이콘에서 ClickGuide Local을 고정"),
        ("녹화가 안 됨", "chrome://, edge:// 같은 제한 페이지가 아닌지 확인"),
        ("업데이트 반영 안 됨", "확장 프로그램 카드의 새로고침 버튼 클릭"),
    ]
    for i, (head, body) in enumerate(cards):
        x = 0.85 + (i % 2) * 6.0
        y = 2.1 + (i // 2) * 1.7
        s.rect(x, y, 5.25, 1.16, "FFFFFF", "D8DED8")
        s.circle(x + 0.28, y + 0.26, 0.42, "0F766E", None, str(i + 1), 12)
        s.text(x + 0.88, y + 0.24, 3.6, 0.24, head, 17, "172026", True)
        s.text(x + 0.88, y + 0.65, 3.8, 0.24, body, 10, "52605A")
    s.rect(0.85, 6.05, 11.6, 0.42, "0F766E", None, "최종 배포 권장: 내부 테스트는 ZIP, 정식 운영은 Chrome Web Store 비공개 배포", 14, "FFFFFF", True, "ctr")
    slides.append(s)

    return slides


def content_types(count: int) -> str:
    slide_overrides = "\n".join(
        f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(1, count + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  {slide_overrides}
</Types>"""


def presentation_xml(count: int) -> str:
    ids = "\n".join(
        f'<p:sldId id="{255 + i}" r:id="rId{i}"/>' for i in range(1, count + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId{count + 1}"/></p:sldMasterIdLst>
  <p:sldIdLst>{ids}</p:sldIdLst>
  <p:sldSz cx="{SLIDE_W}" cy="{SLIDE_H}" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>"""


def presentation_rels(count: int) -> str:
    rels = "\n".join(
        f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>'
        for i in range(1, count + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {rels}
  <Relationship Id="rId{count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
</Relationships>"""


def slide_rels() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>"""


def slide_master_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle/>
    <p:bodyStyle/>
    <p:otherStyle/>
  </p:txStyles>
</p:sldMaster>"""


def slide_master_rels() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>"""


def slide_layout_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>"""


def slide_layout_rels() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>"""


def theme_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="ClickGuide">
  <a:themeElements>
    <a:clrScheme name="ClickGuide">
      <a:dk1><a:srgbClr val="172026"/></a:dk1>
      <a:lt1><a:srgbClr val="FAFAF8"/></a:lt1>
      <a:dk2><a:srgbClr val="52605A"/></a:dk2>
      <a:lt2><a:srgbClr val="FFFFFF"/></a:lt2>
      <a:accent1><a:srgbClr val="0F766E"/></a:accent1>
      <a:accent2><a:srgbClr val="EF4444"/></a:accent2>
      <a:accent3><a:srgbClr val="D8DED8"/></a:accent3>
      <a:accent4><a:srgbClr val="F7F8F5"/></a:accent4>
      <a:accent5><a:srgbClr val="99F6E4"/></a:accent5>
      <a:accent6><a:srgbClr val="B42318"/></a:accent6>
      <a:hlink><a:srgbClr val="0F766E"/></a:hlink>
      <a:folHlink><a:srgbClr val="0F766E"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="ClickGuide">
      <a:majorFont><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/></a:majorFont>
      <a:minorFont><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="ClickGuide">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>"""


def root_rels() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""


def core_props() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:dcmitype="http://purl.org/dc/dcmitype/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>ClickGuide Local 팀 설치 실행 가이드</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-06-15T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-06-15T00:00:00Z</dcterms:modified>
</cp:coreProperties>"""


def app_props(count: int) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft PowerPoint</Application>
  <PresentationFormat>Widescreen</PresentationFormat>
  <Slides>{count}</Slides>
</Properties>"""


def write_pptx(slides: list[Slide], out: Path) -> None:
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types(len(slides)))
        z.writestr("_rels/.rels", root_rels())
        z.writestr("docProps/core.xml", core_props())
        z.writestr("docProps/app.xml", app_props(len(slides)))
        z.writestr("ppt/presentation.xml", presentation_xml(len(slides)))
        z.writestr("ppt/_rels/presentation.xml.rels", presentation_rels(len(slides)))
        z.writestr("ppt/slideMasters/slideMaster1.xml", slide_master_xml())
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", slide_master_rels())
        z.writestr("ppt/slideLayouts/slideLayout1.xml", slide_layout_xml())
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", slide_layout_rels())
        z.writestr("ppt/theme/theme1.xml", theme_xml())
        for i, slide in enumerate(slides, 1):
            z.writestr(f"ppt/slides/slide{i}.xml", slide.xml())
            z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", slide_rels())


if __name__ == "__main__":
    slides = make_slides()
    write_pptx(slides, OUT)
    print(os.path.abspath(OUT))
