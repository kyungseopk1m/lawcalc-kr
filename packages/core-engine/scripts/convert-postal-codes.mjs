#!/usr/bin/env node
// Builds data/postal-codes/v1.json (시·도 / 시·군·구 / 읍·면·동(읍·면은 리까지) 별 5자리 우편번호 요약) from the
// 우정사업본부 "지역별 주소 DB" (https://www.epost.go.kr/search/areacd/zipcode_DB.zip).
//
// usage: node scripts/convert-postal-codes.mjs --src <dir> --base-date YYYY-MM-DD
//          --notice-date YYYY-MM-DD --zip-sha256 <hex> [--snapshot-date YYYY-MM-DD]
//   <dir> holds the unzipped per-시·도 txt files (UTF-8, '|' separated, header row).
// The raw DB (about 1.2GB unzipped) never enters the repo. Re-running with the same input
// writes byte-identical JSON.
import { createReadStream, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const SRC = arg("--src");
const BASE_DATE = arg("--base-date");
const NOTICE_DATE = arg("--notice-date");
const ZIP_SHA256 = arg("--zip-sha256");
const SNAPSHOT_DATE = arg("--snapshot-date") ?? "2026-10-25";
if (!SRC || !BASE_DATE || !NOTICE_DATE || !ZIP_SHA256) {
  process.stderr.write(
    "usage: node scripts/convert-postal-codes.mjs --src <dir> --base-date YYYY-MM-DD --notice-date YYYY-MM-DD --zip-sha256 <hex>\n",
  );
  process.exit(2);
}

const ko = new Intl.Collator("ko");
const MIN_ADMIN_ROWS = 5;
/** key "시도|시군구|읍면동" → { codes, adminDongs, ris: 리명 → 번호 Set } */
const regions = new Map();
/** "시도|시군구|행정동" → 건물 행 수. 원본에 다른 시·군의 행정동이 섞인 행이 있어 거른다. */
const adminTotals = new Map();
let buildings = 0;
let riWithoutEupmyeon = 0;

const files = readdirSync(SRC)
  .filter((f) => f.endsWith(".txt"))
  .sort();
if (files.length === 0) throw new Error(`no .txt files in ${SRC}`);
for (const f of files) {
  const rl = createInterface({ input: createReadStream(resolve(SRC, f), "utf8") });
  let header = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, "");
    if (line === "") continue;
    const cols = line.split("|");
    if (header === null) {
      header = Object.fromEntries(cols.map((c, i) => [c, i]));
      for (const c of ["우편번호", "시도", "시군구", "읍면", "법정동명", "리명", "행정동명"]) {
        if (header[c] === undefined) throw new Error(`${f}: column ${c} missing`);
      }
      continue;
    }
    const code = cols[header["우편번호"]];
    if (!/^\d{5}$/.test(code)) throw new Error(`${f}: bad 우편번호 "${code}"`);
    const sido = cols[header["시도"]];
    const sigungu = cols[header["시군구"]];
    const emd = cols[header["읍면"]] || cols[header["법정동명"]];
    if (!sido || !emd) throw new Error(`${f}: 시도/읍면동 empty in "${line}"`);
    const key = `${sido}|${sigungu}|${emd}`;
    let r = regions.get(key);
    if (r === undefined) {
      r = { codes: new Set(), adminDongs: new Set(), ris: new Map() };
      regions.set(key, r);
    }
    r.codes.add(code);
    // 리는 읍·면 칸에만 단다. 원본이 건물 행마다 리명을 적어 리별 번호를 그대로 모을 수 있다.
    const ri = cols[header["리명"]];
    if (ri) {
      if (!cols[header["읍면"]]) riWithoutEupmyeon++;
      else {
        let rc = r.ris.get(ri);
        if (rc === undefined) r.ris.set(ri, (rc = new Set()));
        rc.add(code);
      }
    }
    // 읍·면은 행정동이 곧 읍·면이라 별칭을 달지 않는다.
    const admin = cols[header["행정동명"]];
    if (admin && admin !== emd && !cols[header["읍면"]]) {
      r.adminDongs.add(admin);
      const ak = `${sido}|${sigungu}|${admin}`;
      adminTotals.set(ak, (adminTotals.get(ak) ?? 0) + 1);
    }
    buildings++;
  }
}

/** 연속된 번호는 "시작-끝" 하나로 묶는다. */
function compact(codes) {
  const nums = [...codes].map(Number).sort((a, b) => a - b);
  const out = [];
  const pad = (n) => String(n).padStart(5, "0");
  for (let i = 0; i < nums.length;) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(i === j ? pad(nums[i]) : `${pad(nums[i])}-${pad(nums[j])}`);
    i = j + 1;
  }
  return out;
}

const rows = [...regions.entries()]
  .map(([key, r]) => {
    const [sido, sigungu, emd] = key.split("|");
    const row = { sido, sigungu, emd, codes: compact(r.codes) };
    // 같은 시·군·구 안에서 건물 5행 미만인 행정동명은 오기로 보고 뺀다 (임계값은 눈대중).
    const admins = [...r.adminDongs].filter(
      (a) => (adminTotals.get(`${sido}|${sigungu}|${a}`) ?? 0) >= MIN_ADMIN_ROWS,
    );
    if (admins.length > 0) row.adminDongs = admins.sort(ko.compare);
    if (r.ris.size > 0) {
      row.ris = [...r.ris.keys()]
        .sort(ko.compare)
        .map((name) => ({ name, codes: compact(r.ris.get(name)) }));
    }
    return row;
  })
  .sort(
    (a, b) =>
      ko.compare(a.sido, b.sido) || ko.compare(a.sigungu, b.sigungu) || ko.compare(a.emd, b.emd),
  );

const allCodes = new Set();
for (const r of regions.values()) for (const c of r.codes) allCodes.add(c);

const json = {
  version: "1.1.0",
  updatedAt: SNAPSHOT_DATE,
  source: `우정사업본부 우편번호 고시파일 "지역별 주소 DB" (도로명주소·우편번호 ${BASE_DATE} 기준, ${NOTICE_DATE} 고시)`,
  sourceUrl: "https://www.epost.go.kr/search/zipcode/areacdAddressDown.jsp",
  license:
    '공공데이터포털 등록 항목 "과학기술정보통신부 우정사업본부_우편번호 다운로드 서비스" (https://www.data.go.kr/data/15000302/openapi.do, 같은 고시파일의 위치를 돌려주는 서비스) 의 이용허락범위가 "제한 없음", 비용 무료로 표시되어 있어 (2026-10-25 확인) 재배포 가능한 공공데이터로 보고 요약본을 담았습니다. 우편번호 자체는 우정사업본부가 고시하는 번호입니다. 인터넷우체국 이용약관 제22조(인터넷우체국이 작성한 저작물의 영리목적 이용 제한)는 이 고시파일에 별도 표시가 없어 적용 여부를 확인하지 못했습니다(미확인). 출처 표시: 우정사업본부 우편번호 DB. 저장소 grep 결과: 구 우편번호 프로그램 DB 유래 값 없음.',
  snapshotDate: SNAPSHOT_DATE,
  snapshotMethod: `지역별 주소 DB 의 건물 단위 행(${buildings.toLocaleString("en-US")}행)을 시·도 / 시·군·구 / 읍·면·동(읍면 칸이 있으면 읍·면, 없으면 법정동명)으로 묶어 그 안에 나오는 5자리 우편번호(국가기초구역번호)를 모았습니다. 연속 번호는 "시작-끝" 으로 줄였고, 동 지역은 같은 법정동 안의 행정동명을 검색용 adminDongs 로 붙였습니다(같은 시·군·구 안에서 건물 행이 ${MIN_ADMIN_ROWS}행 미만인 행정동명은 오기로 보고 뺐습니다). 읍·면 칸에는 그 안의 리(里) 이름마다 원본 건물 행에 나오는 번호를 ris 로 붙였습니다(리명 칸 기준, 읍면 칸이 빈 행의 리명은 쓰지 않음). 도로명·건물번호 단위 정보는 버렸습니다. 원본 zip sha256 ${ZIP_SHA256}. 변환: packages/core-engine/scripts/convert-postal-codes.mjs.`,
  baseDate: BASE_DATE,
  noticeDate: NOTICE_DATE,
  counts: {
    sido: new Set(rows.map((r) => r.sido)).size,
    sigungu: new Set(rows.map((r) => `${r.sido}|${r.sigungu}`)).size,
    emd: rows.length,
    codes: allCodes.size,
    ri: rows.reduce((n, r) => n + (r.ris?.length ?? 0), 0),
  },
  regions: rows,
};

const dir = resolve(REPO_ROOT, "data/postal-codes");
mkdirSync(dir, { recursive: true });
const file = resolve(dir, "v1.json");
const options = (await prettier.resolveConfig(file)) ?? {};
writeFileSync(
  file,
  await prettier.format(JSON.stringify(json), { ...options, filepath: file }),
  "utf8",
);
process.stdout.write(
  `✓ data/postal-codes/v1.json (${rows.length} 읍면동, ${json.counts.ri} 리, ${allCodes.size} codes, ${buildings} rows, 읍면 없는 리명 행 ${riWithoutEupmyeon})\n`,
);
