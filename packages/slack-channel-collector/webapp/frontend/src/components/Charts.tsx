import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { Customer, CompanyProfile } from "../types";
import { industryChart, interestChart } from "../lib/domain";

function useBarChart(
  labels: string[],
  values: number[],
  color: string | ((k: string) => string)
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(ref.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor:
              typeof color === "function" ? labels.map(color) : color,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { precision: 0 } } },
      },
    });
    return () => chartRef.current?.destroy();
  }, [labels.join("|"), values.join("|")]);
  return ref;
}

export function Charts({
  recs,
  companies,
}: {
  recs: Customer[];
  companies: Record<string, CompanyProfile>;
}) {
  const ind = industryChart(recs, companies);
  const int = interestChart(recs);
  const indRef = useBarChart(ind.labels, ind.values, (k) =>
    k === "미입력" ? "#D4D4D8" : "#EA580C"
  );
  const intRef = useBarChart(int.labels, int.values, "#2563EB");
  return (
    <div className="charts">
      <div className="card">
        <h3>업종별 회사 (전체 DB, 업종 입력된 회사 기준)</h3>
        <div className="chartbox">
          <canvas ref={indRef} />
        </div>
      </div>
      <div className="card">
        <h3>관심 솔루션별 리드 (전체 DB, 고유 고객)</h3>
        <div className="chartbox">
          <canvas ref={intRef} />
        </div>
      </div>
    </div>
  );
}
