import unittest

from drive_wikify.extractors.hwp_hwpx import (
    _extract_rhwp_tables,
    _extract_rhwp_text,
    _heading_candidates,
    _render_markdown_table,
)


class HwpHwpxExtractorTests(unittest.TestCase):
    def test_extract_rhwp_text_parses_paragraphs_and_cells(self):
        dump = """
--- 문단 0.2 --- cc=15, text_len=14, controls=0
  텍스트: "1. 스마트공장 구축 개요"
  [2]   셀[0] r=0,c=0 rs=1,cs=4 text="정부일반형 스마트공장 구축사업 사업계획서"
  [2]   셀[1] r=1,c=0 rs=1,cs=1 text="도입기업명"
  [2]   셀[2] r=1,c=1 rs=1,cs=1 text="주식회사 쏘닉스"
  텍스트: "□ 스마트공장 구축 주요 내용 및 목표수준"
  텍스트: "컨소시엄|공급기업명 (해당시)"
""".strip()
        extracted = _extract_rhwp_text(dump)

        self.assertIn("1. 스마트공장 구축 개요", extracted)
        self.assertIn("정부일반형 스마트공장 구축사업 사업계획서", extracted)
        self.assertIn("도입기업명", extracted)
        self.assertIn("주식회사 쏘닉스", extracted)
        self.assertIn("□ 스마트공장 구축 주요 내용 및 목표수준", extracted)
        self.assertIn("컨소시엄", extracted)
        self.assertIn("공급기업명 (해당시)", extracted)

    def test_heading_candidates_select_outline_lines(self):
        text = "\n".join([
            "1. 스마트공장 구축 개요",
            "1.1 스마트공장 구축 목표",
            "□ 스마트공장 구축 주요 내용 및 목표수준",
            "주식회사 쏘닉스",
        ])
        headings = _heading_candidates(text)

        self.assertIn("1. 스마트공장 구축 개요", headings)
        self.assertIn("1.1 스마트공장 구축 목표", headings)
        self.assertIn("□ 스마트공장 구축 주요 내용 및 목표수준", headings)
        self.assertNotIn("주식회사 쏘닉스", headings)

    def test_extract_rhwp_tables_and_render_markdown(self):
        dump = """
[2] 표: 3행×2열, 셀=6
[2]   셀[0] r=0,c=0 rs=1,cs=1 text="항목"
[2]   셀[1] r=0,c=1 rs=1,cs=1 text="값"
[2]   셀[2] r=1,c=0 rs=1,cs=1 text="도입기업명"
[2]   셀[3] r=1,c=1 rs=1,cs=1 text="주식회사 쏘닉스"
[2]   셀[4] r=2,c=0 rs=1,cs=1 text="공급기업명"
[2]   셀[5] r=2,c=1 rs=1,cs=1 text="비젠트로 주식회사"
""".strip()
        tables = _extract_rhwp_tables(dump)

        self.assertEqual(len(tables), 1)
        self.assertEqual(tables[0][0], ["항목", "값"])
        self.assertEqual(tables[0][1], ["도입기업명", "주식회사 쏘닉스"])

        markdown = _render_markdown_table(tables[0])
        self.assertIn("| 항목 | 값 |", markdown)
        self.assertIn("| 도입기업명 | 주식회사 쏘닉스 |", markdown)


if __name__ == "__main__":
    unittest.main()
