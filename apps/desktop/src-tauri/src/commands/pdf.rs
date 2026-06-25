//! PDF export for lawcalc-kr.
//!
//! Engine choice: `printpdf` 0.7 (pure Rust, stable API, supports embedded
//! TrueType fonts with subsetting). The alternative `typst` was rejected
//! because pulling the typst compiler into the Tauri binary inflates the
//! distributable beyond what a single-page calculation report justifies; see
//! `docs/ARCHITECTURE.md` "PDF engine" for the full rationale.
//!
//! Korean glyphs are rendered with Pretendard Regular (SIL OFL 1.1, license
//! shipped at `assets/fonts/Pretendard-OFL.txt`). The font file is embedded
//! at compile time via `include_bytes!`; subsetting trims it to the glyphs
//! actually used in the document.

use std::path::PathBuf;

use printpdf::{
    BuiltinFont, IndirectFontRef, Line, Mm, PdfDocument, PdfDocumentReference, PdfLayerReference,
    Point,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{async_runtime, AppHandle};
use tauri_plugin_dialog::DialogExt;

use crate::error::Error;

use super::result_view::{
    disclaimer_text, format_currency, format_rate_percent, options_summary,
    CompensationDeathResultView, CompensationOtherDamagesView, CompensationResultView,
    InheritanceResultView, LitigationCostResultView, ResultView,
};

const PRETENDARD_REGULAR: &[u8] = include_bytes!("../../assets/fonts/Pretendard-Regular.ttf");

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOptions {
    /// Optional free-form note shown below the result table.
    #[serde(default)]
    pub note: Option<String>,
}

/// Export the calculation result as a PDF at a path chosen by the user.
/// Returns `Ok(None)` when the user cancels the save dialog.
///
/// Tauri 2.x: dialog 의 `blocking_*` 변형은 main thread 에서 호출 시 macOS / Windows 에서
/// deadlock 한다. async command 안에서 `tauri::async_runtime::spawn_blocking` 으로 워커
/// 스레드에 위임해야 UI 가 멈추지 않는다.
#[tauri::command]
pub async fn export_pdf(
    app: AppHandle,
    result: Value,
    options: Option<PdfOptions>,
) -> Result<Option<String>, Error> {
    let view: ResultView = serde_json::from_value(result)?;
    let opts = options.unwrap_or_default();

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .set_file_name("calculation.pdf")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_pdf_bytes(&view, &opts)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

#[tauri::command]
pub async fn export_inheritance_pdf(
    app: AppHandle,
    result: Value,
) -> Result<Option<String>, Error> {
    let view: InheritanceResultView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .set_file_name("inheritance-calculation.pdf")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_inheritance_pdf_bytes(&view)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

#[tauri::command]
pub async fn export_litigation_cost_pdf(
    app: AppHandle,
    result: Value,
) -> Result<Option<String>, Error> {
    let view: LitigationCostResultView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .set_file_name("litigation-cost-calculation.pdf")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_litigation_cost_pdf_bytes(&view)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

#[tauri::command]
pub async fn export_compensation_pdf(
    app: AppHandle,
    result: Value,
) -> Result<Option<String>, Error> {
    let view: CompensationResultView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .set_file_name("compensation-calculation.pdf")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_compensation_pdf_bytes(&view)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

#[tauri::command]
pub async fn export_compensation_death_pdf(
    app: AppHandle,
    result: Value,
) -> Result<Option<String>, Error> {
    let view: CompensationDeathResultView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .set_file_name("compensation-death-calculation.pdf")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_compensation_death_pdf_bytes(&view)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

/// A4 portrait dimensions, top-down layout.
const PAGE_W_MM: f32 = 210.0;
const PAGE_H_MM: f32 = 297.0;
const MARGIN_MM: f32 = 18.0;
const FOOTER_RESERVE_MM: f32 = 22.0;

/// Column widths in mm. Sum must equal inner width (PAGE_W_MM - 2*MARGIN).
const COL_WIDTHS: [f32; 6] = [
    24.0, // 시작일
    24.0, // 종료일
    12.0, // 일수
    14.0, // 이율
    78.0, // 공식
    22.0, // 이자
];

/// Build the PDF byte stream for a single calculation result.
pub fn render_pdf_bytes(view: &ResultView, options: &PdfOptions) -> Result<Vec<u8>, Error> {
    let (doc, page1, layer1) = PdfDocument::new(
        "LawCalc Korea — 이자 계산서",
        Mm(PAGE_W_MM),
        Mm(PAGE_H_MM),
        "Layer 1",
    );

    // Embed Pretendard with subsetting → only the glyphs we use end up in
    // the file, keeping per-document size in the tens of KB.
    let font = doc
        .add_external_font_with_subsetting(PRETENDARD_REGULAR, true)
        .map_err(|e| Error::Other(format!("PDF 한글 폰트 임베딩 실패: {e}")))?;
    // ASCII fallback for ratio bars / dividers if subsetting trims a glyph.
    let _builtin_helvetica = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| Error::Other(format!("PDF 내장 폰트 등록 실패: {e}")))?;

    let mut writer = PageWriter::new(&doc, page1, layer1, font);

    writer.draw_title("LawCalc Korea — 이자 계산서");
    writer.draw_subtitle(&format!("계산 시각  {}", view.computed_at));
    writer.draw_summary_block(view);
    writer.draw_segment_table(view);

    if let Some(note) = options.note.as_deref() {
        if !note.trim().is_empty() {
            writer.draw_note(note);
        }
    }

    writer.draw_footer(view);

    let bytes = doc
        .save_to_bytes()
        .map_err(|e| Error::Other(format!("PDF 저장 실패: {e}")))?;
    Ok(bytes)
}

pub fn render_inheritance_pdf_bytes(view: &InheritanceResultView) -> Result<Vec<u8>, Error> {
    let (doc, page1, layer1) = PdfDocument::new(
        "LawCalc Korea — 상속분 간이 계산서",
        Mm(PAGE_W_MM),
        Mm(PAGE_H_MM),
        "Layer 1",
    );

    let font = doc
        .add_external_font_with_subsetting(PRETENDARD_REGULAR, true)
        .map_err(|e| Error::Other(format!("PDF 한글 폰트 임베딩 실패: {e}")))?;
    let _builtin_helvetica = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| Error::Other(format!("PDF 내장 폰트 등록 실패: {e}")))?;

    let mut writer = PageWriter::new(&doc, page1, layer1, font);
    writer.draw_title("LawCalc Korea — 상속분 간이 계산서");
    writer.draw_subtitle(&format!("계산 시각  {}", view.computed_at));
    writer.draw_inheritance_summary(view);
    writer.draw_inheritance_table(view);
    writer.draw_inheritance_footer(view);

    let bytes = doc
        .save_to_bytes()
        .map_err(|e| Error::Other(format!("PDF 저장 실패: {e}")))?;
    Ok(bytes)
}

pub fn render_litigation_cost_pdf_bytes(view: &LitigationCostResultView) -> Result<Vec<u8>, Error> {
    let (doc, page1, layer1) = PdfDocument::new(
        "LawCalc Korea — 소송비용 계산서",
        Mm(PAGE_W_MM),
        Mm(PAGE_H_MM),
        "Layer 1",
    );

    let font = doc
        .add_external_font_with_subsetting(PRETENDARD_REGULAR, true)
        .map_err(|e| Error::Other(format!("PDF 한글 폰트 임베딩 실패: {e}")))?;
    let _builtin_helvetica = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| Error::Other(format!("PDF 내장 폰트 등록 실패: {e}")))?;

    let mut writer = PageWriter::new(&doc, page1, layer1, font);
    writer.draw_title("LawCalc Korea — 소송비용 계산서");
    writer.draw_subtitle(&format!("계산 시각  {}", view.computed_at));
    writer.draw_litigation_cost_summary(view);
    writer.draw_litigation_cost_distribution(view);
    writer.draw_litigation_cost_footer(view);

    let bytes = doc
        .save_to_bytes()
        .map_err(|e| Error::Other(format!("PDF 저장 실패: {e}")))?;
    Ok(bytes)
}

pub fn render_compensation_pdf_bytes(view: &CompensationResultView) -> Result<Vec<u8>, Error> {
    let (doc, page1, layer1) = PdfDocument::new(
        "LawCalc Korea — 자×부상 손해배상 계산서",
        Mm(PAGE_W_MM),
        Mm(PAGE_H_MM),
        "Layer 1",
    );

    let font = doc
        .add_external_font_with_subsetting(PRETENDARD_REGULAR, true)
        .map_err(|e| Error::Other(format!("PDF 한글 폰트 임베딩 실패: {e}")))?;
    let _builtin_helvetica = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| Error::Other(format!("PDF 내장 폰트 등록 실패: {e}")))?;

    let mut writer = PageWriter::new(&doc, page1, layer1, font);
    writer.draw_title("LawCalc Korea — 자×부상 손해배상 계산서");
    writer.draw_subtitle(&format!("계산 시각  {}", view.computed_at));
    writer.draw_compensation_summary(view);
    writer.draw_compensation_other_damages(view.other_damages.as_ref());
    writer.draw_compensation_segments_table(view);
    writer.draw_compensation_footer(view);

    let bytes = doc
        .save_to_bytes()
        .map_err(|e| Error::Other(format!("PDF 저장 실패: {e}")))?;
    Ok(bytes)
}

pub fn render_compensation_death_pdf_bytes(
    view: &CompensationDeathResultView,
) -> Result<Vec<u8>, Error> {
    let (doc, page1, layer1) = PdfDocument::new(
        "LawCalc Korea — 자×사망 손해배상 계산서",
        Mm(PAGE_W_MM),
        Mm(PAGE_H_MM),
        "Layer 1",
    );

    let font = doc
        .add_external_font_with_subsetting(PRETENDARD_REGULAR, true)
        .map_err(|e| Error::Other(format!("PDF 한글 폰트 임베딩 실패: {e}")))?;
    let _builtin_helvetica = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| Error::Other(format!("PDF 내장 폰트 등록 실패: {e}")))?;

    let mut writer = PageWriter::new(&doc, page1, layer1, font);
    writer.draw_title("LawCalc Korea — 자×사망 손해배상 계산서");
    writer.draw_subtitle(&format!("계산 시각  {}", view.computed_at));
    writer.draw_compensation_death_summary(view);
    writer.draw_compensation_other_damages(view.other_damages.as_ref());
    writer.draw_compensation_death_segments_table(view);
    writer.draw_compensation_death_inheritance_table(view);
    writer.draw_compensation_death_footer(view);

    let bytes = doc
        .save_to_bytes()
        .map_err(|e| Error::Other(format!("PDF 저장 실패: {e}")))?;
    Ok(bytes)
}

/// Internal layout state for the multi-page renderer.
struct PageWriter<'a> {
    doc: &'a PdfDocumentReference,
    layer: PdfLayerReference,
    font: IndirectFontRef,
    /// Current y position in mm, measured from the bottom of the page.
    y: f32,
}

impl<'a> PageWriter<'a> {
    fn new(
        doc: &'a PdfDocumentReference,
        page: printpdf::PdfPageIndex,
        layer: printpdf::PdfLayerIndex,
        font: IndirectFontRef,
    ) -> Self {
        let layer_ref = doc.get_page(page).get_layer(layer);
        Self {
            doc,
            layer: layer_ref,
            font,
            y: PAGE_H_MM - MARGIN_MM,
        }
    }

    fn left(&self) -> f32 {
        MARGIN_MM
    }

    /// Move down by `mm` and ensure there's still room for one more row plus
    /// the footer. Adds a new page if not.
    fn advance(&mut self, mm: f32) {
        self.y -= mm;
        if self.y < MARGIN_MM + FOOTER_RESERVE_MM {
            self.new_page();
        }
    }

    fn new_page(&mut self) {
        let (page, layer) = self.doc.add_page(Mm(PAGE_W_MM), Mm(PAGE_H_MM), "Layer 1");
        self.layer = self.doc.get_page(page).get_layer(layer);
        self.y = PAGE_H_MM - MARGIN_MM;
    }

    fn text(&self, s: &str, size: f32, x: f32, y: f32) {
        self.layer.use_text(s, size, Mm(x), Mm(y), &self.font);
    }

    fn hline(&self, x1: f32, x2: f32, y: f32) {
        let line = Line {
            points: vec![
                (Point::new(Mm(x1), Mm(y)), false),
                (Point::new(Mm(x2), Mm(y)), false),
            ],
            is_closed: false,
        };
        self.layer.add_line(line);
    }

    fn draw_title(&mut self, title: &str) {
        self.text(title, 16.0, self.left(), self.y - 6.0);
        self.advance(11.0);
    }

    fn draw_subtitle(&mut self, subtitle: &str) {
        self.text(subtitle, 9.0, self.left(), self.y - 4.0);
        self.advance(8.0);
    }

    fn draw_summary_block(&mut self, view: &ResultView) {
        let lines: [(String, String); 5] = [
            (
                "원금".into(),
                format!("{}원", format_currency(view.principal)),
            ),
            (
                "이자 합계".into(),
                format!("{}원", format_currency(view.total_interest)),
            ),
            (
                "최종 합계".into(),
                format!("{}원", format_currency(view.grand_total)),
            ),
            ("데이터 버전".into(), view.data_version.clone()),
            ("옵션".into(), options_summary(&view.options)),
        ];
        let label_w = 30.0;
        for (label, value) in &lines {
            self.text(label, 10.0, self.left(), self.y - 4.0);
            self.text(value, 10.0, self.left() + label_w, self.y - 4.0);
            self.advance(5.6);
        }
        self.advance(2.0);
    }

    fn draw_inheritance_summary(&mut self, view: &InheritanceResultView) {
        let lines: [(String, String); 4] = [
            (
                "피상속인".into(),
                view.decedent.name.clone().unwrap_or_else(|| "-".into()),
            ),
            ("사망일".into(), view.decedent.deceased_at.clone()),
            ("데이터 버전".into(), view.data_version.clone()),
            ("상속인 수".into(), view.shares.len().to_string()),
        ];
        let label_w = 30.0;
        for (label, value) in &lines {
            self.text(label, 10.0, self.left(), self.y - 4.0);
            self.text(value, 10.0, self.left() + label_w, self.y - 4.0);
            self.advance(5.6);
        }
        self.advance(2.0);
    }

    fn draw_litigation_cost_summary(&mut self, view: &LitigationCostResultView) {
        let lines: [(String, String); 5] = [
            (
                "인지대".into(),
                format!("{}원", format_currency(view.stamp_duty.amount)),
            ),
            (
                "송달료".into(),
                format!("{}원", format_currency(view.delivery_fee.amount)),
            ),
            (
                "변호사보수".into(),
                format!("{}원", format_currency(view.lawyer_fee.amount)),
            ),
            (
                "합계".into(),
                format!("{}원", format_currency(view.total_amount)),
            ),
            ("계산 시각".into(), view.computed_at.clone()),
        ];
        let label_w = 32.0;
        for (label, value) in &lines {
            self.text(label, 10.0, self.left(), self.y - 4.0);
            self.text(value, 10.0, self.left() + label_w, self.y - 4.0);
            self.advance(5.6);
        }
        self.advance(2.0);

        let formulas = [
            ("인지대 산식", view.stamp_duty.formula_text.as_str()),
            ("송달료 산식", view.delivery_fee.formula_text.as_str()),
            ("변호사보수 산식", view.lawyer_fee.formula_text.as_str()),
        ];
        for (label, formula) in formulas {
            self.text(label, 8.5, self.left(), self.y - 3.5);
            self.advance(4.6);
            for line in wrap_text(formula, 78) {
                self.text(&line, 7.8, self.left() + 4.0, self.y - 3.0);
                self.advance(4.0);
            }
            self.advance(1.2);
        }
    }

    fn draw_segment_table(&mut self, view: &ResultView) {
        let inner_w: f32 = COL_WIDTHS.iter().sum();
        let right = self.left() + inner_w;

        // Header band.
        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        let headers = ["시작일", "종료일", "일수", "이율", "공식", "이자(원)"];
        let mut x = self.left();
        for (h, w) in headers.iter().zip(COL_WIDTHS.iter()) {
            self.text(h, 9.0, x + 1.0, self.y - 3.5);
            x += w;
        }
        self.advance(5.0);
        self.hline(self.left(), right, self.y);

        // Body rows.
        for seg in &view.segments {
            self.advance(5.4);
            // Wrap the formula column if needed, push extra row height.
            let formula_lines = wrap_text(&seg.formula, 36);
            let extra = (formula_lines.len() as f32 - 1.0).max(0.0) * 4.2;
            if extra > 0.0 {
                self.advance(extra);
            }
            let cells: [String; 6] = [
                seg.from.clone(),
                seg.to.clone(),
                seg.days.to_string(),
                format_rate_percent(seg.rate),
                String::new(), // drawn separately to allow multi-line
                format_currency(seg.interest),
            ];
            let mut x = self.left();
            for (cell, w) in cells.iter().zip(COL_WIDTHS.iter()) {
                if !cell.is_empty() {
                    self.text(cell, 8.5, x + 1.0, self.y - 1.0);
                }
                x += w;
            }
            // formula column
            let formula_x = self.left() + COL_WIDTHS[..4].iter().sum::<f32>() + 1.0;
            for (i, line) in formula_lines.iter().enumerate() {
                self.text(line, 8.0, formula_x, self.y - 1.0 - 4.2 * i as f32);
            }
        }

        // Total row.
        self.advance(5.4);
        self.hline(self.left(), right, self.y + 4.0);
        self.text("합계", 9.0, self.left() + 1.0, self.y - 1.0);
        let total_x = self.left() + COL_WIDTHS[..5].iter().sum::<f32>() + 1.0;
        self.text(
            &format_currency(view.total_interest),
            9.0,
            total_x,
            self.y - 1.0,
        );
        self.advance(2.0);
        self.hline(self.left(), right, self.y);
        self.advance(2.0);
    }

    fn draw_inheritance_table(&mut self, view: &InheritanceResultView) {
        let widths: [f32; 4] = [62.0, 34.0, 34.0, 36.0];
        let inner_w: f32 = widths.iter().sum();
        let right = self.left() + inner_w;

        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        let headers = ["상속인", "지분(약분)", "약분 전", "백분율(참고)"];
        let mut x = self.left();
        for (header, width) in headers.iter().zip(widths.iter()) {
            self.text(header, 9.0, x + 1.0, self.y - 3.5);
            x += width;
        }
        self.advance(5.0);
        self.hline(self.left(), right, self.y);

        for share in &view.shares {
            self.advance(5.4);
            let cells = [
                share.name.clone(),
                format!("{}/{}", share.numerator, share.denominator),
                format!("{}/{}", share.raw_numerator, share.raw_denominator),
                inheritance_percent(share.numerator, share.denominator),
            ];
            let mut x = self.left();
            for (cell, width) in cells.iter().zip(widths.iter()) {
                self.text(cell, 8.5, x + 1.0, self.y - 1.0);
                x += width;
            }
        }
        self.advance(2.0);
        self.hline(self.left(), right, self.y);
        self.advance(2.0);
    }

    fn draw_litigation_cost_distribution(&mut self, view: &LitigationCostResultView) {
        let Some(distribution) = &view.distribution else {
            return;
        };

        self.advance(3.0);
        self.text("분배표", 10.0, self.left(), self.y - 3.5);
        self.advance(6.0);
        self.text(
            &format!(
                "방식 {} · 잔여원 {}",
                distribution.mode, distribution.remainder
            ),
            8.5,
            self.left(),
            self.y - 3.0,
        );
        self.advance(5.0);

        let widths: [f32; 2] = [72.0, 52.0];
        let inner_w: f32 = widths.iter().sum();
        let right = self.left() + inner_w;
        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        self.text("당사자", 9.0, self.left() + 1.0, self.y - 3.5);
        self.text(
            "분배액(원)",
            9.0,
            self.left() + widths[0] + 1.0,
            self.y - 3.5,
        );
        self.advance(5.0);
        self.hline(self.left(), right, self.y);

        for (index, amount) in distribution.per_party.iter().enumerate() {
            self.advance(5.4);
            self.text(
                &format!("당사자 {}", index + 1),
                8.5,
                self.left() + 1.0,
                self.y - 1.0,
            );
            self.text(
                &format_currency(*amount as f64),
                8.5,
                self.left() + widths[0] + 1.0,
                self.y - 1.0,
            );
        }
        self.advance(2.0);
        self.hline(self.left(), right, self.y);
        self.advance(2.0);
    }

    fn draw_note(&mut self, note: &str) {
        self.advance(4.0);
        self.text("비고", 9.0, self.left(), self.y - 3.5);
        self.advance(5.0);
        for line in wrap_text(note, 60) {
            self.text(&line, 8.5, self.left(), self.y - 3.0);
            self.advance(4.5);
        }
    }

    fn draw_footer(&mut self, view: &ResultView) {
        // Footer is anchored above the bottom margin regardless of body height.
        let inner_right = PAGE_W_MM - MARGIN_MM;
        let footer_y = MARGIN_MM + 14.0;
        self.hline(self.left(), inner_right, footer_y);
        self.text(
            disclaimer_text(view.disclaimer.as_deref()),
            8.0,
            self.left(),
            footer_y - 4.0,
        );
        self.text(
            &format!(
                "데이터 버전 {}  |  계산 시각 {}",
                view.data_version, view.computed_at
            ),
            7.5,
            self.left(),
            footer_y - 9.0,
        );
    }

    fn draw_inheritance_footer(&mut self, view: &InheritanceResultView) {
        let inner_right = PAGE_W_MM - MARGIN_MM;
        let footer_y = MARGIN_MM + 14.0;
        self.hline(self.left(), inner_right, footer_y);
        self.text(
            disclaimer_text(Some(&view.disclaimer)),
            8.0,
            self.left(),
            footer_y - 4.0,
        );
        self.text(
            &format!(
                "데이터 버전 {}  |  계산 시각 {}",
                view.data_version, view.computed_at
            ),
            7.5,
            self.left(),
            footer_y - 9.0,
        );
    }

    fn draw_compensation_summary(&mut self, view: &CompensationResultView) {
        let lines: [(String, String); 8] = [
            (
                "중복 노동력상실률".into(),
                format!("{:.2}%", view.combined_loss_rate * 100.0),
            ),
            (
                "일실수입 소계".into(),
                format!("{}원", format_currency(view.lost_income_subtotal_won)),
            ),
            (
                "위자료".into(),
                format!("{}원", format_currency(view.solatium_won)),
            ),
            (
                "과실상계 대상 소계".into(),
                format!("{}원", format_currency(view.pecuniary_damages_subtotal_won)),
            ),
            (
                format!("과실상계 ({:.0}%)", view.fault_offset.ratio * 100.0),
                format!("{}원", format_currency(view.fault_offset.after_won)),
            ),
            (
                if view.deductions.industrial_benefit_won.is_some() {
                    "공제 (비율 + 전액 + 산재급여)".into()
                } else {
                    "공제 (비율 + 전액)".into()
                },
                match view.deductions.industrial_benefit_won {
                    Some(benefit) => format!(
                        "{}원 + {}원 + {}원",
                        format_currency(view.deductions.ratio_subtotal_won),
                        format_currency(view.deductions.absolute_subtotal_won),
                        format_currency(benefit)
                    ),
                    None => format!(
                        "{}원 + {}원",
                        format_currency(view.deductions.ratio_subtotal_won),
                        format_currency(view.deductions.absolute_subtotal_won)
                    ),
                },
            ),
            (
                "최종 합계".into(),
                format!("{}원", format_currency(view.final_won)),
            ),
            ("계산 시각".into(), view.computed_at.clone()),
        ];
        let label_w = 38.0;
        for (label, value) in &lines {
            self.text(label, 10.0, self.left(), self.y - 4.0);
            self.text(value, 10.0, self.left() + label_w, self.y - 4.0);
            self.advance(5.6);
        }
        self.advance(2.0);
    }

    /// 기타손해(개호비·치료비·보조구 + 소계) PDF 블록. `None` (미입력) 이면 한 줄도
    /// 그리지 않아 자동차/미입력 PDF 와 동일 (회귀 0). injury·death 공용.
    fn draw_compensation_other_damages(
        &mut self,
        other_damages: Option<&CompensationOtherDamagesView>,
    ) {
        let Some(other) = other_damages else {
            return;
        };
        let lines: [(String, String); 4] = [
            (
                "개호비".into(),
                format!("{}원", format_currency(other.attendant_care_won)),
            ),
            (
                "치료비".into(),
                format!("{}원", format_currency(other.treatment_won)),
            ),
            (
                "보조구".into(),
                format!("{}원", format_currency(other.appliance_won)),
            ),
            (
                "기타손해 소계".into(),
                format!("{}원", format_currency(other.subtotal_won)),
            ),
        ];
        let label_w = 38.0;
        for (label, value) in &lines {
            self.text(label, 10.0, self.left(), self.y - 4.0);
            self.text(value, 10.0, self.left() + label_w, self.y - 4.0);
            self.advance(5.6);
        }
        self.advance(2.0);
    }

    fn draw_compensation_segments_table(&mut self, view: &CompensationResultView) {
        let widths: [f32; 5] = [30.0, 22.0, 30.0, 36.0, 36.0];
        let inner_w: f32 = widths.iter().sum();
        let right = self.left() + inner_w;

        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        let headers = [
            "기간(개월)",
            "상실률",
            "단가(원/일)",
            "호프만(적용)",
            "금액(원)",
        ];
        let mut x = self.left();
        for (header, width) in headers.iter().zip(widths.iter()) {
            self.text(header, 9.0, x + 1.0, self.y - 3.5);
            x += width;
        }
        self.advance(5.0);
        self.hline(self.left(), right, self.y);

        for (i, segment) in view.segments.iter().enumerate() {
            self.advance(5.4);
            let cap_marker = if view.hoffman240_cap.capped_at_index == Some(i as i64) {
                " (한도)"
            } else {
                ""
            };
            let cells = [
                format!("{} ~ {}", segment.start_month, segment.end_month),
                format!("{:.2}%", segment.loss_rate * 100.0),
                format_currency(segment.daily_wage_won),
                format!("{:.6}{}", segment.applied_hoffman, cap_marker),
                format_currency(segment.amount_floor_won),
            ];
            let mut x = self.left();
            for (cell, width) in cells.iter().zip(widths.iter()) {
                self.text(cell, 8.5, x + 1.0, self.y - 1.0);
                x += width;
            }
        }

        self.advance(5.4);
        self.hline(self.left(), right, self.y + 4.0);
        self.text("일실수입 소계", 9.0, self.left() + 1.0, self.y - 1.0);
        let total_x = self.left() + widths[..4].iter().sum::<f32>() + 1.0;
        self.text(
            &format_currency(view.lost_income_subtotal_won),
            9.0,
            total_x,
            self.y - 1.0,
        );
        self.advance(2.0);
        self.hline(self.left(), right, self.y);
        self.advance(2.0);
    }

    fn draw_compensation_footer(&mut self, view: &CompensationResultView) {
        let inner_right = PAGE_W_MM - MARGIN_MM;
        let footer_y = MARGIN_MM + 14.0;
        self.hline(self.left(), inner_right, footer_y);
        self.text(
            disclaimer_text(Some(&view.disclaimer)),
            8.0,
            self.left(),
            footer_y - 4.0,
        );
        let versions = format!(
            "laborRates {} / lifeExpectancy {} / hoffman {} / leibniz {}",
            view.data_versions.labor_rates,
            view.data_versions.life_expectancy,
            view.data_versions.hoffman,
            view.data_versions.leibniz
        );
        self.text(
            &format!(
                "데이터 버전 {}  |  계산 시각 {}",
                versions, view.computed_at
            ),
            7.0,
            self.left(),
            footer_y - 9.0,
        );
    }

    fn draw_compensation_death_summary(&mut self, view: &CompensationDeathResultView) {
        let lines: [(String, String); 9] = [
            (
                "생계비 공제 비율".into(),
                format!("{:.2}%", view.living_cost_deduction_ratio * 100.0),
            ),
            (
                "일실수입 소계 (생계비 공제 후)".into(),
                format!("{}원", format_currency(view.lost_income_subtotal_won)),
            ),
            (
                "위자료".into(),
                format!("{}원", format_currency(view.solatium_won)),
            ),
            (
                "장례비".into(),
                format!("{}원", format_currency(view.funeral_expense_won)),
            ),
            (
                "과실상계 대상 소계".into(),
                format!("{}원", format_currency(view.pecuniary_damages_subtotal_won)),
            ),
            (
                format!("과실상계 ({:.0}%)", view.fault_offset.ratio * 100.0),
                format!("{}원", format_currency(view.fault_offset.after_won)),
            ),
            (
                if view.deductions.industrial_benefit_won.is_some() {
                    "공제 (비율 + 전액 + 산재급여)".into()
                } else {
                    "공제 (비율 + 전액)".into()
                },
                match view.deductions.industrial_benefit_won {
                    Some(benefit) => format!(
                        "{}원 + {}원 + {}원",
                        format_currency(view.deductions.ratio_subtotal_won),
                        format_currency(view.deductions.absolute_subtotal_won),
                        format_currency(benefit)
                    ),
                    None => format!(
                        "{}원 + {}원",
                        format_currency(view.deductions.ratio_subtotal_won),
                        format_currency(view.deductions.absolute_subtotal_won)
                    ),
                },
            ),
            (
                "최종 합계".into(),
                format!("{}원", format_currency(view.final_won)),
            ),
            ("계산 시각".into(), view.computed_at.clone()),
        ];
        let label_w = 46.0;
        for (label, value) in &lines {
            self.text(label, 10.0, self.left(), self.y - 4.0);
            self.text(value, 10.0, self.left() + label_w, self.y - 4.0);
            self.advance(5.6);
        }
        self.advance(2.0);
    }

    fn draw_compensation_death_segments_table(&mut self, view: &CompensationDeathResultView) {
        let widths: [f32; 4] = [34.0, 36.0, 40.0, 44.0];
        let inner_w: f32 = widths.iter().sum();
        let right = self.left() + inner_w;

        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        let headers = ["기간(개월)", "단가(원/일)", "호프만(적용)", "금액(원)"];
        let mut x = self.left();
        for (header, width) in headers.iter().zip(widths.iter()) {
            self.text(header, 9.0, x + 1.0, self.y - 3.5);
            x += width;
        }
        self.advance(5.0);
        self.hline(self.left(), right, self.y);

        for (i, segment) in view.segments.iter().enumerate() {
            self.advance(5.4);
            let cap_marker = if view.hoffman240_cap.capped_at_index == Some(i as i64) {
                " (한도)"
            } else {
                ""
            };
            let cells = [
                format!("{} ~ {}", segment.start_month, segment.end_month),
                format_currency(segment.daily_wage_won),
                format!("{:.6}{}", segment.applied_hoffman, cap_marker),
                format_currency(segment.amount_floor_won),
            ];
            let mut x = self.left();
            for (cell, width) in cells.iter().zip(widths.iter()) {
                self.text(cell, 8.5, x + 1.0, self.y - 1.0);
                x += width;
            }
        }

        self.advance(5.4);
        self.hline(self.left(), right, self.y + 4.0);
        self.text(
            "일실수입 소계 (생계비 공제 후)",
            9.0,
            self.left() + 1.0,
            self.y - 1.0,
        );
        let total_x = self.left() + widths[..3].iter().sum::<f32>() + 1.0;
        self.text(
            &format_currency(view.lost_income_subtotal_won),
            9.0,
            total_x,
            self.y - 1.0,
        );
        self.advance(2.0);
        self.hline(self.left(), right, self.y);
        self.advance(2.0);
    }

    fn draw_compensation_death_inheritance_table(&mut self, view: &CompensationDeathResultView) {
        let Some(shares) = view.inheritance_shares.as_ref() else {
            return;
        };
        if shares.is_empty() {
            return;
        }
        let widths: [f32; 3] = [60.0, 40.0, 54.0];
        let inner_w: f32 = widths.iter().sum();
        let right = self.left() + inner_w;

        self.advance(2.0);
        self.text("상속인별 분배", 10.0, self.left(), self.y - 4.0);
        self.advance(5.6);
        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        let headers = ["상속인", "지분(약분)", "배정 금액(원)"];
        let mut x = self.left();
        for (header, width) in headers.iter().zip(widths.iter()) {
            self.text(header, 9.0, x + 1.0, self.y - 3.5);
            x += width;
        }
        self.advance(5.0);
        self.hline(self.left(), right, self.y);

        for share in shares {
            self.advance(5.4);
            let cells = [
                share.name.clone(),
                format!("{}/{}", share.numerator, share.denominator),
                format_currency(share.amount_won),
            ];
            let mut x = self.left();
            for (cell, width) in cells.iter().zip(widths.iter()) {
                self.text(cell, 8.5, x + 1.0, self.y - 1.0);
                x += width;
            }
        }
        self.advance(5.4);
        self.hline(self.left(), right, self.y);
        self.advance(2.0);
    }

    fn draw_compensation_death_footer(&mut self, view: &CompensationDeathResultView) {
        let inner_right = PAGE_W_MM - MARGIN_MM;
        let footer_y = MARGIN_MM + 14.0;
        self.hline(self.left(), inner_right, footer_y);
        self.text(
            disclaimer_text(Some(&view.disclaimer)),
            8.0,
            self.left(),
            footer_y - 4.0,
        );
        let versions = format!(
            "laborRates {} / lifeExpectancy {} / hoffman {} / leibniz {}",
            view.data_versions.labor_rates,
            view.data_versions.life_expectancy,
            view.data_versions.hoffman,
            view.data_versions.leibniz
        );
        self.text(
            &format!(
                "데이터 버전 {}  |  계산 시각 {}",
                versions, view.computed_at
            ),
            7.0,
            self.left(),
            footer_y - 9.0,
        );
    }

    fn draw_litigation_cost_footer(&mut self, view: &LitigationCostResultView) {
        let inner_right = PAGE_W_MM - MARGIN_MM;
        let footer_y = MARGIN_MM + 14.0;
        self.hline(self.left(), inner_right, footer_y);
        self.text(
            disclaimer_text(Some(&view.disclaimer)),
            8.0,
            self.left(),
            footer_y - 4.0,
        );
        let versions = view
            .data_versions
            .iter()
            .map(|(key, value)| format!("{key}: {value}"))
            .collect::<Vec<_>>()
            .join(" / ");
        self.text(
            &format!(
                "데이터 버전 {}  |  계산 시각 {}",
                versions, view.computed_at
            ),
            7.0,
            self.left(),
            footer_y - 9.0,
        );
    }
}

fn inheritance_percent(numerator: i64, denominator: i64) -> String {
    if denominator == 0 {
        return "-".to_string();
    }
    format!("{:.2}%", (numerator as f64 / denominator as f64) * 100.0)
}

/// Conservative width-aware text wrap. We don't have access to font metrics
/// at render time without pulling in a separate shaping crate, so we wrap by
/// character count using a width tuned to Pretendard at 8.5pt in our table.
fn wrap_text(text: &str, max_chars: usize) -> Vec<String> {
    if text.is_empty() {
        return vec![String::new()];
    }
    let mut lines = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut start = 0usize;
    while start < chars.len() {
        let end = (start + max_chars).min(chars.len());
        let mut split = end;
        if end < chars.len() {
            // Prefer to break on ASCII whitespace/operators inside the window.
            if let Some(pos) = chars[start..end]
                .iter()
                .rposition(|c| matches!(c, ' ' | ',' | '×' | '/' | '+' | '-'))
            {
                split = start + pos + 1;
            }
        }
        let line: String = chars[start..split].iter().collect();
        lines.push(line.trim().to_string());
        start = split;
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::result_view::{
        CompensationDataVersionsView, CompensationDeductionsView, CompensationFaultOffsetView,
        CompensationHoffman240CapView, CompensationInheritanceShareView, CompensationSegmentView,
        InheritanceDecedentView, InheritanceShareView, OptionsView, SegmentView, DISCLAIMER_KO,
    };

    fn sample() -> ResultView {
        ResultView {
            principal: 10_000_000.0,
            segments: vec![SegmentView {
                from: "2024-01-01".into(),
                to: "2024-12-31".into(),
                days: 366,
                rate: 0.05,
                formula: "10,000,000 × 0.05 × 366 / 366".into(),
                interest: 500_000.0,
            }],
            total_interest: 500_000.0,
            grand_total: 10_500_000.0,
            options: OptionsView {
                mode: "period".into(),
                leap_year: "actual".into(),
                include_first_day: false,
                rounding: None,
            },
            data_version: "legal-rates/v1.0.0".into(),
            computed_at: "2026-05-09T12:00:00+09:00".into(),
            disclaimer: Some(DISCLAIMER_KO.into()),
        }
    }

    fn inheritance_sample() -> InheritanceResultView {
        InheritanceResultView {
            decedent: InheritanceDecedentView {
                name: Some("피상속인".into()),
                deceased_at: "2025-01-01".into(),
            },
            shares: vec![
                InheritanceShareView {
                    name: "배우자".into(),
                    numerator: 3,
                    denominator: 7,
                    raw_numerator: 3,
                    raw_denominator: 7,
                },
                InheritanceShareView {
                    name: "자녀1".into(),
                    numerator: 2,
                    denominator: 7,
                    raw_numerator: 2,
                    raw_denominator: 7,
                },
            ],
            disclaimer: DISCLAIMER_KO.into(),
            data_version: "inheritance/v1.0.0".into(),
            computed_at: "2026-05-09T12:00:00+09:00".into(),
        }
    }

    #[test]
    fn produces_pdf_with_pdf_header() {
        let bytes = render_pdf_bytes(&sample(), &PdfOptions::default()).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
        assert!(
            bytes.len() > 1500,
            "pdf suspiciously small: {}",
            bytes.len()
        );
    }

    #[test]
    fn note_is_optional() {
        let opts = PdfOptions {
            note: Some("연체 가능성 검토".into()),
        };
        let bytes = render_pdf_bytes(&sample(), &opts).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn wrap_text_breaks_on_operators() {
        let lines = wrap_text("10,000,000 × 0.05 × 100 / 365", 12);
        assert!(lines.len() >= 2, "expected wrap, got {:?}", lines);
    }

    #[test]
    fn wrap_text_handles_empty() {
        assert_eq!(wrap_text("", 10), vec![String::new()]);
    }

    /// Empty segments must still produce a valid PDF (header + footer only).
    /// Mirrors the CSV edge case so the user never sees a blank/error state
    /// when the calculation produced no interest segments.
    #[test]
    fn empty_segments_renders_pdf() {
        let mut view = sample();
        view.segments.clear();
        view.total_interest = 0.0;
        view.grand_total = view.principal;
        let bytes = render_pdf_bytes(&view, &PdfOptions::default()).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
        assert!(
            bytes.len() > 1500,
            "pdf suspiciously small: {}",
            bytes.len()
        );
    }

    #[test]
    fn inheritance_result_renders_pdf() {
        let bytes = render_inheritance_pdf_bytes(&inheritance_sample()).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
        assert!(
            bytes.len() > 1500,
            "pdf suspiciously small: {}",
            bytes.len()
        );
    }

    fn compensation_sample() -> CompensationResultView {
        CompensationResultView {
            combined_loss_rate: 0.3,
            segments: vec![CompensationSegmentView {
                start_month: 0,
                end_month: 360,
                loss_rate: 0.3,
                daily_wage_won: 172_068.0,
                applied_hoffman: 219.610067,
                amount_floor_won: 249_399_909.0,
            }],
            lost_income_subtotal_won: 249_399_909.0,
            solatium_won: 0.0,
            pecuniary_damages_subtotal_won: 249_399_909.0,
            fault_offset: CompensationFaultOffsetView {
                ratio: 0.0,
                after_won: 249_399_909.0,
            },
            deductions: CompensationDeductionsView {
                ratio_subtotal_won: 0.0,
                absolute_subtotal_won: 0.0,
                industrial_benefit_won: None,
            },
            final_won: 249_399_900.0,
            other_damages: None,
            hoffman240_cap: CompensationHoffman240CapView {
                applied_hoffman: vec![219.610067],
                capped_at_index: None,
            },
            data_versions: CompensationDataVersionsView {
                labor_rates: "labor-rates/v1.0.0".into(),
                life_expectancy: "life-expectancy/v1.0.0".into(),
                hoffman: "hoffman/v1.0.0".into(),
                leibniz: "leibniz/v1.0.0".into(),
            },
            disclaimer: DISCLAIMER_KO.into(),
            computed_at: "2026-05-18T12:00:00+09:00".into(),
        }
    }

    #[test]
    fn compensation_result_renders_pdf() {
        let bytes = render_compensation_pdf_bytes(&compensation_sample()).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
        assert!(
            bytes.len() > 1500,
            "pdf suspiciously small: {}",
            bytes.len()
        );
    }

    #[test]
    fn compensation_result_renders_pdf_with_other_damages() {
        let mut view = compensation_sample();
        view.other_damages = Some(CompensationOtherDamagesView {
            attendant_care_won: 120_000_000.0,
            treatment_won: 30_000_000.0,
            appliance_won: 5_000_000.0,
            subtotal_won: 155_000_000.0,
        });
        let bytes = render_compensation_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
    }

    fn compensation_death_sample() -> CompensationDeathResultView {
        CompensationDeathResultView {
            living_cost_deduction_ratio: 1.0 / 3.0,
            segments: vec![CompensationSegmentView {
                start_month: 0,
                end_month: 360,
                loss_rate: 1.0,
                daily_wage_won: 172_068.0,
                applied_hoffman: 219.610067,
                amount_floor_won: 554_222_020.0,
            }],
            lost_income_subtotal_won: 554_222_020.0,
            solatium_won: 80_000_000.0,
            pecuniary_damages_subtotal_won: 634_222_020.0,
            fault_offset: CompensationFaultOffsetView {
                ratio: 0.0,
                after_won: 634_222_020.0,
            },
            funeral_expense_won: 5_000_000.0,
            deductions: CompensationDeductionsView {
                ratio_subtotal_won: 0.0,
                absolute_subtotal_won: 0.0,
                industrial_benefit_won: None,
            },
            final_won: 639_222_000.0,
            other_damages: None,
            inheritance_shares: Some(vec![
                CompensationInheritanceShareView {
                    name: "배우자".into(),
                    numerator: 3,
                    denominator: 7,
                    amount_won: 273_952_286.0,
                },
                CompensationInheritanceShareView {
                    name: "자녀1".into(),
                    numerator: 2,
                    denominator: 7,
                    amount_won: 182_634_857.0,
                },
            ]),
            hoffman240_cap: CompensationHoffman240CapView {
                applied_hoffman: vec![219.610067],
                capped_at_index: None,
            },
            data_versions: CompensationDataVersionsView {
                labor_rates: "labor-rates/v1.0.0".into(),
                life_expectancy: "life-expectancy/v1.0.0".into(),
                hoffman: "hoffman/v1.0.0".into(),
                leibniz: "leibniz/v1.0.0".into(),
            },
            disclaimer: DISCLAIMER_KO.into(),
            computed_at: "2026-06-02T12:00:00+09:00".into(),
        }
    }

    #[test]
    fn compensation_death_result_renders_pdf() {
        let bytes =
            render_compensation_death_pdf_bytes(&compensation_death_sample()).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
        assert!(
            bytes.len() > 1500,
            "pdf suspiciously small: {}",
            bytes.len()
        );
    }

    #[test]
    fn compensation_death_result_renders_pdf_without_heirs() {
        let mut view = compensation_death_sample();
        view.inheritance_shares = None;
        let bytes = render_compensation_death_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
    }

    #[test]
    fn compensation_death_result_renders_pdf_with_other_damages() {
        let mut view = compensation_death_sample();
        view.other_damages = Some(CompensationOtherDamagesView {
            attendant_care_won: 120_000_000.0,
            treatment_won: 30_000_000.0,
            appliance_won: 5_000_000.0,
            subtotal_won: 155_000_000.0,
        });
        let bytes = render_compensation_death_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
    }

    /// Manual visual check: writes a sample PDF to `/tmp/lawcalc-sample.pdf`
    /// so a developer can open it locally. Excluded from the default suite
    /// so CI/cargo test stays hermetic; run with
    /// `cargo test -- --ignored dump_sample_pdf`.
    #[test]
    #[ignore]
    fn dump_sample_pdf() {
        let view = ResultView {
            principal: 10_000_000.0,
            segments: vec![
                SegmentView {
                    from: "2024-01-01".into(),
                    to: "2024-12-31".into(),
                    days: 366,
                    rate: 0.05,
                    formula: "10,000,000 × 0.05 × 366 / 366".into(),
                    interest: 500_000.0,
                },
                SegmentView {
                    from: "2025-01-01".into(),
                    to: "2025-06-30".into(),
                    days: 181,
                    rate: 0.12,
                    formula: "10,000,000 × 0.12 × 181 / 365".into(),
                    interest: 595_068.0,
                },
            ],
            total_interest: 1_095_068.0,
            grand_total: 11_095_068.0,
            options: OptionsView {
                mode: "period".into(),
                leap_year: "actual".into(),
                include_first_day: false,
                rounding: None,
            },
            data_version: "legal-rates/v1.0.0".into(),
            computed_at: "2026-05-09T12:00:00+09:00".into(),
            disclaimer: Some(DISCLAIMER_KO.into()),
        };
        let opts = PdfOptions {
            note: Some("샘플 비고: 한글 렌더링 검증".into()),
        };
        let bytes = render_pdf_bytes(&view, &opts).expect("render pdf");
        std::fs::write("/tmp/lawcalc-sample.pdf", &bytes).expect("write sample pdf");
        eprintln!("wrote /tmp/lawcalc-sample.pdf ({} bytes)", bytes.len());
    }
}
