import { Calculator, FileJson, TableProperties } from "lucide-react";

import { Footer } from "./components/layout/Footer";
import { Header } from "./components/layout/Header";
import { DisclaimerBar } from "./components/layout/DisclaimerBar";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Select } from "./components/ui/select";

export function App() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30 text-foreground">
      <Header />
      <DisclaimerBar />

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section className="space-y-4" aria-labelledby="input-title">
          <Card>
            <CardHeader>
              <CardTitle id="input-title" className="flex items-center gap-2">
                <Calculator className="h-4 w-4" aria-hidden="true" />
                이자 계산 입력
              </CardTitle>
              <CardDescription>
                W3에서 원금, 기간, 이율 구간, 계산 옵션 입력 폼이 연결됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="grid gap-2 text-sm font-medium">
                원금
                <Input placeholder="예: 10,000,000" inputMode="numeric" disabled />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  시작일
                  <Input type="date" disabled />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  종료일
                  <Input type="date" disabled />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                법정이율 프리셋
                <Select disabled defaultValue="civil">
                  <option value="civil">민법 5%</option>
                  <option value="commercial">상법 6%</option>
                  <option value="promotion">소촉법 12%</option>
                  <option value="custom">직접 입력</option>
                </Select>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled>
                  계산
                </Button>
                <Button type="button" variant="outline" disabled>
                  초기화
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4" aria-labelledby="result-title">
          <Card>
            <CardHeader>
              <CardTitle id="result-title" className="flex items-center gap-2">
                <TableProperties className="h-4 w-4" aria-hidden="true" />
                결과 표
              </CardTitle>
              <CardDescription>
                구간별 시작일, 종료일, 일수, 이율, 공식, 이자와 합계 행을 표시합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-medium">시작</th>
                      <th className="px-3 py-3 font-medium">종료</th>
                      <th className="px-3 py-3 font-medium">일수</th>
                      <th className="px-3 py-3 font-medium">이율</th>
                      <th className="px-3 py-3 font-medium">공식</th>
                      <th className="px-3 py-3 text-right font-medium">이자</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border text-muted-foreground">
                      <td className="px-3 py-5" colSpan={6}>
                        계산 결과가 여기에 표시됩니다.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-4 w-4" aria-hidden="true" />
                내보내기
              </CardTitle>
              <CardDescription>
                PDF, CSV, 클립보드, .lcalc 저장/로드 액션이 C 세션 IPC와 연결됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled>
                PDF
              </Button>
              <Button type="button" variant="secondary" disabled>
                CSV
              </Button>
              <Button type="button" variant="outline" disabled>
                복사
              </Button>
              <Button type="button" variant="outline" disabled>
                .lcalc
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
}
