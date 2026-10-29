"use client";
import React, { createContext, useContext } from "react";
import { cn } from "./utils";

export interface DataPoint {
  date: string | Date;
  value: number;
  level?: number;
}

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const HeatCtx = createContext<{ data: DataPoint[] }>({ data: [] });

export function Root({ data = [], className, children }: any) {
  return (
    <HeatCtx.Provider value={{ data }}>
      <div className={className}>{children}</div>
    </HeatCtx.Provider>
  );
}

export function MonthLabels({ children, className }: any) {
  const labels = MONTH_SHORT.slice(0, 6).map((m, i) => ({ month: i, col: i * 4, text: m }));
  return (
    <div className={cn("flex justify-between", className)}>
      {labels.map((label, i) => (
        <React.Fragment key={i}>
          {typeof children === "function" ? children({ label }) : label.text}
        </React.Fragment>
      ))}
    </div>
  );
}

export function DayLabels({ children }: any) {
  const rows = [0, 1, 2, 3, 4, 5, 6].map((r) => ({ row: r, dayOfWeek: r }));
  return (
    <>
      {rows.map((label) => (
        <React.Fragment key={label.row}>
          {typeof children === "function" ? children({ label }) : DAY_SHORT[label.dayOfWeek]}
        </React.Fragment>
      ))}
    </>
  );
}

export function Grid({ children, className }: any) {
  const { data } = useContext(HeatCtx);
  const cells =
    data.length > 0
      ? data.map((d, idx) => ({
          date: d.date,
          value: d.value ?? 0,
          level: d.level ?? (d.value > 8 ? 4 : d.value > 5 ? 3 : d.value > 2 ? 2 : d.value > 0 ? 1 : 0),
          key: idx,
        }))
      : Array.from({ length: 84 }, (_, idx) => ({
          date: new Date(Date.now() - (84 - idx) * 86400000).toISOString().slice(0, 10),
          value: idx % 5,
          level: idx % 5,
          key: idx,
        }));
  return (
    <div className={cn("grid grid-flow-col grid-rows-7 gap-[3px]", className)}>
      {cells.map((cell) => (
        <React.Fragment key={cell.key}>
          {typeof children === "function" ? children({ cell }) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

export function Cell({ className, ...props }: any) {
  return <span className={cn("inline-block", className)} {...props} />;
}

export function Tooltip({ children }: any) {
  return <>{typeof children === "function" ? null : children}</>;
}

export function Legend({ children }: any) {
  const levels = [0, 1, 2, 3, 4].map((level) => ({ level }));
  return (
    <>
      {levels.map((item) => (
        <React.Fragment key={item.level}>
          {typeof children === "function" ? children({ item }) : children}
        </React.Fragment>
      ))}
    </>
  );
}

export function LegendLevel({ className, ...props }: any) {
  return <span className={cn("inline-block", className)} {...props} />;
}
