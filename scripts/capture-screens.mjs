import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "docs", "assets");
const baseUrl = "http://127.0.0.1:1420";
const disclaimer = "본 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인이 필요합니다.";

const captures = [
  {
    tab: "이자 계산",
    file: "readme-interest.png",
    assertText: "원리금 합계",
    assertDisclaimer: false,
  },
  {
    tab: "상속분 간이 계산",
    file: "readme-inheritance.png",
    assertDisclaimer: true,
  },
  {
    tab: "소송비용",
    file: "readme-litigation-cost.png",
    assertDisclaimer: true,
  },
  {
    tab: "변제충당",
    file: "readme-appropriation.png",
    assertDisclaimer: true,
  },
  {
    tab: "손해배상",
    subTab: "자동차 사고 · 부상",
    file: "readme-compensation.png",
    assertDisclaimer: true,
  },
  {
    tab: "손해배상",
    subTab: "자동차 사고 · 사망",
    file: "readme-compensation-death.png",
    assertDisclaimer: true,
  },
  {
    tab: "손해배상",
    subTab: "자동차 사고 · 부상",
    accidentType: "산재",
    benefitTestId: "compensation-disability-benefit-input",
    benefitValue: "50000000",
    file: "readme-compensation-industrial.png",
    assertDisclaimer: true,
    assertText: "산재보험급여 공제 (장해급여)",
  },
  {
    tab: "손해배상",
    subTab: "자동차 사고 · 부상",
    file: "readme-compensation-other-damages.png",
    assertDisclaimer: true,
    fullPage: true,
    // 기타손해(향후개호비 + 기왕치료비)를 채워 결과에 개호비·치료비 줄이 보이게 한다.
    // 셀렉터는 기타손해 카드로 스코프해 다른 "추가" 버튼과 충돌하지 않게 한다.
    setup: async (page) => {
      // 직전 산재 캡처의 사건종류 상태가 남아 있을 수 있어 자동차로 되돌린다(깨끗한 자동차 + 기타손해).
      await page.getByRole("button", { name: "자동차", exact: true }).click();
      const card = page.getByTestId("compensation-other-damages-card");
      const add = card.getByRole("button", { name: "추가" });
      // 향후개호비 (카드 내 2번째 "추가")
      await add.nth(1).click();
      await card.getByPlaceholder("직접 일당 (원)").fill("150000");
      const dates = card.locator('input[type="date"]');
      await dates.nth(0).fill("2026-01-01");
      await dates.nth(1).fill("2046-01-01");
      await card.getByPlaceholder("인원 (예: 1 / 0.5)").fill("1");
      // 기왕치료비 (카드 내 3번째 "추가")
      await add.nth(2).click();
      await card.getByPlaceholder("비용 (원)").fill("3000000");
    },
  },
];

function waitForServerReady(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("vite dev server did not become ready within 30 seconds."));
    }, 30_000);

    const onData = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (settled || !text.includes("Local:")) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => process.stderr.write(chunk.toString()));
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`vite dev server exited early with code ${code ?? "unknown"}.`));
    });
  });
}

async function clickCalculate(page, { assertDisclaimer }) {
  await page.getByRole("button", { name: "계산", exact: true }).click();
  if (assertDisclaimer) {
    await page.getByText(disclaimer).waitFor({ timeout: 10_000 });
  }
}

async function captureCurrentPage(page, filename, fullPage = false) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(outputDir, filename),
    fullPage,
  });
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const server = spawn("pnpm", ["--filter", "@lawcalc-kr/desktop", "dev"], {
    cwd: repoRoot,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  let browser;
  try {
    await waitForServerReady(server);

    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 2,
      locale: "ko-KR",
    });

    await page.goto(baseUrl, { waitUntil: "networkidle" });

    for (const capture of captures) {
      console.log(
        `Capturing ${capture.tab}${capture.subTab ? ` / ${capture.subTab}` : ""} -> ${capture.file}`,
      );
      await page.getByRole("button", { name: capture.tab }).click();
      if (capture.subTab) {
        await page.getByRole("button", { name: capture.subTab }).click();
      }
      if (capture.accidentType) {
        await page.getByRole("button", { name: capture.accidentType, exact: true }).click();
        if (capture.benefitTestId) {
          await page.getByTestId(capture.benefitTestId).fill(capture.benefitValue);
        }
      }
      if (capture.setup) {
        await capture.setup(page);
      }
      await clickCalculate(page, capture);
      if (capture.assertText) {
        await page.getByText(capture.assertText).first().waitFor({ timeout: 10_000 });
      }
      await captureCurrentPage(page, capture.file, capture.fullPage);
    }

    console.log("Capturing info dialog -> readme-info-dialog.png");
    await page.getByRole("button", { name: "정보" }).click();
    const dialog = page.getByRole("dialog", { name: "정보" });
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.getByText(disclaimer).waitFor({ timeout: 10_000 });
    await captureCurrentPage(page, "readme-info-dialog.png");
  } finally {
    await browser?.close();
    if (process.platform === "win32") {
      server.kill("SIGTERM");
    } else if (server.pid) {
      process.kill(-server.pid, "SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
