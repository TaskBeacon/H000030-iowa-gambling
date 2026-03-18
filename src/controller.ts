export const DECK_A = "deck_a";
export const DECK_B = "deck_b";
export const DECK_C = "deck_c";
export const DECK_D = "deck_d";

export const ALL_DECKS = [DECK_A, DECK_B, DECK_C, DECK_D] as const;
export const ADVANTAGEOUS_DECKS = new Set<string>([DECK_C, DECK_D]);

export type DeckId = (typeof ALL_DECKS)[number];

export interface DeckProfile {
  gain: number;
  loss_sequence: number[];
}

export interface DeckDrawResult {
  deck: DeckId;
  draw_index: number;
  gain: number;
  loss: number;
  net: number;
  total_money: number;
}

interface BucketMetrics {
  n: number;
  responses: number;
  timeouts: number;
  adv: number;
  rt_sum: number;
  rt_n: number;
  net_sum: number;
  gain_sum: number;
  loss_sum: number;
  deck_a: number;
  deck_b: number;
  deck_c: number;
  deck_d: number;
}

function makeSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value: unknown, fallback: number): number {
  return Math.round(toNumber(value, fallback));
}

function normalizeLossSequence(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const output: number[] = [];
  for (const item of value) {
    const parsed = Math.max(0, toInt(item, 0));
    if (Number.isFinite(parsed)) {
      output.push(parsed);
    }
  }
  return output.length > 0 ? output : [...fallback];
}

function defaultProfiles(): Record<DeckId, DeckProfile> {
  return {
    [DECK_A]: {
      gain: 100,
      loss_sequence: [0, 150, 0, 300, 0, 200, 0, 250, 0, 350]
    },
    [DECK_B]: {
      gain: 100,
      loss_sequence: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1250]
    },
    [DECK_C]: {
      gain: 50,
      loss_sequence: [0, 25, 0, 50, 0, 25, 0, 75, 0, 75]
    },
    [DECK_D]: {
      gain: 50,
      loss_sequence: [0, 0, 0, 0, 0, 0, 0, 0, 0, 250]
    }
  };
}

function newBucket(): BucketMetrics {
  return {
    n: 0,
    responses: 0,
    timeouts: 0,
    adv: 0,
    rt_sum: 0,
    rt_n: 0,
    net_sum: 0,
    gain_sum: 0,
    loss_sum: 0,
    deck_a: 0,
    deck_b: 0,
    deck_c: 0,
    deck_d: 0
  };
}

export class Controller {
  readonly fixation_duration: number | number[];
  readonly decision_deadline: number;
  readonly feedback_duration: number;
  readonly iti_duration: number | number[];
  readonly initial_money: number;
  readonly enable_logging: boolean;
  readonly deck_profiles: Record<DeckId, DeckProfile>;
  readonly random_seed: number | null;
  total_money: number;
  block_idx: number;
  trial_count_total: number;
  trial_count_block: number;
  deck_draw_counts: Record<DeckId, number>;
  total_bucket: BucketMetrics;
  block_bucket: BucketMetrics;
  private readonly rng: () => number;

  constructor(args: {
    fixation_duration?: number | number[];
    decision_deadline?: number;
    feedback_duration?: number;
    iti_duration?: number | number[];
    initial_money?: number;
    deck_profiles?: unknown;
    random_seed?: number | null;
    enable_logging?: boolean;
  }) {
    this.fixation_duration = args.fixation_duration ?? [0.3, 0.5];
    this.decision_deadline = Math.max(0.2, toNumber(args.decision_deadline, 3.5));
    this.feedback_duration = Math.max(0.1, toNumber(args.feedback_duration, 1.1));
    this.iti_duration = args.iti_duration ?? [0.3, 0.6];
    this.initial_money = toInt(args.initial_money, 2000);
    this.enable_logging = args.enable_logging !== false;
    this.deck_profiles = this.normalizeProfiles(args.deck_profiles);
    this.random_seed =
      args.random_seed == null || Number.isNaN(Number(args.random_seed))
        ? null
        : toInt(args.random_seed, 0);
    this.rng = makeSeededRandom(this.random_seed ?? Math.floor(Date.now() % 2147483647));
    this.total_money = this.initial_money;
    this.block_idx = -1;
    this.trial_count_total = 0;
    this.trial_count_block = 0;
    this.deck_draw_counts = {
      [DECK_A]: 0,
      [DECK_B]: 0,
      [DECK_C]: 0,
      [DECK_D]: 0
    };
    this.total_bucket = newBucket();
    this.block_bucket = newBucket();
  }

  static from_dict(config: Record<string, unknown>): Controller {
    const cfg = config ?? {};
    return new Controller({
      fixation_duration: (cfg.fixation_duration as number | number[] | undefined) ?? [0.3, 0.5],
      decision_deadline: toNumber(cfg.decision_deadline, 3.5),
      feedback_duration: toNumber(cfg.feedback_duration, 1.1),
      iti_duration: (cfg.iti_duration as number | number[] | undefined) ?? [0.3, 0.6],
      initial_money: toInt(cfg.initial_money, 2000),
      deck_profiles: cfg.deck_profiles,
      random_seed: cfg.random_seed == null ? null : toInt(cfg.random_seed, 0),
      enable_logging: Boolean(cfg.enable_logging ?? true)
    });
  }

  static parse_condition(condition: string): string {
    const token = String(condition ?? "")
      .trim()
      .toLowerCase();
    if (token === "" || token === "free_choice" || token === "igt" || token === "trial") {
      return "free_choice";
    }
    return token;
  }

  private normalizeProfiles(value: unknown): Record<DeckId, DeckProfile> {
    const defaults = defaultProfiles();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaults;
    }
    const raw = value as Record<string, unknown>;
    const output: Record<DeckId, DeckProfile> = {
      [DECK_A]: defaults[DECK_A],
      [DECK_B]: defaults[DECK_B],
      [DECK_C]: defaults[DECK_C],
      [DECK_D]: defaults[DECK_D]
    };
    for (const deck of ALL_DECKS) {
      const defaultGain = defaults[deck].gain;
      const defaultLoss = defaults[deck].loss_sequence;
      const deckRaw =
        (raw[deck] as Record<string, unknown> | undefined) ??
        (raw[deck.toUpperCase()] as Record<string, unknown> | undefined) ??
        {};
      const gain = Math.max(0, toInt(deckRaw.gain, defaultGain));
      const loss_sequence = normalizeLossSequence(deckRaw.loss_sequence, defaultLoss);
      output[deck] = {
        gain,
        loss_sequence
      };
    }
    return output;
  }

  start_block(block_idx: number): void {
    this.block_idx = Math.trunc(block_idx);
    this.trial_count_block = 0;
    this.block_bucket = newBucket();
  }

  next_trial_id(): number {
    return this.trial_count_total + 1;
  }

  sample_duration(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    if (Array.isArray(value) && value.length >= 2) {
      const a = toNumber(value[0], fallback);
      const b = toNumber(value[1], fallback);
      const lower = Math.min(a, b);
      const upper = Math.max(a, b);
      return Math.max(0, lower + (upper - lower) * this.rng());
    }
    return Math.max(0, fallback);
  }

  draw_from_deck(deck: string): DeckDrawResult {
    const deckId = String(deck ?? "")
      .trim()
      .toLowerCase() as DeckId;
    if (!ALL_DECKS.includes(deckId)) {
      throw new Error(`Unsupported deck: ${deck}`);
    }
    const profile = this.deck_profiles[deckId];
    const gain = Math.max(0, Math.round(profile.gain));
    const losses =
      Array.isArray(profile.loss_sequence) && profile.loss_sequence.length > 0
        ? profile.loss_sequence
        : [0];
    const drawIndex0 = Math.max(0, Math.round(this.deck_draw_counts[deckId]));
    const loss = Math.max(0, Math.round(losses[drawIndex0 % losses.length]));
    const net = gain - loss;
    this.deck_draw_counts[deckId] = drawIndex0 + 1;
    this.total_money += net;
    return {
      deck: deckId,
      draw_index: drawIndex0 + 1,
      gain,
      loss,
      net,
      total_money: Math.round(this.total_money)
    };
  }

  record_trial(args: {
    deck: string | null;
    rt_s: number | null;
    timed_out: boolean;
    gain: number;
    loss: number;
    net: number;
  }): void {
    this.trial_count_total += 1;
    this.trial_count_block += 1;
    const deckId = String(args.deck ?? "")
      .trim()
      .toLowerCase();
    for (const bucket of [this.total_bucket, this.block_bucket]) {
      bucket.n += 1;
      bucket.gain_sum += Math.round(args.gain);
      bucket.loss_sum += Math.round(args.loss);
      bucket.net_sum += Math.round(args.net);
      if (args.timed_out) {
        bucket.timeouts += 1;
      } else {
        bucket.responses += 1;
      }
      if (ALL_DECKS.includes(deckId as DeckId)) {
        const deckKey = deckId as DeckId;
        bucket[deckKey] += 1;
        if (ADVANTAGEOUS_DECKS.has(deckKey)) {
          bucket.adv += 1;
        }
      }
      if (!args.timed_out && args.rt_s != null && Number.isFinite(args.rt_s)) {
        const rt = Math.max(0, Number(args.rt_s));
        bucket.rt_sum += rt;
        bucket.rt_n += 1;
      }
    }
    if (this.enable_logging) {
      console.debug(
        [
          "[IGT]",
          `block=${this.block_idx}`,
          `trial_block=${this.trial_count_block}`,
          `trial_total=${this.trial_count_total}`,
          `deck=${deckId || "none"}`,
          `timed_out=${args.timed_out}`,
          `gain=${Math.round(args.gain)}`,
          `loss=${Math.round(args.loss)}`,
          `net=${Math.round(args.net)}`,
          `total=${this.total_money}`
        ].join(" ")
      );
    }
  }
}

