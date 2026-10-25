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
    compensation_deduction_rows, disclaimer_text, format_currency, format_rate_percent,
    heir_excess_dropped_row, heir_rounding_row, industrial_benefit_value_text, options_summary,
    segment_wage_header, segment_wage_text, segments_have_dates, segments_have_living_cost,
    shares_have_claimant_breakdown, shares_have_survivor_benefit, CompensationDeathResultView,
    CompensationDeductionsView, CompensationDelayDamagesView, CompensationDocumentTextView,
    CompensationOtherDamagesView, CompensationResultView, InheritanceResultView,
    LitigationCostResultView, ResultView, LIVING_COST_AFTER_LIFE_NOTE,
};
use super::result_view::{AppropriationExportView, ExportTableView};

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
const COL_WIDTHS: [f32; 8] = [
    20.0, // 시작일
    20.0, // 종료일
    11.0, // 일수
    12.0, // 이율
    23.0, // 원금
    41.0, // 공식
    23.0, // 이자
    24.0, // 이자 누계
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
    writer.draw_export_warnings(&view.export_warnings);
    writer.draw_litigation_cost_footer(view);

    let bytes = doc
        .save_to_bytes()
        .map_err(|e| Error::Other(format!("PDF 저장 실패: {e}")))?;
    Ok(bytes)
}

#[tauri::command]
pub async fn export_appropriation_pdf(
    app: AppHandle,
    result: Value,
) -> Result<Option<String>, Error> {
    let view: AppropriationExportView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .set_file_name("appropriation-calculation.pdf")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_appropriation_pdf_bytes(&view)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

pub fn render_appropriation_pdf_bytes(view: &AppropriationExportView) -> Result<Vec<u8>, Error> {
    let title = "LawCalc Korea 변제충당 계산서";
    let (doc, page1, layer1) = PdfDocument::new(title, Mm(PAGE_W_MM), Mm(PAGE_H_MM), "Layer 1");

    let font = doc
        .add_external_font_with_subsetting(PRETENDARD_REGULAR, true)
        .map_err(|e| Error::Other(format!("PDF 한글 폰트 임베딩 실패: {e}")))?;
    let _builtin_helvetica = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| Error::Other(format!("PDF 내장 폰트 등록 실패: {e}")))?;

    let mut writer = PageWriter::new(&doc, page1, layer1, font);
    writer.draw_title(title);
    writer.draw_subtitle(&format!("계산 시각  {}", view.computed_at));
    writer.draw_summary_lines(&view.summary, 45.0);
    let inner_w = PAGE_W_MM - 2.0 * MARGIN_MM;
    for table in &view.tables {
        let widths = fit_column_widths(&natural_column_widths(table), inner_w);
        let headers: Vec<&str> = table.headers.iter().map(String::as_str).collect();
        writer.draw_simple_table(&table.title, &headers, &widths, &table.rows);
    }
    writer.draw_export_warnings(&view.notes);
    writer.draw_appropriation_footer(view);

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
    writer.draw_wrapped_block("기대여명", std::slice::from_ref(&view.life_expectancy_text));
    writer.draw_compensation_other_damages(view.other_damages.as_ref());
    writer.draw_export_warnings(&view.export_warnings);
    writer.draw_compensation_segments_table(view);
    writer.draw_compensation_claimants_table(view);
    writer.draw_delay_damages(view.delay_damages.as_ref());
    writer.draw_document_texts(&view.document_texts);
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
    writer.draw_wrapped_block("기대여명", std::slice::from_ref(&view.life_expectancy_text));
    writer.draw_compensation_other_damages(view.other_damages.as_ref());
    writer.draw_export_warnings(&view.export_warnings);
    writer.draw_compensation_death_segments_table(view);
    writer.draw_compensation_death_inheritance_table(view);
    writer.draw_delay_damages(view.delay_damages.as_ref());
    writer.draw_document_texts(&view.document_texts);
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
        let mut lines: Vec<(String, String)> = vec![
            (
                "피상속인".into(),
                view.decedent.name.clone().unwrap_or_else(|| "-".into()),
            ),
            ("사망일".into(), view.decedent.deceased_at.clone()),
            ("데이터 버전".into(), view.data_version.clone()),
            ("상속인 수".into(), view.shares.len().to_string()),
        ];
        if let Some(estate) = view.estate_won {
            lines.push(("상속재산".into(), format!("{}원", format_currency(estate))));
            lines.push((
                "끝수".into(),
                format!(
                    "{}원 (원 미만 내림, 배정하지 않음)",
                    format_currency(view.remainder_won.unwrap_or(0.0))
                ),
            ));
        }
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
        let headers = [
            "시작일",
            "종료일",
            "일수",
            "이율",
            "원금(원)",
            "공식",
            "이자(원)",
            "이자 누계(원)",
        ];
        let mut x = self.left();
        for (h, w) in headers.iter().zip(COL_WIDTHS.iter()) {
            self.text(h, 9.0, x + 1.0, self.y - 3.5);
            x += w;
        }
        self.advance(5.0);
        self.hline(self.left(), right, self.y);

        // Body rows. 구 VK 이자 화면처럼 행마다 원금과 이자 누계를 싣는다 (마지막 누계 = 합계).
        let mut cumulative = 0.0;
        for seg in &view.segments {
            cumulative += seg.interest;
            self.advance(5.4);
            // Wrap the formula column if needed, push extra row height.
            let formula_lines = wrap_text(&seg.formula, 19);
            let extra = (formula_lines.len() as f32 - 1.0).max(0.0) * 4.2;
            if extra > 0.0 {
                self.advance(extra);
            }
            let cells: [String; 8] = [
                seg.from.clone(),
                seg.to.clone(),
                seg.days.to_string(),
                format_rate_percent(seg.rate),
                format_currency(view.principal),
                String::new(), // drawn separately to allow multi-line
                format_currency(seg.interest),
                format_currency(cumulative),
            ];
            let mut x = self.left();
            for (cell, w) in cells.iter().zip(COL_WIDTHS.iter()) {
                if !cell.is_empty() {
                    self.text(cell, 8.5, x + 1.0, self.y - 1.0);
                }
                x += w;
            }
            // formula column
            let formula_x = self.left() + COL_WIDTHS[..5].iter().sum::<f32>() + 1.0;
            for (i, line) in formula_lines.iter().enumerate() {
                self.text(line, 8.0, formula_x, self.y - 1.0 - 4.2 * i as f32);
            }
        }

        // Total row.
        self.advance(5.4);
        self.hline(self.left(), right, self.y + 4.0);
        self.text("합계", 9.0, self.left() + 1.0, self.y - 1.0);
        let total_x = self.left() + COL_WIDTHS[..6].iter().sum::<f32>() + 1.0;
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
        let has_amount = view.estate_won.is_some();
        let widths: Vec<f32> = if has_amount {
            vec![46.0, 26.0, 26.0, 28.0, 40.0]
        } else {
            vec![62.0, 34.0, 34.0, 36.0]
        };
        let inner_w: f32 = widths.iter().sum();
        let right = self.left() + inner_w;

        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        let mut headers = vec!["상속인", "지분(약분)", "약분 전", "백분율(참고)"];
        if has_amount {
            headers.push("금액(원)");
        }
        let mut x = self.left();
        for (header, width) in headers.iter().zip(widths.iter()) {
            self.text(header, 9.0, x + 1.0, self.y - 3.5);
            x += width;
        }
        self.advance(5.0);
        self.hline(self.left(), right, self.y);

        for share in &view.shares {
            self.advance(5.4);
            let mut cells = vec![
                share.name.clone(),
                format!("{}/{}", share.numerator, share.denominator),
                format!("{}/{}", share.raw_numerator, share.raw_denominator),
                inheritance_percent(share.numerator, share.denominator),
            ];
            if has_amount {
                cells.push(format_currency(share.amount_won.unwrap_or(0.0)));
            }
            let mut x = self.left();
            for (cell, width) in cells.iter().zip(widths.iter()) {
                self.text(cell, 8.5, x + 1.0, self.y - 1.0);
                x += width;
            }
        }
        self.advance(2.0);
        self.hline(self.left(), right, self.y);
        self.advance(2.0);

        if has_amount {
            let total = view
                .shares
                .iter()
                .map(|s| s.amount_won.unwrap_or(0.0))
                .sum::<f64>()
                + view.remainder_won.unwrap_or(0.0);
            self.advance(4.0);
            self.text(
                &format!("합계 (금액 합 + 끝수) {}원", format_currency(total)),
                8.5,
                self.left() + 1.0,
                self.y - 1.0,
            );
            self.advance(2.0);
        }

        if !view.trace.is_empty() {
            self.advance(4.0);
            self.text("전개식", 10.0, self.left(), self.y - 3.5);
            self.advance(6.0);
            for (i, line) in view.trace.iter().enumerate() {
                for (j, part) in wrap_text(line, 78).iter().enumerate() {
                    let text = if j == 0 {
                        format!("{}. {}", i + 1, part)
                    } else {
                        format!("   {part}")
                    };
                    self.text(&text, 7.8, self.left() + 1.0, self.y - 3.0);
                    self.advance(4.0);
                }
            }
        }
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

    /// 요약 행 목록. 그리기와 분리해 테스트가 행 구성을 직접 확인할 수 있게 한다.
    fn compensation_summary_lines(view: &CompensationResultView) -> Vec<(String, String)> {
        let mut lines: Vec<(String, String)> =
            Self::labor_rate_timing_line(&view.labor_rate_timing_text);
        if !view.court_truncation_text.is_empty() {
            lines.push(("절사".into(), view.court_truncation_text.clone()));
        }
        lines.extend([
            (
                "중복 노동능력상실률".into(),
                format!("{:.2}%", view.combined_loss_rate * 100.0),
            ),
            (
                "일실수입 소계".into(),
                format!("{}원", format_currency(view.lost_income_subtotal_won)),
            ),
        ]);
        // 산재보험급여 (장해급여) — 일실수입 한도 선공제 (2021다241618 전합).
        if let Some(ib) = &view.industrial_benefit {
            lines.push((
                "산재급여 공제 (장해급여·휴업급여)".into(),
                industrial_benefit_value_text(ib),
            ));
            lines.push((
                "공제 후 일실수입".into(),
                format!("{}원", format_currency(ib.lost_income_after_won)),
            ));
        }
        lines.extend(Self::lost_retirement_line(
            view.lost_retirement_subtotal_won,
        ));
        lines.extend([
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
        ]);
        lines.extend(Self::deduction_lines(
            &view.deductions,
            view.property_only_excess_won,
        ));
        if view.deduction_excess_won > 0.0 {
            lines.push(("공제 후 재산상 손해".into(), "0원".into()));
            lines.push((
                view.deduction_excess_label.clone(),
                format!("{}원", format_currency(-view.deduction_excess_won)),
            ));
        }
        if let Some((label, won)) = heir_excess_dropped_row(&view.deductions) {
            lines.push((label.into(), format!("{}원", format_currency(won))));
        }
        if view.solatium_added_won > 0.0 {
            lines.push((
                "위자료 가산".into(),
                format!("{}원", format_currency(view.solatium_added_won)),
            ));
        }
        if let Some((label, won)) = heir_rounding_row(&view.deductions) {
            lines.push((label.into(), format!("{}원", format_currency(won))));
        }
        lines.extend([
            (
                "최종 합계".into(),
                format!("{}원", format_currency(view.final_won)),
            ),
            ("계산 시각".into(), view.computed_at.clone()),
        ]);
        lines
    }

    /// "일실퇴직금" 줄. 입력하지 않은 결과는 줄을 내지 않는다.
    fn lost_retirement_line(won: Option<f64>) -> Vec<(String, String)> {
        match won {
            Some(won) => vec![("일실퇴직금".into(), format!("{}원", format_currency(won)))],
            None => Vec::new(),
        }
    }

    /// 제목 + 줄바꿈한 문단. 빈 문단은 건너뛰고, 모두 비면 아무것도 그리지 않는다.
    fn draw_wrapped_block(&mut self, title: &str, texts: &[String]) {
        if texts.iter().all(|t| t.is_empty()) {
            return;
        }
        self.text(title, 10.0, self.left(), self.y - 4.0);
        self.advance(5.6);
        for text in texts.iter().filter(|t| !t.is_empty()) {
            for line in wrap_text(text, 72) {
                self.text(&line, 8.5, self.left() + 3.0, self.y - 4.0);
                self.advance(4.6);
            }
        }
        self.advance(2.0);
    }

    /// 표 한 행. 셀마다 열 폭에 맞춰 줄바꿈하고, 가장 긴 셀의 줄 수만큼 행을 높인다. 행이
    /// 쪽 하단(면책 고지 자리)을 넘으면 행 전체를 다음 쪽으로 넘긴다.
    fn draw_wrapped_row(&mut self, cells: &[String], widths: &[f32], height: f32, baseline: f32) {
        let lines: Vec<Vec<String>> = cells
            .iter()
            .zip(widths.iter())
            .map(|(cell, width)| wrap_to_width(cell, width - TABLE_CELL_PAD_MM, TABLE_FONT_PT))
            .collect();
        let extra = (lines.iter().map(Vec::len).max().unwrap_or(1).max(1) - 1) as f32 * 4.2;
        if self.y - height - extra < MARGIN_MM + FOOTER_RESERVE_MM {
            self.new_page();
        }
        self.y -= height + extra;
        let top = self.y + extra - baseline;
        let mut x = self.left();
        for (cell_lines, width) in lines.iter().zip(widths.iter()) {
            for (i, line) in cell_lines.iter().enumerate() {
                self.text(line, TABLE_FONT_PT, x + 1.0, top - 4.2 * i as f32);
            }
            x += width;
        }
    }

    /// 제목 있는 단순 표 (원고별 표·지연손해금 표).
    fn draw_simple_table(
        &mut self,
        title: &str,
        headers: &[&str],
        widths: &[f32],
        rows: &[Vec<String>],
    ) {
        let right = self.left() + widths.iter().sum::<f32>();
        self.advance(2.0);
        self.text(title, 10.0, self.left(), self.y - 4.0);
        self.advance(5.6);
        self.hline(self.left(), right, self.y);
        // 열 폭을 넘는 셀은 줄바꿈하고 그 행을 줄 수만큼 높인다 (머리글 포함).
        let header_cells: Vec<String> = headers.iter().map(|h| h.to_string()).collect();
        self.draw_wrapped_row(&header_cells, widths, 5.0, 3.5);
        self.advance(5.0);
        self.hline(self.left(), right, self.y);
        for row in rows {
            self.draw_wrapped_row(row, widths, 5.4, 1.0);
        }
        self.advance(5.4);
        self.hline(self.left(), right, self.y);
        self.advance(2.0);
    }

    /// 원고별 최종액 표 (부상 `claimants` 결과에만).
    fn draw_compensation_claimants_table(&mut self, view: &CompensationResultView) {
        let Some(claimants) = view.claimants.as_ref() else {
            return;
        };
        let rows: Vec<Vec<String>> = claimants
            .iter()
            .map(|c| {
                vec![
                    c.label(),
                    format_currency(c.solatium_won),
                    format_currency(c.amount_won),
                ]
            })
            .collect();
        self.draw_simple_table(
            "원고별 최종액",
            &["원고", "위자료(원)", "최종액(원)"],
            &[70.0, 50.0, 54.0],
            &rows,
        );
    }

    /// 지연손해금 표 + 주문 문구 (화면에서 계산했을 때만).
    fn draw_delay_damages(&mut self, delay: Option<&CompensationDelayDamagesView>) {
        let Some(delay) = delay else {
            return;
        };
        if delay.rows.is_empty() {
            return;
        }
        let rows: Vec<Vec<String>> = delay
            .rows
            .iter()
            .map(|r| {
                vec![
                    r.label.clone(),
                    format_currency(r.principal_won),
                    format_currency(r.interest_won),
                    format_currency(r.total_won),
                ]
            })
            .collect();
        self.draw_simple_table(
            "지연손해금 (손해배상액과 별도)",
            &["원고", "원금(원)", "지연손해금(원)", "원리금(원)"],
            &[50.0, 40.0, 42.0, 42.0],
            &rows,
        );
        let mut texts = vec![delay.basis_text.clone()];
        texts.extend(
            delay
                .rows
                .iter()
                .map(|r| format!("주문: {}", r.order_line())),
        );
        self.draw_wrapped_block("판결 주문형 문구", &texts);
    }

    /// 조정안·판결 이유 형식 문단 (화면에서 만들었을 때만). 탭 칸은 " | " 로 잇는다.
    fn draw_document_texts(&mut self, blocks: &[CompensationDocumentTextView]) {
        for block in blocks {
            let lines: Vec<String> = block.lines.iter().map(|l| l.replace('\t', " | ")).collect();
            self.draw_wrapped_block(&block.title, &lines);
        }
    }

    /// "노임 기준" 줄 (계산 기준일·규약). 값이 없는 구 payload 는 줄을 내지 않는다.
    fn labor_rate_timing_line(text: &str) -> Vec<(String, String)> {
        if text.is_empty() {
            Vec::new()
        } else {
            vec![("노임 기준".into(), text.to_string())]
        }
    }

    /// 공제 행 (`compensation_deduction_rows`). 구 결과의 산재보험급여(≤ v0.9.x)는 뒤에 붙인다.
    fn deduction_lines(
        deductions: &CompensationDeductionsView,
        property_only_excess_won: f64,
    ) -> Vec<(String, String)> {
        let mut lines: Vec<(String, String)> =
            compensation_deduction_rows(deductions, property_only_excess_won)
                .into_iter()
                .map(|(label, won)| (label.to_string(), format!("{}원", format_currency(won))))
                .collect();
        if let Some(benefit) = deductions.industrial_benefit_won {
            lines.push((
                "산재보험급여 공제 (구 방식)".into(),
                format!("{}원", format_currency(benefit)),
            ));
        }
        lines
    }

    /// 요약 (라벨, 값) 줄. 라벨이 값 열까지 넘치면 값을 다음 줄에 쓴다.
    fn draw_summary_lines(&mut self, lines: &[(String, String)], label_w: f32) {
        for (label, value) in lines {
            self.text(label, 10.0, self.left(), self.y - 4.0);
            // 10pt 한글 한 글자 ≈ 3.6mm.
            if label.chars().count() as f32 * 3.6 > label_w - 2.0 {
                self.advance(5.6);
            }
            self.text(value, 10.0, self.left() + label_w, self.y - 4.0);
            self.advance(5.6);
        }
        self.advance(2.0);
    }

    fn draw_compensation_summary(&mut self, view: &CompensationResultView) {
        let lines = Self::compensation_summary_lines(view);
        self.draw_summary_lines(&lines, 38.0);
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

    /// 사용자 경고 문구 블록 (상한 적용·분할 의심·구조공단 적용 범위 등).
    ///
    /// 문구는 frontend 가 단일 출처에서 만들어 넘긴다. 여기서 다시 만들지 않으므로 경고가
    /// 늘어도 화면·클립보드·PDF·CSV 가 저절로 같은 목록을 낸다. 실무에서 최종 산출물이 되는
    /// PDF 산출근거에서 "금액이 잘렸다" 는 사실이 빠지지 않게 한다.
    fn draw_export_warnings(&mut self, warnings: &[String]) {
        if warnings.is_empty() {
            return;
        }
        self.text("확인이 필요한 사항", 10.0, self.left(), self.y - 4.0);
        self.advance(5.6);
        for warning in warnings {
            for line in wrap_text(warning, 72) {
                self.text(&line, 8.5, self.left() + 3.0, self.y - 4.0);
                self.advance(4.6);
            }
        }
        self.advance(2.0);
    }

    fn draw_compensation_segments_table(&mut self, view: &CompensationResultView) {
        // 계산 기준일을 넣은 결과는 기간 뒤에 초일·말일 열을 둔다.
        let dated = segments_have_dates(&view.segments);
        let living_cost = segments_have_living_cost(&view.segments);
        let widths: Vec<f32> = if dated {
            vec![20.0, 22.0, 22.0, 16.0, 24.0, 26.0, 30.0]
        } else {
            vec![30.0, 22.0, 30.0, 36.0, 36.0]
        };
        let inner_w: f32 = widths.iter().sum();
        let right = self.left() + inner_w;

        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        let mut headers = vec!["기간(개월)"];
        if dated {
            headers.extend(["초일", "말일"]);
        }
        headers.extend([
            "상실률",
            segment_wage_header(&view.segments),
            "호프만(적용)",
            "금액(원)",
        ]);
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
            // 기대여명 이후 생계비 공제 구간은 기간 뒤에 * 를 붙이고 표 아래 각주로 설명한다.
            let mark = if segment.living_cost_deducted == Some(true) {
                "*"
            } else {
                ""
            };
            let mut cells = vec![format!(
                "{} ~ {}{}",
                segment.start_month, segment.end_month, mark
            )];
            if dated {
                cells.push(segment.start_date.clone().unwrap_or_default());
                cells.push(segment.end_date.clone().unwrap_or_default());
            }
            cells.extend([
                format!("{:.2}%", segment.loss_rate * 100.0),
                segment_wage_text(segment),
                format!("{:.6}{}", segment.applied_hoffman, cap_marker),
                format_currency(segment.amount_floor_won),
            ]);
            let mut x = self.left();
            for (cell, width) in cells.iter().zip(widths.iter()) {
                self.text(cell, 8.5, x + 1.0, self.y - 1.0);
                x += width;
            }
        }

        self.advance(5.4);
        self.hline(self.left(), right, self.y + 4.0);
        self.text("일실수입 소계", 9.0, self.left() + 1.0, self.y - 1.0);
        let total_x = self.left() + widths[..widths.len() - 1].iter().sum::<f32>() + 1.0;
        self.text(
            &format_currency(view.lost_income_subtotal_won),
            9.0,
            total_x,
            self.y - 1.0,
        );
        self.advance(2.0);
        self.hline(self.left(), right, self.y);
        self.advance(2.0);
        if living_cost {
            for line in wrap_text(LIVING_COST_AFTER_LIFE_NOTE, 72) {
                self.text(&line, 8.0, self.left(), self.y - 3.5);
                self.advance(4.6);
            }
        }
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

    /// 요약 행 목록. 그리기와 분리해 테스트가 행 구성을 직접 확인할 수 있게 한다.
    fn compensation_death_summary_lines(
        view: &CompensationDeathResultView,
    ) -> Vec<(String, String)> {
        let mut lines: Vec<(String, String)> =
            Self::labor_rate_timing_line(&view.labor_rate_timing_text);
        if !view.court_truncation_text.is_empty() {
            lines.push(("절사".into(), view.court_truncation_text.clone()));
        }
        lines.extend([
            (
                "생계비 공제 비율".into(),
                format!("{:.2}%", view.living_cost_deduction_ratio * 100.0),
            ),
            (
                "일실수입 소계 (생계비 공제 후)".into(),
                format!("{}원", format_currency(view.lost_income_subtotal_won)),
            ),
        ]);
        // 산재보험급여 (유족급여) — 일실수입 한도 선공제 (2021다241618 전합).
        if let Some(ib) = &view.industrial_benefit {
            lines.push((
                "산재급여 공제 (유족급여)".into(),
                industrial_benefit_value_text(ib),
            ));
            lines.push((
                "공제 후 일실수입".into(),
                format!("{}원", format_currency(ib.lost_income_after_won)),
            ));
        }
        lines.extend(Self::lost_retirement_line(
            view.lost_retirement_subtotal_won,
        ));
        lines.extend([
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
        ]);
        lines.extend(Self::deduction_lines(
            &view.deductions,
            view.property_only_excess_won,
        ));
        if view.deduction_excess_won > 0.0 {
            lines.push((
                "공제 후 재산상 손해".into(),
                format!("{}원", format_currency(view.deduction_remain_won)),
            ));
            lines.push((
                view.deduction_excess_label.clone(),
                format!("{}원", format_currency(-view.deduction_excess_won)),
            ));
        }
        if let Some((label, won)) = heir_excess_dropped_row(&view.deductions) {
            lines.push((label.into(), format!("{}원", format_currency(won))));
        }
        if view.solatium_added_won > 0.0 {
            lines.push((
                "위자료 가산".into(),
                format!("{}원", format_currency(view.solatium_added_won)),
            ));
        }
        if let Some((label, won)) = heir_rounding_row(&view.deductions) {
            lines.push((label.into(), format!("{}원", format_currency(won))));
        }
        if let Some(estate) = view.estate_won {
            lines.push((
                "상속대상 금액".into(),
                format!("{}원", format_currency(estate)),
            ));
        }
        lines.extend([
            (
                "최종 합계".into(),
                format!("{}원", format_currency(view.final_won)),
            ),
            ("계산 시각".into(), view.computed_at.clone()),
        ]);
        lines
    }

    fn draw_compensation_death_summary(&mut self, view: &CompensationDeathResultView) {
        let lines = Self::compensation_death_summary_lines(view);
        self.draw_summary_lines(&lines, 46.0);
    }

    fn draw_compensation_death_segments_table(&mut self, view: &CompensationDeathResultView) {
        let dated = segments_have_dates(&view.segments);
        let widths: Vec<f32> = if dated {
            vec![22.0, 24.0, 24.0, 26.0, 30.0, 34.0]
        } else {
            vec![34.0, 36.0, 40.0, 44.0]
        };
        let inner_w: f32 = widths.iter().sum();
        let right = self.left() + inner_w;

        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        let mut headers = vec!["기간(개월)"];
        if dated {
            headers.extend(["초일", "말일"]);
        }
        headers.extend([
            segment_wage_header(&view.segments),
            "호프만(적용)",
            "금액(원)",
        ]);
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
            let mut cells = vec![format!("{} ~ {}", segment.start_month, segment.end_month)];
            if dated {
                cells.push(segment.start_date.clone().unwrap_or_default());
                cells.push(segment.end_date.clone().unwrap_or_default());
            }
            cells.extend([
                segment_wage_text(segment),
                format!("{:.6}{}", segment.applied_hoffman, cap_marker),
                format_currency(segment.amount_floor_won),
            ]);
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
        let total_x = self.left() + widths[..widths.len() - 1].iter().sum::<f32>() + 1.0;
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
        // 수급권자별 유족급여 결과는 상속인별 공제액 열을 더한다 (2008다13104 전합).
        let survivor = shares_have_survivor_benefit(shares);
        if shares_have_claimant_breakdown(shares) {
            let benefit = shares
                .iter()
                .any(|s| s.funeral_benefit_deducted_won.is_some());
            let mut headers = vec!["원고", "지분"];
            let mut widths = vec![22.0, 12.0];
            if survivor {
                headers.push("유족급여 공제");
                widths.push(18.0);
            }
            headers.extend(["상속 재산상", "상속 위자료", "고유 위자료", "장례비"]);
            widths.extend([22.0, 20.0, 20.0, 18.0]);
            if benefit {
                headers.push("장의비 공제");
                widths.push(18.0);
            }
            headers.push("최종액(원)");
            widths.push(22.0);
            let mut rows: Vec<Vec<String>> = shares
                .iter()
                .map(|s| {
                    let mut row =
                        vec![s.name.clone(), format!("{}/{}", s.numerator, s.denominator)];
                    if survivor {
                        row.push(format_currency(
                            s.survivor_benefit_deducted_won.unwrap_or(0.0),
                        ));
                    }
                    row.extend([
                        format_currency(s.inherited_pecuniary_won.unwrap_or(0.0)),
                        format_currency(s.inherited_solatium_won.unwrap_or(0.0)),
                        format_currency(s.own_solatium_won.unwrap_or(0.0)),
                        format_currency(s.funeral_won.unwrap_or(0.0)),
                    ]);
                    if benefit {
                        row.push(format_currency(
                            -s.funeral_benefit_deducted_won.unwrap_or(0.0),
                        ));
                    }
                    row.push(format_currency(s.amount_won));
                    row
                })
                .collect();
            // 상속인이 아닌 유족: 고유 위자료만 있다 (나머지 칸은 "-").
            for o in view.other_claimants.iter().flatten() {
                let mut row = vec![format!("{} (상속인 아님)", o.name), "-".to_string()];
                if survivor {
                    row.push("-".into());
                }
                row.extend([
                    "-".into(),
                    "-".into(),
                    format_currency(o.solatium_won),
                    "-".into(),
                ]);
                if benefit {
                    row.push("-".into());
                }
                row.push(format_currency(o.amount_won));
                rows.push(row);
            }
            self.draw_simple_table("원고별 귀속", &headers, &widths, &rows);
            return;
        }
        let widths: Vec<f32> = if survivor {
            vec![50.0, 30.0, 40.0, 44.0]
        } else {
            vec![60.0, 40.0, 54.0]
        };
        let inner_w: f32 = widths.iter().sum();
        let right = self.left() + inner_w;

        self.advance(2.0);
        self.text("상속인별 분배", 10.0, self.left(), self.y - 4.0);
        self.advance(5.6);
        self.hline(self.left(), right, self.y);
        self.advance(5.0);
        let headers: Vec<&str> = if survivor {
            vec!["상속인", "지분(약분)", "유족급여 공제(원)", "배정 금액(원)"]
        } else {
            vec!["상속인", "지분(약분)", "배정 금액(원)"]
        };
        let mut x = self.left();
        for (header, width) in headers.iter().zip(widths.iter()) {
            self.text(header, 9.0, x + 1.0, self.y - 3.5);
            x += width;
        }
        self.advance(5.0);
        self.hline(self.left(), right, self.y);

        for share in shares {
            self.advance(5.4);
            let mut cells = vec![
                share.name.clone(),
                format!("{}/{}", share.numerator, share.denominator),
            ];
            if survivor {
                cells.push(format_currency(
                    share.survivor_benefit_deducted_won.unwrap_or(0.0),
                ));
            }
            cells.push(format_currency(share.amount_won));
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

    fn draw_appropriation_footer(&mut self, view: &AppropriationExportView) {
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

/// 표 셀 글자 크기 (pt) 와 셀 좌우 여백 합 (mm).
const TABLE_FONT_PT: f32 = 8.5;
const TABLE_CELL_PAD_MM: f32 = 2.0;

/// 글자 폭 추정 (mm). 폰트 메트릭 없이 보수적으로 한글·전각은 1.0em, 그 밖은 0.6em 으로 잡는다.
// ponytail: 글자별 고정 em, 실제 Pretendard 메트릭이 필요해지면 글리프 폭 표를 쓴다.
fn estimate_text_width_mm(text: &str, size_pt: f32) -> f32 {
    let em: f32 = text
        .chars()
        .map(|c| if (c as u32) >= 0x1100 { 1.0 } else { 0.6 })
        .sum();
    em * size_pt * 0.3528
}

/// 폭(mm)에 맞춰 줄바꿈. 공백·`/` 뒤에서 끊기를 우선하고(금액 안 `,` 에서는 끊지 않는다),
/// 없으면 글자 단위로 끊는다.
fn wrap_to_width(text: &str, width_mm: f32, size_pt: f32) -> Vec<String> {
    let fits = |s: &str| estimate_text_width_mm(s, size_pt) <= width_mm;
    let mut lines = Vec::new();
    let mut line = String::new();
    for c in text.chars() {
        let mut candidate = line.clone();
        candidate.push(c);
        if !line.is_empty() && !fits(&candidate) {
            let rest = match line.rfind([' ', '/']) {
                Some(i) if i + 1 < line.len() => line.split_off(i + 1),
                _ => String::new(),
            };
            lines.push(line.trim_end().to_string());
            line = rest.trim_start().to_string();
            if !line.is_empty() && !fits(&format!("{line}{c}")) {
                lines.push(std::mem::take(&mut line));
            }
        }
        if !(line.is_empty() && c == ' ') {
            line.push(c);
        }
    }
    lines.push(line);
    lines
}

/// 열마다 (한 줄에 다 쓸 때 폭, 끊을 수 없는 가장 긴 토막 폭). 둘 다 여백 포함.
fn natural_column_widths(table: &ExportTableView) -> Vec<(f32, f32)> {
    let width = |t: &str| estimate_text_width_mm(t, TABLE_FONT_PT) + TABLE_CELL_PAD_MM;
    (0..table.headers.len())
        .map(|i| {
            std::iter::once(&table.headers[i])
                .chain(table.rows.iter().filter_map(|r| r.get(i)))
                .fold((0.0f32, 0.0f32), |(full, token), t| {
                    let longest = t.split([' ', '/']).map(width).fold(0.0f32, f32::max);
                    (full.max(width(t)), token.max(longest))
                })
        })
        .collect()
}

/// 전체 폭에 열 폭을 나눈다. 다 들어가면 비례로 늘린다. 넘치면 한 줄 폭에 비례해 줄이되
/// 끊을 수 없는 토막(금액·날짜)보다 좁히지 않는다. 그래도 넘치면 글자 단위로 끊긴다.
fn fit_column_widths(natural: &[(f32, f32)], total: f32) -> Vec<f32> {
    let sum: f32 = natural.iter().map(|n| n.0).sum();
    if sum <= 0.0 {
        return vec![total / natural.len().max(1) as f32; natural.len()];
    }
    if sum <= total {
        return natural.iter().map(|n| n.0 * total / sum).collect();
    }
    // 토막 하한은 균등 몫까지만 (아주 긴 토막 하나가 다른 열을 밀어내지 않게).
    let even = total / natural.len() as f32;
    let natural: Vec<(f32, f32)> = natural.iter().map(|&(f, t)| (f, t.min(even))).collect();
    let mut fixed = vec![false; natural.len()];
    loop {
        let (used, open): (f32, f32) =
            natural
                .iter()
                .zip(&fixed)
                .fold((0.0, 0.0), |(used, open), (n, &f)| {
                    if f {
                        (used + n.1, open)
                    } else {
                        (used, open + n.0)
                    }
                });
        let k = if open > 0.0 {
            (total - used) / open
        } else {
            0.0
        };
        let mut changed = false;
        for (i, n) in natural.iter().enumerate() {
            if !fixed[i] && n.0 * k < n.1 {
                fixed[i] = true;
                changed = true;
            }
        }
        if !changed {
            return natural
                .iter()
                .zip(&fixed)
                .map(|(n, &f)| if f { n.1 } else { n.0 * k })
                .collect();
        }
    }
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
                    amount_won: None,
                },
                InheritanceShareView {
                    name: "자녀1".into(),
                    numerator: 2,
                    denominator: 7,
                    raw_numerator: 2,
                    raw_denominator: 7,
                    amount_won: None,
                },
            ],
            disclaimer: DISCLAIMER_KO.into(),
            data_version: "inheritance/v1.0.0".into(),
            computed_at: "2026-05-09T12:00:00+09:00".into(),
            estate_won: None,
            remainder_won: None,
            trace: vec![],
        }
    }

    #[test]
    fn inheritance_pdf_renders_amounts_and_long_trace() {
        let mut view = inheritance_sample();
        view.estate_won = Some(100_000_000.0);
        view.remainder_won = Some(2.0);
        view.shares[0].amount_won = Some(42_857_142.0);
        view.shares[1].amount_won = Some(57_142_856.0);
        // 페이지를 넘기는 길이의 전개식도 그린다.
        view.trace = (0..120)
            .map(|i| format!("{i}: 순위 결정 1순위 직계비속 상속 (민법 제1000조 제1항 제1호)"))
            .collect();
        let bytes = render_inheritance_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"));
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
    fn appropriation_result_renders_pdf() {
        let view = appropriation_sample();
        let bytes = render_appropriation_pdf_bytes(&view).expect("render");
        assert!(bytes.starts_with(b"%PDF-"));
    }

    /// 변제별 충당 표의 긴 셀(충당 순위 문구·금액 묶음)이 옆 열을 덮지 않는다.
    #[test]
    fn appropriation_table_cells_fit_their_columns() {
        let mut view = appropriation_sample();
        view.tables[0].headers = [
            "변제일",
            "구분",
            "채권",
            "충당 순위",
            "새 이자",
            "충당 (비용/이자/원본)",
            "잔액 (이자/원본)",
        ]
        .map(String::from)
        .to_vec();
        view.tables[0].rows.push(
            [
                "2025-03-31",
                "상계 1,234,567,890원",
                "아주긴채권이름이들어간대여금채권2021년약정분",
                "상계 잉여 법정충당 1순위 (변제기 도래, 변제이익 순위 0)",
                "123,456,789원",
                "1,234,567원 / 123,456,789원 / 1,234,567,890원",
                "123,456,789원 / 1,234,567,890원",
            ]
            .map(String::from)
            .to_vec(),
        );
        let inner_w = PAGE_W_MM - 2.0 * MARGIN_MM;
        for table in &view.tables {
            let widths = fit_column_widths(&natural_column_widths(table), inner_w);
            assert!(
                (widths.iter().sum::<f32>() - inner_w).abs() < 0.01,
                "{widths:?}"
            );
            for row in std::iter::once(&table.headers).chain(table.rows.iter()) {
                for (cell, width) in row.iter().zip(&widths) {
                    let lines = wrap_to_width(cell, width - TABLE_CELL_PAD_MM, TABLE_FONT_PT);
                    assert_eq!(lines.concat().replace(' ', ""), cell.replace(' ', ""));
                    for line in &lines {
                        let w = estimate_text_width_mm(line, TABLE_FONT_PT);
                        assert!(
                            w <= width - TABLE_CELL_PAD_MM,
                            "{line:?} {w}mm > column {width}mm"
                        );
                    }
                }
            }
        }
        let bytes = render_appropriation_pdf_bytes(&view).expect("render");
        assert!(bytes.starts_with(b"%PDF-"));
    }

    pub(crate) fn appropriation_sample() -> AppropriationExportView {
        serde_json::from_value(serde_json::json!({
            "summary": [["변제 합계", "3,000,000원"], ["충당 합계", "3,000,000원"]],
            "tables": [{
                "title": "변제별 충당",
                "headers": ["변제일", "구분", "채권", "새 이자", "이자 충당", "원본 충당", "원본 잔액"],
                "rows": [["2025-03-31", "변제", "대여금", "295,890", "295,890", "704,110", "9,295,890"]]
            }],
            "notes": ["약정이율 연 30% 가 최고이자율 연 20% 를 넘어 연 20% 로 계산했습니다."],
            "disclaimer": "",
            "dataVersion": "appropriation/policy-v1",
            "computedAt": "2026-10-25"
        }))
        .expect("sample")
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
                start_date: None,
                end_date: None,
                loss_rate: 0.3,
                daily_wage_won: 172_068.0,
                applied_hoffman: 219.610067,
                amount_floor_won: 249_399_909.0,
                living_cost_deducted: None,
                wage_basis: None,
                monthly_wage_won: None,
            }],
            lost_income_subtotal_won: 249_399_909.0,
            solatium_won: 0.0,
            industrial_benefit: None,
            pecuniary_damages_subtotal_won: 249_399_909.0,
            fault_offset: CompensationFaultOffsetView {
                ratio: 0.0,
                after_won: 249_399_909.0,
            },
            deductions: CompensationDeductionsView {
                ratio_subtotal_won: 0.0,
                paid_treatment_subtotal_won: None,
                legacy_ratio_subtotal_won: None,
                property_only_applied_won: None,
                property_only_discarded_won: None,
                solatium_reduced_won: None,
                absolute_excess_dropped_won: None,
                rounding_won: None,
                absolute_subtotal_won: 0.0,
                industrial_benefit_won: None,
            },
            final_won: 249_399_900.0,
            other_damages: None,
            hoffman240_cap: CompensationHoffman240CapView {
                applied_hoffman: vec![219.610067],
                capped_at_index: None,
            },
            export_warnings: Vec::new(),
            solatium_added_won: 0.0,
            deduction_excess_won: 0.0,
            deduction_excess_label: String::new(),
            property_only_excess_won: 0.0,
            labor_rate_timing_text: String::new(),
            court_truncation_text: String::new(),
            lost_retirement_subtotal_won: None,
            life_expectancy_text: String::new(),
            claimants: None,
            delay_damages: None,
            document_texts: Vec::new(),
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
                start_date: None,
                end_date: None,
                loss_rate: 1.0,
                daily_wage_won: 172_068.0,
                applied_hoffman: 219.610067,
                amount_floor_won: 554_222_020.0,
                living_cost_deducted: None,
                wage_basis: None,
                monthly_wage_won: None,
            }],
            lost_income_subtotal_won: 554_222_020.0,
            solatium_won: 80_000_000.0,
            industrial_benefit: None,
            pecuniary_damages_subtotal_won: 634_222_020.0,
            fault_offset: CompensationFaultOffsetView {
                ratio: 0.0,
                after_won: 634_222_020.0,
            },
            funeral_expense_won: 5_000_000.0,
            deductions: CompensationDeductionsView {
                ratio_subtotal_won: 0.0,
                paid_treatment_subtotal_won: None,
                legacy_ratio_subtotal_won: None,
                property_only_applied_won: None,
                property_only_discarded_won: None,
                solatium_reduced_won: None,
                absolute_excess_dropped_won: None,
                rounding_won: None,
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
                    survivor_benefit_deducted_won: None,
                    inherited_pecuniary_won: None,
                    inherited_solatium_won: None,
                    own_solatium_won: None,
                    funeral_won: None,
                    funeral_benefit_deducted_won: None,
                },
                CompensationInheritanceShareView {
                    name: "자녀1".into(),
                    numerator: 2,
                    denominator: 7,
                    amount_won: 182_634_857.0,
                    survivor_benefit_deducted_won: None,
                    inherited_pecuniary_won: None,
                    inherited_solatium_won: None,
                    own_solatium_won: None,
                    funeral_won: None,
                    funeral_benefit_deducted_won: None,
                },
            ]),
            hoffman240_cap: CompensationHoffman240CapView {
                applied_hoffman: vec![219.610067],
                capped_at_index: None,
            },
            export_warnings: Vec::new(),
            solatium_added_won: 0.0,
            deduction_excess_won: 0.0,
            deduction_excess_label: String::new(),
            property_only_excess_won: 0.0,
            labor_rate_timing_text: String::new(),
            court_truncation_text: String::new(),
            lost_retirement_subtotal_won: None,
            life_expectancy_text: String::new(),
            estate_won: None,
            other_claimants: None,
            deduction_remain_won: 0.0,
            delay_damages: None,
            document_texts: Vec::new(),
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

    /// "위자료 가산" 행은 0 보다 클 때만, 공제 행 바로 뒤·최종 합계 바로 앞에 온다.
    #[test]
    fn compensation_pdf_renders_extra_rows_and_tables() {
        let mut view = compensation_sample();
        let labels = |lines: &[(String, String)]| -> Vec<String> {
            lines.iter().map(|(l, _)| l.clone()).collect()
        };
        assert!(!labels(&PageWriter::compensation_summary_lines(&view))
            .contains(&"일실퇴직금".to_string()));
        view.lost_retirement_subtotal_won = Some(12_345_678.0);
        view.life_expectancy_text = "기준일 2022-03-01 만 31세 · 최종 여명종료일 2032-02-28".into();
        view.segments[0].living_cost_deducted = Some(true);
        view.claimants = Some(vec![
            crate::commands::result_view::CompensationClaimantView {
                role: "victim".into(),
                name: None,
                solatium_won: 1.0,
                amount_won: 2.0,
            },
        ]);
        view.delay_damages = Some(crate::commands::result_view::CompensationDelayDamagesView {
            basis_text: "기산일 2022-03-01".into(),
            rows: vec![
                crate::commands::result_view::CompensationDelayDamagesRowView {
                    label: "피해자 본인".into(),
                    principal_won: 2.0,
                    interest_won: 1.0,
                    total_won: 3.0,
                    order_text: "2원 및 이에 대하여".into(),
                },
            ],
        });
        assert!(labels(&PageWriter::compensation_summary_lines(&view))
            .contains(&"일실퇴직금".to_string()));
        view.document_texts = vec![CompensationDocumentTextView {
            title: "조정안 형식".into(),
            lines: vec!["1. 기초 사항".into(), "1\t2010. 1. 1. ~\t1원".into()],
        }];
        let bytes = render_compensation_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF"));

        let mut death = compensation_death_sample();
        death.court_truncation_text =
            "법원 계산 프로그램 방식 (누적 호프만 소수 4자리 버림)".into();
        death.estate_won = Some(10.0);
        if let Some(shares) = death.inheritance_shares.as_mut() {
            shares[0].inherited_pecuniary_won = Some(1.0);
            shares[0].funeral_benefit_deducted_won = Some(1.0);
        }
        let death_labels = labels(&PageWriter::compensation_death_summary_lines(&death));
        assert!(death_labels.contains(&"절사".to_string()));
        assert!(death_labels.contains(&"상속대상 금액".to_string()));
        let bytes = render_compensation_death_pdf_bytes(&death).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF"));
    }

    #[test]
    fn compensation_summary_lines_place_solatium_added_row() {
        fn labels(lines: &[(String, String)]) -> Vec<&str> {
            lines.iter().map(|(label, _)| label.as_str()).collect()
        }
        let mut view = compensation_sample();
        assert!(!labels(&PageWriter::compensation_summary_lines(&view)).contains(&"위자료 가산"));
        view.solatium_added_won = 30_000_000.0;
        let lines = PageWriter::compensation_summary_lines(&view);
        let at = labels(&lines)
            .iter()
            .position(|l| *l == "위자료 가산")
            .expect("row");
        assert_eq!(lines[at].1, "30,000,000원");
        assert_eq!(lines[at - 1].0, "전액공제 소계");
        assert_eq!(lines[at + 1].0, "최종 합계");
        let bytes = render_compensation_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");

        let mut death = compensation_death_sample();
        assert!(
            !labels(&PageWriter::compensation_death_summary_lines(&death)).contains(&"위자료 가산")
        );
        death.solatium_added_won = 80_000_000.0;
        let lines = PageWriter::compensation_death_summary_lines(&death);
        let at = labels(&lines)
            .iter()
            .position(|l| *l == "위자료 가산")
            .expect("row");
        assert_eq!(lines[at].1, "80,000,000원");
        assert_eq!(lines[at - 1].0, "전액공제 소계");
        assert_eq!(lines[at + 1].0, "최종 합계");
        let bytes = render_compensation_death_pdf_bytes(&death).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
    }

    #[test]
    fn compensation_summary_lines_place_deduction_excess_rows() {
        let mut view = compensation_death_sample();
        view.solatium_added_won = 3_000_000.0;
        view.deduction_excess_won = 3_000_000.0;
        view.deduction_excess_label =
            "공제 초과분 (위자료에서 차감, 남은 2,000,000원은 최종액 0원 하한으로 차감하지 않음)"
                .into();
        let lines = PageWriter::compensation_death_summary_lines(&view);
        let at = lines
            .iter()
            .position(|(label, _)| label == "공제 후 재산상 손해")
            .expect("zero row");
        assert_eq!(lines[at].1, "0원");
        assert!(lines[at + 1]
            .0
            .starts_with("공제 초과분 (위자료에서 차감, 남은 2,000,000원"));
        assert_eq!(lines[at + 1].1, "-3,000,000원");
        assert_eq!(lines[at + 2].0, "위자료 가산");
        let bytes = render_compensation_death_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
        // 사망 총액 계산은 공제가 깎지 않는 장례비 손해가 "공제 후 재산상 손해" 로 남는다.
        view.deduction_remain_won = 5_000_000.0;
        let lines = PageWriter::compensation_death_summary_lines(&view);
        assert!(lines
            .iter()
            .any(|(label, value)| label == "공제 후 재산상 손해" && value == "5,000,000원"));
    }

    #[test]
    fn compensation_death_pdf_renders_other_claimant_rows() {
        let mut view = compensation_death_sample();
        if let Some(shares) = view.inheritance_shares.as_mut() {
            for share in shares.iter_mut() {
                share.inherited_pecuniary_won = Some(100.0);
            }
        }
        view.other_claimants = Some(vec![
            super::super::result_view::CompensationDeathOtherClaimantView {
                name: "망인의 모".into(),
                solatium_won: 3_000_000.0,
                amount_won: 3_000_000.0,
            },
        ]);
        let bytes = render_compensation_death_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
    }

    #[test]
    fn compensation_summary_lines_list_r2a_deduction_rows() {
        let mut view = compensation_sample();
        view.deductions.paid_treatment_subtotal_won = Some(300.0);
        view.deductions.legacy_ratio_subtotal_won = Some(50.0);
        view.property_only_excess_won = 120.0;
        view.solatium_added_won = 1_000.0;
        let lines = PageWriter::compensation_summary_lines(&view);
        let labels: Vec<&str> = lines.iter().map(|(label, _)| label.as_str()).collect();
        let at = labels
            .iter()
            .position(|l| *l == "비율공제 소계")
            .expect("ratio row");
        assert_eq!(
            labels[at..at + 6],
            [
                "비율공제 소계",
                "지급치료비 공제 소계",
                "이전 방식 비율공제 소계",
                "전액공제 소계",
                "비율공제·지급치료비 중 재산상 손해 초과분 (위자료에서 빼지 않음)",
                "위자료 가산",
            ]
        );
        assert_eq!(lines[at + 4].1, "120원");
        let bytes = render_compensation_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
    }

    #[test]
    fn compensation_summary_lines_lead_with_labor_rate_timing_when_present() {
        let mut view = compensation_sample();
        assert_ne!(
            PageWriter::compensation_summary_lines(&view)[0].0,
            "노임 기준"
        );
        view.labor_rate_timing_text =
            "계산 기준일 2026-10-04 · 노임 적용일 규약 조사 시점 (5/1·9/1)".into();
        let lines = PageWriter::compensation_summary_lines(&view);
        assert_eq!(lines[0].0, "노임 기준");
        assert_ne!(lines[1].0, "절사");
        view.court_truncation_text = "법원 계산 프로그램 방식".into();
        assert_eq!(PageWriter::compensation_summary_lines(&view)[1].0, "절사");
        let mut death = compensation_death_sample();
        death.labor_rate_timing_text = view.labor_rate_timing_text.clone();
        assert_eq!(
            PageWriter::compensation_death_summary_lines(&death)[0].0,
            "노임 기준"
        );
        let bytes = render_compensation_death_pdf_bytes(&death).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
    }

    #[test]
    fn compensation_death_summary_lines_place_heir_settlement_rows() {
        let mut death = compensation_death_sample();
        death.solatium_added_won = 100_000_000.0;
        death.deductions.absolute_excess_dropped_won = Some(500.0);
        death.deductions.rounding_won = Some(82.0);
        let lines = PageWriter::compensation_death_summary_lines(&death);
        let at = lines
            .iter()
            .position(|(label, _)| label == "위자료 가산")
            .expect("added row");
        assert!(lines[at - 1].0.starts_with("전액공제 초과분 중 위자료로도"));
        assert_eq!(lines[at - 1].1, "500원");
        assert_eq!(lines[at + 1].0, "상속분 나눗셈·상속인별 100원 미만 버림");
        assert_eq!(lines[at + 1].1, "-82원");
        assert_eq!(lines[at + 2].0, "최종 합계");
    }

    /// 초일·말일 열과 상속인별 유족급여 공제 열이 있어도 PDF 가 그려진다.
    #[test]
    fn compensation_pdf_renders_dated_segments_and_survivor_column() {
        let mut view = compensation_sample();
        view.segments[0].start_date = Some("2020-01-01".into());
        view.segments[0].end_date = Some("2049-12-31".into());
        let bytes = render_compensation_pdf_bytes(&view).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");

        let mut death = compensation_death_sample();
        death.segments[0].start_date = Some("2020-01-01".into());
        death.segments[0].end_date = Some("2049-12-31".into());
        if let Some(shares) = death.inheritance_shares.as_mut() {
            shares[0].survivor_benefit_deducted_won = Some(150_000_000.0);
        }
        let bytes = render_compensation_death_pdf_bytes(&death).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF-"), "missing PDF header");
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
