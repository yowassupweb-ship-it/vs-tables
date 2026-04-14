"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DeskChartPoint = {
  day: string;
  reservations: number;
};

type DeskChartProps = {
  points: DeskChartPoint[];
  deskLabel: string;
};

export function DeskChart({ points, deskLabel }: DeskChartProps) {
  return (
    <section className="panel chart-panel">
      <div className="panel-title-row">
        <h3>График стола {deskLabel}</h3>
        <p>Количество бронирований за 14 дней</p>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={points} margin={{ left: -18, right: 12, top: 14, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,24,39,0.12)" />
            <XAxis dataKey="day" stroke="rgba(17,24,39,0.6)" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} stroke="rgba(17,24,39,0.6)" tick={{ fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(17,24,39,0.06)" }}
              contentStyle={{
                background: "#ffffff",
                border: "1px solid rgba(17,24,39,0.16)",
                borderRadius: 12,
              }}
            />
            <Bar dataKey="reservations" fill="#2f7ef6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
