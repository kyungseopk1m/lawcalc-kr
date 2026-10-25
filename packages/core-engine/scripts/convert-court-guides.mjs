#!/usr/bin/env node
// Converts the public-law table extracts (rows.jsonl) into the committed single-source datasets
//   data/court-filings-civil/v1.json     (재민 91-1 별표)
//   data/court-filings-criminal/v1.json  (재형 2003-11 별표 1~7)
//   data/court-jurisdiction/v1.json      (각급 법원의 설치와 관할구역에 관한 법률 별표 3·7·10, 시행일자별)
//
// usage: node scripts/convert-court-guides.mjs --src <dir> [--snapshot-date YYYY-MM-DD]
//   <dir> holds jaemin91-1.rows.jsonl, jaehyung2003-11.rows.jsonl, sources.json,
//   court-law-eflaw.rows.jsonl and court-law-eflaw.sources.json. Those are produced from
//   law.go.kr (법제처 국가법령정보 Open API) by the fetch scripts kept next to them.
// Re-running with the same input writes byte-identical JSON.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const SRC = arg("--src");
if (!SRC) {
  process.stderr.write("usage: node scripts/convert-court-guides.mjs --src <dir>\n");
  process.exit(2);
}
const SNAPSHOT_DATE = arg("--snapshot-date") ?? "2026-10-25";

const readJsonl = (name) =>
  readFileSync(resolve(SRC, name), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
const readJson = (name) => JSON.parse(readFileSync(resolve(SRC, name), "utf8"));
const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
/** 셀 안 줄바꿈·연속 공백을 공백 하나로. 글자는 바꾸지 않는다. */
const clean = (s) => s.replace(/\s+/g, " ").trim();
/** "가  철" · "별 책" 처럼 글자 사이에 공백을 넣은 짧은 칸은 공백을 지운다. */
const squash = (s) => s.replace(/\s+/g, "");

// 저장소 prettier 설정으로 맞춰 써야 다시 돌려도 커밋본과 바이트가 같다.
async function write(id, json) {
  const dir = resolve(REPO_ROOT, "data", id);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "v1.json");
  const options = (await prettier.resolveConfig(file)) ?? {};
  const text = await prettier.format(JSON.stringify(json), { ...options, filepath: file });
  writeFileSync(file, text, "utf8");
  process.stdout.write(`✓ data/${id}/v1.json\n`);
}

const LICENSE =
  "법령·대법원규칙·재판예규 본문과 별표는 저작권법 제7조 제1호·제2호의 보호받지 못하는 저작물로 보고 옮겼습니다 (재판예규를 제2호의 훈령 그 밖에 이와 유사한 것으로 보는 것은 해석이며 판례로 확인하지 않았습니다). 출처: 법제처 국가법령정보센터 (https://www.law.go.kr). 본 데이터셋은 원문 표의 칸을 그대로 옮기고 아래 snapshotMethod 에 적은 정리만 했습니다.";

const FILING_KINDS = ["가철", "합철", "첨철", "별도기록", "별책"];
const filingKind = (text) => {
  const s = squash(text);
  return FILING_KINDS.includes(s) ? s : "기타";
};

// ---------------------------------------------------------------- 민사 (재민 91-1)
const WON = /^([\d,]+)원$/;
const STATUTE_ONLY =
  /^(?:민사소송등인지법(?:\(이하민소인지법이라한다\))?|민소인지법|민사조정규칙)제\d+조[①-⑳]*(?:,제\d+조[①-⑳]*)*소정액$/;
function stamp(raw) {
  const text = clean(raw);
  if (text === "－" || text === "-") return { kind: "none", text };
  const m = WON.exec(squash(text));
  if (m) return { kind: "fixed", won: Number(m[1].replaceAll(",", "")), text };
  // 조문 번호 + "소정액" 만 있는 칸만 statute. 조건(다투는 경우)·선택(또는)·단서(첩부하지 않음)·
  // 차감(뺀 금액)이 붙으면 조문 금액을 그대로 붙이는 것이 아니므로 other.
  if (STATUTE_ONLY.test(squash(text))) {
    const refs = [...squash(text).matchAll(/제\d+조(?:[①-⑳]+)?/g)].map((x) => x[0]);
    return { kind: "statute", refs: [...new Set(refs)], text };
  }
  return { kind: "other", text };
}

const src = readJson("sources.json");
const civilMeta = src["jaemin_91-1"].meta;
const civilFile = src["jaemin_91-1"].files[0];
const civilRows = readJsonl("jaemin91-1.rows.jsonl").filter((r) => r.kind === "data");
const civil = {
  version: "1.0.1",
  updatedAt: SNAPSHOT_DATE,
  source: `「${civilMeta["행정규칙명"]}」 별표 (재판예규 제${civilMeta["발령번호"]}호, ${ymd(civilMeta["시행일자"])} 시행)`,
  sourceUrl: `https://www.law.go.kr/DRF/lawService.do?OC=test&target=admrul&type=XML&ID=${civilMeta["행정규칙일련번호"]}`,
  license: LICENSE,
  snapshotDate: SNAPSHOT_DATE,
  snapshotMethod: `법제처 Open API(target=admrul) 응답의 별표 HWP(flSeq ${civilFile.flSeq}, sha256 ${civilFile.sha256})에서 표 칸을 그대로 뽑았습니다. 병합 칸은 아래·오른쪽 칸에 같은 값을 펼쳤습니다. 칸 안 줄바꿈·연속 공백만 공백 하나로 줄였고, 편철방법의 "가  철" 처럼 글자 사이 공백은 지웠습니다. 인지액 칸은 원문(text)을 그대로 두고 종류(kind)만 붙였습니다: "－" 은 none, "N원" 한 가지 금액만 적힌 칸은 fixed, 민사소송 등 인지법·민사조정규칙 조문 번호와 "소정액" 만 적힌 칸은 statute(조문 번호를 refs 로 뽑음), 나머지(본안 인지액의 2분의 1, 신청서 인지액의 2배, 조건·선택·단서·차감이 붙은 금액 등)는 other 입니다. 변환 스크립트: packages/core-engine/scripts/convert-court-guides.mjs.`,
  regulation: {
    name: civilMeta["행정규칙명"],
    number: `재판예규 제${civilMeta["발령번호"]}호`,
    issuedOn: ymd(civilMeta["발령일자"]),
    effectiveFrom: ymd(civilMeta["시행일자"]),
    serial: civilMeta["행정규칙일련번호"],
  },
  electronicFiling: {
    text: "「민사소송 등에서의 전자문서 이용 등에 관한 법률」 제8조에 따라 등록사용자가 전자소송에 동의하고 전자문서로 제출하는 경우에는 「민사소송 등 인지법」 제16조에 따라 별표 인지액의 10분의 9에 해당하는 인지를 붙입니다.",
    sourceArticle: "재민 91-1 제3조 제2항, 민사소송 등 인지법 제16조",
  },
  documents: civilRows.map((r, i) => {
    const [name, article, stampRaw, entry, filing] = r.cells;
    return {
      id: `c${String(i + 1).padStart(3, "0")}`,
      name: clean(name),
      article: clean(article),
      stamp: stamp(stampRaw),
      entryMethod: clean(entry),
      filingMethod: clean(filing).replace(/^(\S)\s+(\S)$/, "$1$2"),
      filingKind: filingKind(filing),
    };
  }),
};

// ---------------------------------------------------------------- 형사 (재형 2003-11)
const DITTO = new Set(["″", "“", '"', "〃"]);
const crimMeta = src["jaehyung_2003-11"].meta;
const crimFiles = src["jaehyung_2003-11"].files.filter((f) => f.dup_of_flSeq == null);
const crimRows = readJsonl("jaehyung2003-11.rows.jsonl").filter((r) => r.kind === "data");
const crimDocs = [];
let prev = null;
let prevSheet = null;
for (const r of crimRows) {
  if (r.sheet !== prevSheet) prev = null;
  prevSheet = r.sheet;
  const cells = r.cells.map((c) => clean(c));
  const copied = [];
  const fields = ["name", "article", "entryMethod", "filingMethod"];
  for (let c = 1; c < 4; c++) {
    if (DITTO.has(cells[c])) {
      if (!prev) throw new Error(`ditto without a row above: ${r.sheet} ${r.i}`);
      cells[c] = prev[c];
      copied.push(fields[c]);
    }
  }
  prev = cells;
  const table = Number(r.sheet.replace("crim", ""));
  crimDocs.push({
    id: `k${String(crimDocs.length + 1).padStart(3, "0")}`,
    table,
    name: cells[0],
    article: cells[1],
    entryMethod: squash(cells[2]),
    filingMethod: cells[3].replace(/^(\S)\s+(\S)$/, "$1$2"),
    filingKind: filingKind(cells[3]),
    ...(copied.length > 0 ? { copiedFromAbove: copied } : {}),
  });
}
const criminal = {
  version: "1.0.0",
  updatedAt: SNAPSHOT_DATE,
  source: `「${crimMeta["행정규칙명"]}」 별표 1~7 (재판예규 제${crimMeta["발령번호"]}호, ${ymd(crimMeta["시행일자"])} 시행)`,
  sourceUrl: `https://www.law.go.kr/DRF/lawService.do?OC=test&target=admrul&type=XML&ID=${crimMeta["행정규칙일련번호"]}`,
  license: LICENSE,
  snapshotDate: SNAPSHOT_DATE,
  snapshotMethod: `법제처 Open API(target=admrul) 응답의 별표 HWP 10개 중 내용이 같은 3쌍을 뺀 7개(${crimFiles.map((f) => `flSeq ${f.flSeq} sha256 ${f.sha256.slice(0, 16)}`).join(", ")})에서 표 칸을 뽑았습니다. 원문의 "″"·"“" (윗칸과 같음 표시)는 바로 윗행 값으로 채웠고 채운 칸 이름을 copiedFromAbove 에 남겼습니다. 칸 안 줄바꿈·연속 공백은 공백 하나로 줄였고, 입력방법의 글자 사이 공백과 "별 책" 같은 두 글자 편철방법의 공백은 지웠습니다. 변환 스크립트: packages/core-engine/scripts/convert-court-guides.mjs.`,
  regulation: {
    name: crimMeta["행정규칙명"],
    number: `재판예규 제${crimMeta["발령번호"]}호`,
    issuedOn: ymd(crimMeta["발령일자"]),
    effectiveFrom: ymd(crimMeta["시행일자"]),
    serial: crimMeta["행정규칙일련번호"],
  },
  tables: crimFiles.map((f) => ({
    no: Number(f.sheet.replace("crim", "")),
    title: clean(f.title.replace(/[［］[\]]|별지/g, " ")),
  })),
  documents: crimDocs,
};

// ---------------------------------------------------------------- 관할 (법원설치법 별표 3·7·10)
const PROVINCES = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];
/** 별표가 쓰는 옛 이름 → 지금 이름. 명칭 변경 법률: 강원특별자치도법(2023-06-11), 전북특별자치도법(2024-01-18), 제주특별법(2006-07-01). */
const RENAMED = { 강원도: "강원특별자치도", 전라북도: "전북특별자치도", 제주도: "제주특별자치도" };
const province = (s) => {
  const p = RENAMED[s] ?? s;
  if (!PROVINCES.includes(p)) throw new Error(`unknown 시·도 "${s}"`);
  return p;
};
/** 별표가 시·도를 적지 않은 시·군(예: "고양시")은 그 지방법원이 있는 도로 읽는다. 광역시 구·군은 별표가 늘 광역시명을 앞에 붙인다. */
const DEFAULT_PROVINCE = {
  의정부: "경기도",
  수원: "경기도",
  인천: "경기도",
  춘천: "강원특별자치도",
  대전: "충청남도",
  청주: "충청북도",
  대구: "경상북도",
  울산: "경상남도",
  창원: "경상남도",
  광주: "전라남도",
  전주: "전북특별자치도",
  제주: "제주특별자치도",
};
/** 별표 이후 행정구역이 옮겨진 곳: 별표 표기(키) → 지금 시·도. 경상북도 군위군의 대구광역시 편입 법률(2023-07-01). */
const MOVED = { "경상북도|군위군": "대구광역시" };
const WHOLE = "전체";
const WHOLE_TOKEN = /^(\S+(?:특별시|광역시|특별자치시|특별자치도|도))$/;
const PREFIXED = /^(\S+(?:특별시|광역시|특별자치시|특별자치도|도))\s+(.+)$/;
const CITY_GU = /^(\S+시)\s+(\S+구)$/;

function splitNote(text) {
  const t = clean(text);
  const i = t.indexOf(". 다만");
  return i < 0 ? { area: t, note: null } : { area: t.slice(0, i), note: t.slice(i + 2) };
}
const SEP = /[ㆍ·․]/g;

/** 관할구역 칸 → [{ province, name }]. name 이 WHOLE 이면 그 시·도 전체. */
function parseArea(area, defaultProvince) {
  const out = [];
  for (const group of area.replace(SEP, "·").split(/\s*,\s*/)) {
    let metro = null;
    let city = null;
    for (const raw of group.split("·")) {
      const t = raw.trim();
      if (t === "") continue;
      let m;
      if ((m = WHOLE_TOKEN.exec(t)) && !t.endsWith("시도")) {
        out.push({ province: province(m[1]), name: WHOLE });
        metro = null;
        city = null;
      } else if ((m = PREFIXED.exec(t))) {
        metro = province(m[1]);
        city = null;
        out.push({ province: metro, name: m[2] });
      } else if ((m = CITY_GU.exec(t))) {
        city = m[1];
        metro = null;
        if (!defaultProvince) throw new Error(`no default 시·도 for "${t}"`);
        out.push({ province: defaultProvince, name: t });
      } else if (city && t.endsWith("구")) {
        out.push({ province: defaultProvince, name: `${city} ${t}` });
      } else if (metro && /[구군]$/.test(t)) {
        out.push({ province: metro, name: t });
      } else {
        metro = null;
        city = null;
        if (!/[시군구]$/.test(t)) throw new Error(`unexpected 관할구역 token "${t}"`);
        if (!defaultProvince) throw new Error(`no default 시·도 for "${t}"`);
        out.push({ province: defaultProvince, name: t });
      }
    }
  }
  return out.map((u) => {
    const moved = MOVED[`${u.province}|${u.name}`];
    return moved ? { province: moved, name: u.name, statuteProvince: u.province } : u;
  });
}

const eflawRows = readJsonl("court-law-eflaw.rows.jsonl");
const eflawSources = readJson("court-law-eflaw.sources.json");
const dataRows = (efYd, sheet) =>
  eflawRows.filter((r) => r.efYd === efYd && r.sheet === sheet && r.kind === "data");

/**
 * 2026-03-01·2026-03-17 판 별표 3 은 인천지방법원 행(본원·부천지원)이 빠져 있고, 전주지방법원 본원
 * 칸에서 소년보호사건 단서가 빠져 있다. 두 판 모두 그 내용을 옮기는 개정의 시행일이 2028-03-01 이다
 * (인천고등법원: 법률 제20605호 부칙 제1조 단서, 전주가정법원: 법률 제21484호 부칙 제1조 제2호).
 * 그래서 지금 시행 중인 표는 그 직전 판(2025-03-06 시행)의 해당 행으로 채운다.
 */
const CORRECTIONS = {
  20260317: {
    from: "20250306",
    districts: ["인천", "전주"],
    reason:
      "법제처 2026-03-17 시행 판 별표 3 에는 인천지방법원 행(본원·부천지원)이 없고 전주지방법원 본원 칸의 소년보호사건 단서가 없습니다. 이 두 내용을 바꾸는 개정은 시행일이 2028-03-01 로 미뤄져 있어(법률 제20605호 부칙 제1조 단서, 법률 제21484호 부칙 제1조 제2호), 두 지방법원의 행은 직전 판(2025-03-06 시행, MST 269695)의 것을 썼습니다.",
  },
};

const norm = (s) => squash(s);
const high = (s) => `${norm(s)}고등법원`;
const district = (s) => `${norm(s)}지방법원`;

function buildSnapshot(efYd) {
  const fix = CORRECTIONS[efYd];
  let b3 = dataRows(efYd, "law_b3").map((r) => r.ff);
  if (fix) {
    b3 = b3.filter((c) => !fix.districts.includes(norm(c[1])));
    b3.push(
      ...dataRows(fix.from, "law_b3")
        .filter((r) => fix.districts.includes(norm(r.ff[1])))
        .map((r) => r.ff),
    );
  }
  const rows = [];
  const units = new Map();
  for (const [h, d, b, areaText] of b3) {
    const { area, note } = splitNote(areaText);
    const dn = norm(d);
    const row = rows.length;
    rows.push({
      highCourt: high(h),
      districtCourt: district(d),
      branch: norm(b) === "" ? null : `${district(d)} ${norm(b)}지원`,
      areaText: clean(areaText),
      ...(note ? { note } : {}),
    });
    for (const u of parseArea(area, DEFAULT_PROVINCE[dn])) {
      const key = `${u.province}|${u.name}`;
      if (units.has(key)) throw new Error(`${efYd}: ${key} appears twice in 별표 3`);
      units.set(key, {
        province: u.province,
        name: u.name,
        row,
        municipalCourt: null,
        rehabilitationCourt: null,
        ...(u.statuteProvince ? { statuteName: `${u.statuteProvince} ${u.name}` } : {}),
      });
    }
  }
  // 별표 7: 시·군법원. 시·구·군명 칸의 이름이 별표 3 에 없고 그 시·도가 통째로 한 법원 관할이면 그 아래 칸으로 새로 만든다 (인천광역시 강화군 등).
  for (const r of dataRows(efYd, "law_b7")) {
    const [d, b, courtRaw, provRaw, names] = r.ff;
    const court = norm(courtRaw);
    if (court === "") continue;
    const prov = province(norm(provRaw));
    const parts = names
      .replace(SEP, "·")
      .split("·")
      .map((s) => clean(s));
    const firstUnit = parts[0] === prov ? prov : parts[0];
    const suffix = firstUnit.endsWith("군") ? "군법원" : "시법원";
    const courtName = `${district(d)} ${court}${suffix}`;
    for (const n of parts) {
      const raw = n === prov ? { province: prov, name: WHOLE } : { province: prov, name: n };
      const moved = MOVED[`${raw.province}|${raw.name}`];
      const key = `${moved ?? raw.province}|${raw.name}`;
      let unit = units.get(key);
      if (!unit) {
        const whole = units.get(`${prov}|${WHOLE}`);
        if (!whole) throw new Error(`${efYd}: 별표 7 ${key} not found in 별표 3`);
        unit = { ...whole, name: raw.name };
        units.set(key, unit);
      }
      const expectBranch = norm(b) === "" ? null : `${district(d)} ${norm(b)}지원`;
      const row = rows[unit.row];
      if (row.districtCourt !== district(d) || row.branch !== expectBranch) {
        throw new Error(
          `${efYd}: 별표 7 ${key} → ${district(d)} ${norm(b)} but 별표 3 says ${row.districtCourt} ${row.branch}`,
        );
      }
      unit.municipalCourt = courtName;
    }
  }
  // 별표 10: 회생법원.
  for (const r of dataRows(efYd, "law_b10")) {
    const [, rc, areaText] = r.ff;
    const name = `${norm(rc)}회생법원`;
    for (const a of parseArea(clean(areaText), "경기도")) {
      for (const u of units.values()) {
        const hit =
          (a.name === WHOLE &&
            (u.province === a.province || u.statuteName?.startsWith(`${a.province} `))) ||
          (u.province === a.province && u.name === a.name);
        if (hit) u.rehabilitationCourt = name;
      }
    }
  }
  const order = (u) => PROVINCES.indexOf(u.province);
  const list = [...units.values()].sort(
    (a, b) =>
      order(a) - order(b) ||
      (a.name === WHOLE ? -1 : b.name === WHOLE ? 1 : a.name.localeCompare(b.name, "ko")),
  );
  const ver = eflawSources.find((s) => s.efYd === efYd);
  return {
    effectiveFrom: ymd(efYd),
    lawNumber: `법률 제${ver["공포번호"]}호`,
    promulgatedOn: ymd(ver["공포일자"]),
    mst: ver.mst,
    sourceUrl: `https://www.law.go.kr/DRF/lawService.do?OC=test&target=eflaw&type=XML&MST=${ver.mst}&efYd=${efYd}`,
    files: ver.files
      .filter((f) => f.byeolpyo !== 5)
      .map((f) => ({ byeolpyo: f.byeolpyo, flSeq: f.flSeq, sha256: f.sha256 })),
    ...(fix ? { correction: fix.reason } : {}),
    rows,
    units: list,
  };
}

const snapshots = [];
for (const v of eflawSources.filter((s) => s.efYd >= "20260317")) {
  const s = buildSnapshot(v.efYd);
  const last = snapshots.at(-1);
  // 별표 3·7·10 이 앞 판과 같으면 따로 두지 않는다 (2029-03-01 판은 이 세 별표가 2028-03-01 판과 같다).
  if (last && JSON.stringify([last.rows, last.units]) === JSON.stringify([s.rows, s.units]))
    continue;
  snapshots.push(s);
}

const jurisdiction = {
  version: "1.0.0",
  updatedAt: SNAPSHOT_DATE,
  source:
    "「각급 법원의 설치와 관할구역에 관한 법률」 별표 3(고등법원·지방법원과 그 지원), 별표 7(시·군법원), 별표 10(회생법원). 시행일자별 본문",
  sourceUrl:
    "https://www.law.go.kr/DRF/lawService.do?OC=test&target=eflaw&type=XML&MST=284429&efYd=20260317",
  license: LICENSE,
  snapshotDate: SNAPSHOT_DATE,
  snapshotMethod: `법제처 Open API target=eflaw 로 시행일자별 본문을 받아(lawSearch target=eflaw 2026-10-25 조회: 현행 2026-03-17, 시행예정 2028-03-01·2029-03-01·2031-03-01·2032-03-01) 각 판의 별표 HWP 에서 표 칸을 뽑았습니다. target=law 응답의 별표는 시행일이 미뤄진 개정까지 모두 반영한 통합본이라 쓰지 않았습니다. 별표 3·7·10 이 앞 판과 같은 판은 빼서 ${snapshots.map((s) => s.effectiveFrom).join(", ")} 판만 담았습니다. 관할구역 칸은 "다만, ..." 이하를 note 로 떼고 나머지를 시·군·구 단위로 나눴습니다. 시·도를 적지 않은 시·군은 그 지방법원이 있는 도로 읽었고(예: 수원지방법원 행의 "고양시" 는 경기도), 별표의 옛 시·도 이름은 지금 이름으로 바꿨습니다(강원도→강원특별자치도, 전라북도→전북특별자치도, 제주도→제주특별자치도). 경상북도 군위군은 2023-07-01 대구광역시로 편입되어 대구광역시 아래에 두고 별표 표기를 statuteName 에 남겼습니다. 별표 7 의 시·구·군 칸이 별표 3 에서 시·도 전체로만 적힌 곳(인천광역시 강화군)은 그 시·도 전체 행의 법원으로 따로 칸을 만들었습니다. 별표 5(가정법원)는 이번 판에 넣지 않았습니다. 변환 스크립트: packages/core-engine/scripts/convert-court-guides.mjs.`,
  law: {
    name: "각급 법원의 설치와 관할구역에 관한 법률",
    lsId: "001709",
  },
  wholeUnitName: WHOLE,
  provinces: PROVINCES,
  snapshots,
};

await write("court-filings-civil", civil);
await write("court-filings-criminal", criminal);
await write("court-jurisdiction", jurisdiction);
process.stdout.write(
  `civil ${civil.documents.length} · criminal ${criminal.documents.length} · jurisdiction ${snapshots.map((s) => `${s.effectiveFrom}:${s.units.length}`).join(" ")}\n`,
);
