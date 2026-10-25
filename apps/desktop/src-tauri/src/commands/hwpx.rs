//! HWPX (OWPML) 내보내기.
//!
//! 내용은 같은 view 구조체로 만든 CSV 행을 그대로 옮긴다. 그래서 PDF·CSV 와 같은 항목
//! (요약·표·경고·조정안/판결 이유 문단·면책 고지)이 빠짐없이 들어가고, 도메인이 늘어도
//! 여기서 따로 만들 문구가 없다. 칸이 둘 이상인 행이 이어지면 표 하나, 칸이 하나뿐인 행은 문단이 된다.
//!
//! ponytail: 레이아웃은 CSV 행 구조를 따르는 단순형이다. PDF 처럼 도메인별 배치가 필요해지면
//! 그때 블록을 직접 만드는 렌더러로 바꾼다. 한글에서 여는 화면은 이 저장소 안에서 확인하지 못했다.

use std::io::{Cursor, Write};
use std::path::PathBuf;

use serde_json::Value;
use tauri::{async_runtime, AppHandle};
use tauri_plugin_dialog::DialogExt;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::error::Error;

use super::csv::{
    render_appropriation_csv_bytes, render_compensation_csv_bytes,
    render_compensation_death_csv_bytes, render_csv_bytes, render_inheritance_csv_bytes,
    render_litigation_cost_csv_bytes,
};
use super::result_view::{
    AppropriationExportView, CompensationDeathResultView, CompensationResultView,
    InheritanceResultView, LitigationCostResultView, ResultView,
};

#[derive(Debug, PartialEq)]
pub enum Block {
    Para(String),
    Table(Vec<Vec<String>>),
}

/// `kind` 별 view 를 읽어 (문서 제목, 기본 파일 이름, CSV 행) 을 만든다.
fn csv_for_kind(kind: &str, result: Value) -> Result<(&'static str, &'static str, Vec<u8>), Error> {
    Ok(match kind {
        "interest" => (
            "LawCalc Korea 이자 계산서",
            "calculation.hwpx",
            render_csv_bytes(&serde_json::from_value::<ResultView>(result)?)?,
        ),
        "inheritance" => (
            "LawCalc Korea 상속분 간이 계산서",
            "inheritance-calculation.hwpx",
            render_inheritance_csv_bytes(&serde_json::from_value::<InheritanceResultView>(
                result,
            )?)?,
        ),
        "litigation-cost" => (
            "LawCalc Korea 소송비용 계산서",
            "litigation-cost-calculation.hwpx",
            render_litigation_cost_csv_bytes(&serde_json::from_value::<LitigationCostResultView>(
                result,
            )?)?,
        ),
        "compensation" => (
            "LawCalc Korea 부상 손해배상 계산서",
            "compensation-calculation.hwpx",
            render_compensation_csv_bytes(&serde_json::from_value::<CompensationResultView>(
                result,
            )?)?,
        ),
        "compensation-death" => (
            "LawCalc Korea 사망 손해배상 계산서",
            "compensation-death-calculation.hwpx",
            render_compensation_death_csv_bytes(&serde_json::from_value::<
                CompensationDeathResultView,
            >(result)?)?,
        ),
        "appropriation" => (
            "LawCalc Korea 변제충당 계산서",
            "appropriation-calculation.hwpx",
            render_appropriation_csv_bytes(&serde_json::from_value::<AppropriationExportView>(
                result,
            )?)?,
        ),
        other => {
            return Err(Error::InvalidSchema(format!(
                "HWPX로 내보낼 수 없는 계산 종류입니다: {other}"
            )))
        }
    })
}

#[tauri::command]
pub async fn export_hwpx(
    app: AppHandle,
    kind: String,
    result: Value,
) -> Result<Option<String>, Error> {
    let (title, file_name, csv_bytes) = csv_for_kind(&kind, result)?;
    let bytes = render_hwpx_bytes(title, &csv_to_blocks(&csv_bytes)?)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("HWPX", &["hwpx"])
            .set_file_name(file_name)
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

/// CSV 수식 방어용 `'` 를 걷어낸다 (`escape_csv_cell` 의 역).
fn unescape_cell(cell: &str) -> String {
    match cell.as_bytes() {
        [b'\'', b'=' | b'+' | b'-' | b'@' | b'\t' | b'\r', ..] => cell[1..].to_string(),
        _ => cell.to_string(),
    }
}

/// CSV 행을 문단·표 블록으로 묶는다. 빈 행은 표를 끊는다.
pub fn csv_to_blocks(csv_bytes: &[u8]) -> Result<Vec<Block>, Error> {
    let body = csv_bytes
        .strip_prefix(&[0xEF, 0xBB, 0xBF])
        .unwrap_or(csv_bytes);
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(body);

    let mut blocks = Vec::new();
    let mut table: Vec<Vec<String>> = Vec::new();
    for record in reader.records() {
        let mut row: Vec<String> = record?.iter().map(unescape_cell).collect();
        while row.last().is_some_and(|c| c.is_empty()) {
            row.pop();
        }
        let filled: Vec<&String> = row.iter().filter(|c| !c.is_empty()).collect();
        if filled.len() <= 1 && row.len() <= 2 {
            flush_table(&mut blocks, &mut table);
            if let Some(text) = filled.first() {
                blocks.push(Block::Para((*text).clone()));
            }
        } else {
            table.push(row);
        }
    }
    flush_table(&mut blocks, &mut table);
    Ok(blocks)
}

fn flush_table(blocks: &mut Vec<Block>, table: &mut Vec<Vec<String>>) {
    if table.is_empty() {
        return;
    }
    let mut rows = std::mem::take(table);
    // 조정안·판결 이유 표는 CSV 에서 첫 칸을 비워 들여쓴다. 표로 옮길 때는 그 빈 열을 뺀다.
    if rows.iter().all(|r| r.first().is_some_and(|c| c.is_empty())) {
        for r in &mut rows {
            r.remove(0);
        }
    }
    let cols = rows.iter().map(Vec::len).max().unwrap_or(1);
    for r in &mut rows {
        r.resize(cols, String::new());
    }
    blocks.push(Block::Table(rows));
}

/// XML 1.0 에 넣을 수 없는 제어 문자를 지우고 특수 문자를 이스케이프한다.
pub fn xml_escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            '\t' | '\n' | '\r' => out.push(ch),
            c if (c as u32) < 0x20 || c == '\u{FFFE}' || c == '\u{FFFF}' => {}
            c => out.push(c),
        }
    }
    out
}

const NS: &str = r#"xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head""#;
const XML_DECL: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>"#;
/// A4 본문 폭 (HWPUNIT, 1/7200 inch): 59528 - 좌우 여백 8504*2.
const TEXT_WIDTH: u32 = 42520;
const ROW_HEIGHT: u32 = 1500;

/// 줄마다 문단 하나. `char_pr` 0 = 본문, 1 = 제목.
fn paragraphs(text: &str, char_pr: u8) -> String {
    text.split('\n')
        .map(|line| {
            format!(
                r#"<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="{char_pr}"><hp:t>{}</hp:t></hp:run></hp:p>"#,
                xml_escape(line)
            )
        })
        .collect()
}

fn table_xml(rows: &[Vec<String>]) -> String {
    let cols = rows.first().map_or(1, Vec::len).max(1);
    let cell_w = TEXT_WIDTH / cols as u32;
    let mut xml = format!(
        r#"<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="0" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="{}" colCnt="{cols}" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="{}" widthRelTo="ABSOLUTE" height="{}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>"#,
        rows.len(),
        cell_w * cols as u32,
        ROW_HEIGHT * rows.len() as u32,
    );
    for (r, row) in rows.iter().enumerate() {
        xml.push_str("<hp:tr>");
        for (c, cell) in row.iter().enumerate() {
            xml.push_str(&format!(
                r#"<hp:tc name="" header="{}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">{}</hp:subList><hp:cellAddr colAddr="{c}" rowAddr="{r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="{cell_w}" height="{ROW_HEIGHT}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>"#,
                u8::from(r == 0),
                paragraphs(cell, 0),
            ));
        }
        xml.push_str("</hp:tr>");
    }
    xml.push_str("</hp:tbl></hp:run></hp:p>");
    xml
}

fn section_xml(title: &str, blocks: &[Block]) -> String {
    let mut xml = format!(
        r#"{XML_DECL}<hs:sec {NS}><hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1"><hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr></hp:secPr><hp:t>{}</hp:t></hp:run></hp:p>"#,
        xml_escape(title)
    );
    for block in blocks {
        match block {
            Block::Para(text) => xml.push_str(&paragraphs(text, 0)),
            Block::Table(rows) => xml.push_str(&table_xml(rows)),
        }
    }
    xml.push_str("</hs:sec>");
    xml
}

fn font_faces() -> String {
    ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]
        .iter()
        .map(|lang| {
            format!(
                r#"<hh:fontface lang="{lang}" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>"#
            )
        })
        .collect()
}

fn char_pr(id: u8, height: u32, bold: bool) -> String {
    format!(
        r##"<hh:charPr id="{id}" height="{height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>{}</hh:charPr>"##,
        if bold { "<hh:bold/>" } else { "" }
    )
}

fn border_fill(id: u8, line: &str) -> String {
    let width = if line == "NONE" { "0.1 mm" } else { "0.12 mm" };
    format!(
        r##"<hh:borderFill id="{id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="{line}" width="{width}" color="#000000"/><hh:rightBorder type="{line}" width="{width}" color="#000000"/><hh:topBorder type="{line}" width="{width}" color="#000000"/><hh:bottomBorder type="{line}" width="{width}" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>"##
    )
}

fn header_xml() -> String {
    format!(
        r#"{XML_DECL}<hh:head {NS} version="1.4" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList><hh:fontfaces itemCnt="7">{}</hh:fontfaces><hh:borderFills itemCnt="2">{}{}</hh:borderFills><hh:charProperties itemCnt="2">{}{}</hh:charProperties><hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties><hh:paraProperties itemCnt="1"><hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="LEFT" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr></hh:paraProperties><hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles></hh:refList><hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument></hh:head>"#,
        font_faces(),
        border_fill(1, "NONE"),
        border_fill(2, "SOLID"),
        char_pr(0, 1000, false),
        char_pr(1, 1400, true),
    )
}

fn content_hpf(title: &str) -> String {
    format!(
        r#"{XML_DECL}<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" version="" unique-identifier="" id=""><opf:metadata><opf:title>{}</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>"#,
        xml_escape(title)
    )
}

const VERSION_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="LawCalc Korea" appVersion="1"/>"#;
const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>"#;
const MANIFEST_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>"#;

/// HWPX zip 을 만든다. `mimetype` 은 OCF 규칙대로 첫 항목·무압축이다.
pub fn render_hwpx_bytes(title: &str, blocks: &[Block]) -> Result<Vec<u8>, Error> {
    let entries: [(&str, String); 7] = [
        ("mimetype", "application/hwp+zip".to_string()),
        ("version.xml", VERSION_XML.to_string()),
        ("META-INF/container.xml", CONTAINER_XML.to_string()),
        ("META-INF/manifest.xml", MANIFEST_XML.to_string()),
        ("Contents/content.hpf", content_hpf(title)),
        ("Contents/header.xml", header_xml()),
        ("Contents/section0.xml", section_xml(title, blocks)),
    ];
    let zip_err = |e: zip::result::ZipError| Error::Other(format!("HWPX 저장 실패: {e}"));
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    for (name, body) in &entries {
        zip.start_file(*name, options).map_err(zip_err)?;
        zip.write_all(body.as_bytes())?;
    }
    Ok(zip.finish().map_err(zip_err)?.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::result_view::DISCLAIMER_KO;
    use std::io::Read;

    fn unzip(bytes: &[u8]) -> Vec<(String, String)> {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).expect("zip");
        (0..archive.len())
            .map(|i| {
                let mut file = archive.by_index(i).unwrap();
                let mut body = String::new();
                file.read_to_string(&mut body).unwrap();
                (file.name().to_string(), body)
            })
            .collect()
    }

    fn assert_well_formed(name: &str, xml: &str) {
        let mut reader = quick_xml::Reader::from_str(xml);
        loop {
            match reader.read_event() {
                Ok(quick_xml::events::Event::Eof) => break,
                Ok(_) => {}
                Err(e) => panic!("{name} is not well-formed: {e}"),
            }
        }
    }

    fn hwpx_for(kind: &str, result: Value) -> Vec<(String, String)> {
        let (title, _, csv_bytes) = csv_for_kind(kind, result).unwrap();
        unzip(&render_hwpx_bytes(title, &csv_to_blocks(&csv_bytes).unwrap()).unwrap())
    }

    #[test]
    fn hwpx_zip_has_ocf_entries_and_well_formed_xml() {
        let view = crate::commands::csv::tests::compensation_sample();
        let entries = hwpx_for("compensation", serde_json::to_value(view).unwrap());
        let names: Vec<&str> = entries.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(
            names,
            [
                "mimetype",
                "version.xml",
                "META-INF/container.xml",
                "META-INF/manifest.xml",
                "Contents/content.hpf",
                "Contents/header.xml",
                "Contents/section0.xml",
            ]
        );
        assert_eq!(entries[0].1, "application/hwp+zip");
        for (name, body) in &entries[1..] {
            assert_well_formed(name, body);
        }
        let mut archive =
            zip::ZipArchive::new(Cursor::new(render_hwpx_bytes("t", &[]).unwrap())).unwrap();
        assert_eq!(
            archive.by_index(0).unwrap().compression(),
            CompressionMethod::Stored
        );
    }

    #[test]
    fn compensation_hwpx_carries_document_texts_tables_and_disclaimer() {
        let mut view = crate::commands::csv::tests::compensation_sample();
        view.document_texts = vec![super::super::result_view::CompensationDocumentTextView {
            title: "별지 일실수입 계산표".into(),
            lines: vec![
                "순번\t기간\t금액".into(),
                "1\t사고 후 0~360개월\t=1원 <A&B>".into(),
                "원고의 일실수입은 위와 같다.".into(),
            ],
        }];
        let entries = hwpx_for("compensation", serde_json::to_value(view).unwrap());
        let section = &entries[6].1;
        assert!(section.contains("<hp:t>LawCalc Korea 부상 손해배상 계산서</hp:t>"));
        assert!(section.contains("<hp:t>별지 일실수입 계산표</hp:t>"));
        // 탭 칸은 표 셀로, CSV 수식 방어 `'` 는 벗기고, XML 특수 문자는 이스케이프한다.
        assert!(section.contains("<hp:t>=1원 &lt;A&amp;B&gt;</hp:t>"));
        assert!(section.contains("<hp:t>원고의 일실수입은 위와 같다.</hp:t>"));
        assert!(section.contains("<hp:tbl "));
        assert!(section.contains(&xml_escape(DISCLAIMER_KO)));
    }

    #[test]
    fn every_kind_keeps_the_disclaimer() {
        let interest = serde_json::json!({
            "principal": 1000000.0,
            "segments": [{ "from": "2024-01-01", "to": "2024-12-31", "days": 366, "rate": 0.05,
                "formula": "1,000,000 × 0.05", "interest": 50000.0 }],
            "totalInterest": 50000.0, "grandTotal": 1050000.0,
            "options": { "mode": "period", "leapYear": "actual", "includeFirstDay": false },
            "dataVersion": "legal-rates/v1.0.0", "computedAt": "2026-10-25T00:00:00Z",
            "disclaimer": DISCLAIMER_KO,
        });
        let appropriation = serde_json::json!({
            "summary": [["총 변제액", "1,000"]],
            "tables": [{ "title": "충당 내역", "headers": ["순번", "금액"], "rows": [["1", "-1,000"]] }],
            "notes": [], "disclaimer": DISCLAIMER_KO, "dataVersion": "v1", "computedAt": "2026-10-25",
        });
        for (kind, value) in [("interest", interest), ("appropriation", appropriation)] {
            let entries = hwpx_for(kind, value);
            assert!(entries[6].1.contains(&xml_escape(DISCLAIMER_KO)), "{kind}");
            assert_well_formed(kind, &entries[6].1);
        }
        assert!(csv_for_kind("nope", Value::Null).is_err());
    }

    #[test]
    fn csv_rows_group_into_paragraphs_and_tables() {
        let csv = "\u{feff}제목\n,a,b\n,'-1,c\n\"\"\nk,v\nx,y,z\n";
        assert_eq!(
            csv_to_blocks(csv.as_bytes()).unwrap(),
            vec![
                Block::Para("제목".into()),
                Block::Table(vec![
                    vec!["a".into(), "b".into()],
                    vec!["-1".into(), "c".into()],
                ]),
                Block::Table(vec![
                    vec!["k".into(), "v".into(), String::new()],
                    vec!["x".into(), "y".into(), "z".into()],
                ]),
            ]
        );
    }

    #[test]
    fn xml_escape_drops_control_chars() {
        assert_eq!(
            xml_escape("a\u{1}<\"'>&\tb"),
            "a&lt;&quot;&apos;&gt;&amp;\tb"
        );
    }
}
