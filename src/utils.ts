import type { ReducedTrialRow } from "psyflow-web";

import { DECK_A, DECK_B, DECK_C, DECK_D } from "./controller";

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const token = String(value ?? "")
    .trim()
    .toLowerCase();
  return token === "1" || token === "true" || token === "yes" || token === "y";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asInt(value: unknown, fallback = 0): number {
  const parsed = asNumber(value);
  return parsed == null ? fallback : Math.round(parsed);
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value01: number): string {
  return `${(value01 * 100).toFixed(1)}%`;
}

function formatSigned(value: number): string {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

export interface IgtSummary {
  adv_rate: string;
  mean_rt_ms: string;
  timeout_count: number;
  net_sum: number;
  net_sum_signed: string;
  balance_end: number;
  deck_a_count: number;
  deck_b_count: number;
  deck_c_count: number;
  deck_d_count: number;
  total_trials: number;
}

function summarizeRows(rows: ReducedTrialRow[], fallbackBalance: number): IgtSummary {
  if (rows.length === 0) {
    return {
      adv_rate: "0.0%",
      mean_rt_ms: "0",
      timeout_count: 0,
      net_sum: 0,
      net_sum_signed: "+0",
      balance_end: Math.round(fallbackBalance),
      deck_a_count: 0,
      deck_b_count: 0,
      deck_c_count: 0,
      deck_d_count: 0,
      total_trials: 0
    };
  }

  const timeoutCount = rows.filter((row) => asBool(row.timed_out)).length;
  const responded = rows.filter((row) => !asBool(row.timed_out));
  const advantageousCount = responded.filter((row) => asBool(row.advantageous_choice)).length;
  const advRate =
    responded.length > 0 ? formatPercent(advantageousCount / responded.length) : "0.0%";

  const rtValues = responded
    .map((row) => asNumber(row.rt_s ?? row.decision_rt_s))
    .filter((value): value is number => value != null);
  const meanRtMs = Math.round(mean(rtValues) * 1000).toString();

  const netSum = rows.reduce((sum, row) => sum + asInt(row.net_outcome, 0), 0);

  const deckACount = responded.filter((row) => String(row.chosen_deck ?? "") === DECK_A).length;
  const deckBCount = responded.filter((row) => String(row.chosen_deck ?? "") === DECK_B).length;
  const deckCCount = responded.filter((row) => String(row.chosen_deck ?? "") === DECK_C).length;
  const deckDCount = responded.filter((row) => String(row.chosen_deck ?? "") === DECK_D).length;

  let balanceEnd = Math.round(fallbackBalance);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const parsed = asNumber(rows[index].balance_after);
    if (parsed != null) {
      balanceEnd = Math.round(parsed);
      break;
    }
  }

  return {
    adv_rate: advRate,
    mean_rt_ms: meanRtMs,
    timeout_count: timeoutCount,
    net_sum: netSum,
    net_sum_signed: formatSigned(netSum),
    balance_end: balanceEnd,
    deck_a_count: deckACount,
    deck_b_count: deckBCount,
    deck_c_count: deckCCount,
    deck_d_count: deckDCount,
    total_trials: rows.length
  };
}

export function summarizeBlock(
  rows: ReducedTrialRow[],
  blockId: string,
  fallbackBalance: number
): IgtSummary {
  const blockRows = rows.filter((row) => String(row.block_id ?? "") === blockId);
  return summarizeRows(blockRows, fallbackBalance);
}

export function summarizeOverall(rows: ReducedTrialRow[], fallbackBalance: number): IgtSummary {
  return summarizeRows(rows, fallbackBalance);
}

