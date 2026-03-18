import {
  set_trial_context,
  type StimBank,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

import {
  ADVANTAGEOUS_DECKS,
  Controller,
  DECK_A,
  DECK_B,
  DECK_C,
  DECK_D,
  type DeckId
} from "./controller";

interface TrialOutcome {
  chosen_deck: DeckId | null;
  response_key: string;
  timed_out: boolean;
  rt_s: number | null;
  gain: number;
  loss: number;
  net_outcome: number;
  draw_index: number;
  balance_before: number;
  balance_after: number;
  advantageous_choice: boolean;
  deck_label: string;
  feedback_type: "feedback_outcome" | "feedback_timeout";
  net_signed: string;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function formatSigned(value: number): string {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

function resolveDeckKeys(settings: TaskSettings): Record<DeckId, string> {
  return {
    [DECK_A]: normalizeKey(settings.deck_a_key ?? "d"),
    [DECK_B]: normalizeKey(settings.deck_b_key ?? "f"),
    [DECK_C]: normalizeKey(settings.deck_c_key ?? "j"),
    [DECK_D]: normalizeKey(settings.deck_d_key ?? "k")
  };
}

function resolveDeckLabels(settings: TaskSettings): Record<DeckId, string> {
  const raw = toRecord(settings.deck_labels);
  return {
    [DECK_A]: String(raw[DECK_A] ?? "A"),
    [DECK_B]: String(raw[DECK_B] ?? "B"),
    [DECK_C]: String(raw[DECK_C] ?? "C"),
    [DECK_D]: String(raw[DECK_D] ?? "D")
  };
}

function responseKeys(deckKeys: Record<DeckId, string>): string[] {
  return [deckKeys[DECK_A], deckKeys[DECK_B], deckKeys[DECK_C], deckKeys[DECK_D]];
}

function deckFromKey(responseKey: string, deckKeys: Record<DeckId, string>): DeckId | null {
  const key = normalizeKey(responseKey);
  if (key === deckKeys[DECK_A]) {
    return DECK_A;
  }
  if (key === deckKeys[DECK_B]) {
    return DECK_B;
  }
  if (key === deckKeys[DECK_C]) {
    return DECK_C;
  }
  if (key === deckKeys[DECK_D]) {
    return DECK_D;
  }
  return null;
}

function getOutcome(snapshot: TrialSnapshot): TrialOutcome | null {
  const value = snapshot.units.trial_outcome?.outcome_payload;
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as TrialOutcome;
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    controller: Controller;
    block_id: string;
    block_idx: number;
  }
): TrialBuilder {
  const { settings, stimBank, controller, block_id, block_idx } = context;
  const conditionName = Controller.parse_condition(condition);
  const trialId = controller.next_trial_id();
  const triggerMap = (settings.triggers ?? {}) as Record<string, unknown>;
  const deckKeys = resolveDeckKeys(settings);
  const deckLabels = resolveDeckLabels(settings);
  const decisionKeys = responseKeys(deckKeys);
  const balanceBefore = Math.round(controller.total_money);

  const fixationDuration = controller.sample_duration(settings.fixation_duration, 0.4);
  const decisionDeadline = Math.max(0.2, Number(settings.decision_deadline ?? 3.5));
  const feedbackDuration = Math.max(0.1, Number(settings.feedback_duration ?? 1.1));
  const itiDuration = controller.sample_duration(settings.iti_duration, 0.45);

  const fixation = trial.unit("fixation").addStim(stimBank.get("fixation"));
  set_trial_context(fixation, {
    trial_id: trialId,
    phase: "fixation",
    deadline_s: fixationDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "fixation",
      block_idx
    },
    stim_id: "fixation"
  });
  fixation
    .show({
      duration: fixationDuration
    })
    .to_dict();

  const decision = trial
    .unit("decision")
    .addStim(stimBank.get("decision_title"))
    .addStim(
      stimBank.get_and_format("balance_text", {
        current_total: balanceBefore
      })
    )
    .addStim(stimBank.get("deck_a_rect"))
    .addStim(stimBank.get("deck_b_rect"))
    .addStim(stimBank.get("deck_c_rect"))
    .addStim(stimBank.get("deck_d_rect"))
    .addStim(
      stimBank.get_and_format("deck_a_label", {
        deck_a_key: deckKeys[DECK_A].toUpperCase()
      })
    )
    .addStim(
      stimBank.get_and_format("deck_b_label", {
        deck_b_key: deckKeys[DECK_B].toUpperCase()
      })
    )
    .addStim(
      stimBank.get_and_format("deck_c_label", {
        deck_c_key: deckKeys[DECK_C].toUpperCase()
      })
    )
    .addStim(
      stimBank.get_and_format("deck_d_label", {
        deck_d_key: deckKeys[DECK_D].toUpperCase()
      })
    )
    .addStim(stimBank.get("key_hint"));
  set_trial_context(decision, {
    trial_id: trialId,
    phase: "decision",
    deadline_s: decisionDeadline,
    valid_keys: decisionKeys,
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "decision",
      deck_a_key: deckKeys[DECK_A],
      deck_b_key: deckKeys[DECK_B],
      deck_c_key: deckKeys[DECK_C],
      deck_d_key: deckKeys[DECK_D],
      current_total: balanceBefore,
      block_idx
    },
    stim_id: "decision_title+balance_text+deck_rects+deck_labels+key_hint"
  });
  decision
    .captureResponse({
      keys: decisionKeys,
      correct_keys: decisionKeys,
      duration: decisionDeadline,
      response_trigger: {
        [deckKeys[DECK_A]]: Number(triggerMap.choice_deck_a ?? 31),
        [deckKeys[DECK_B]]: Number(triggerMap.choice_deck_b ?? 32),
        [deckKeys[DECK_C]]: Number(triggerMap.choice_deck_c ?? 33),
        [deckKeys[DECK_D]]: Number(triggerMap.choice_deck_d ?? 34)
      },
      timeout_trigger: Number(triggerMap.choice_timeout ?? 35)
    })
    .set_state({
      response_key: (snapshot: TrialSnapshot) =>
        normalizeKey(snapshot.units.decision?.response),
      timed_out: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.decision?.response);
        return !decisionKeys.includes(key);
      },
      chosen_deck: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.decision?.response);
        return deckFromKey(key, deckKeys);
      },
      rt_s: (snapshot: TrialSnapshot) => {
        const rt = Number(snapshot.units.decision?.rt);
        return Number.isFinite(rt) ? rt : null;
      }
    })
    .to_dict();

  const trialOutcome = trial.unit("trial_outcome");
  set_trial_context(trialOutcome, {
    trial_id: trialId,
    phase: "trial_outcome",
    deadline_s: 0,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "trial_outcome",
      block_idx
    },
    stim_id: "trial_outcome"
  });
  trialOutcome
    .show({
      duration: 0
    })
    .set_state({
      outcome_payload: (snapshot: TrialSnapshot) => {
        const responseKey = normalizeKey(snapshot.units.decision?.response_key);
        const chosenDeck = deckFromKey(responseKey, deckKeys);
        const rt = Number(snapshot.units.decision?.rt_s);
        const rtS = Number.isFinite(rt) ? rt : null;
        const timedOut = chosenDeck == null;
        if (timedOut) {
          return {
            chosen_deck: null,
            response_key: "",
            timed_out: true,
            rt_s: rtS,
            gain: 0,
            loss: 0,
            net_outcome: 0,
            draw_index: 0,
            balance_before: balanceBefore,
            balance_after: Math.round(controller.total_money),
            advantageous_choice: false,
            deck_label: "",
            feedback_type: "feedback_timeout",
            net_signed: "+0"
          } satisfies TrialOutcome;
        }
        const draw = controller.draw_from_deck(chosenDeck);
        return {
          chosen_deck: chosenDeck,
          response_key: responseKey,
          timed_out: false,
          rt_s: rtS,
          gain: draw.gain,
          loss: draw.loss,
          net_outcome: draw.net,
          draw_index: draw.draw_index,
          balance_before: balanceBefore,
          balance_after: draw.total_money,
          advantageous_choice: ADVANTAGEOUS_DECKS.has(chosenDeck),
          deck_label: deckLabels[chosenDeck],
          feedback_type: "feedback_outcome",
          net_signed: formatSigned(draw.net)
        } satisfies TrialOutcome;
      }
    });

  const feedback = trial.unit("feedback").addStim((snapshot: TrialSnapshot) => {
    const outcome = getOutcome(snapshot);
    if (!outcome || outcome.feedback_type === "feedback_timeout") {
      return stimBank.get_and_format("feedback_timeout", {
        balance_after: Math.round(outcome?.balance_after ?? controller.total_money)
      });
    }
    return stimBank.get_and_format("feedback_outcome", {
      deck_label: outcome.deck_label,
      gain: outcome.gain,
      loss: outcome.loss,
      net_signed: outcome.net_signed,
      balance_after: outcome.balance_after
    });
  });
  set_trial_context(feedback, {
    trial_id: trialId,
    phase: "feedback",
    deadline_s: feedbackDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "feedback",
      block_idx
    },
    stim_id: "feedback"
  });
  feedback
    .show({
      duration: feedbackDuration
    })
    .set_state({
      chosen_deck: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.chosen_deck ?? "",
      response_key: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.response_key ?? "",
      timed_out: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.timed_out ?? true,
      rt_s: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.rt_s ?? null,
      decision_rt_s: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.rt_s ?? null,
      decision_timed_out: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.timed_out ?? true,
      gain: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.gain ?? 0,
      loss: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.loss ?? 0,
      net_outcome: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.net_outcome ?? 0,
      draw_index: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.draw_index ?? 0,
      balance_before: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.balance_before ?? balanceBefore,
      balance_after: (snapshot: TrialSnapshot) =>
        Math.round(getOutcome(snapshot)?.balance_after ?? controller.total_money),
      advantageous_choice: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.advantageous_choice ?? false
    })
    .to_dict();

  const iti = trial.unit("iti").addStim(stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trialId,
    phase: "iti",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "iti",
      block_idx
    },
    stim_id: "fixation"
  });
  iti
    .show({
      duration: itiDuration
    })
    .to_dict();

  trial.finalize((snapshot, _runtime, helpers) => {
    const outcome = getOutcome(snapshot);
    const chosenDeck = outcome?.chosen_deck ?? null;
    const rtS = outcome?.rt_s ?? null;
    const timedOut = outcome?.timed_out ?? true;
    const gain = outcome?.gain ?? 0;
    const loss = outcome?.loss ?? 0;
    const netOutcome = outcome?.net_outcome ?? 0;

    helpers.setTrialState("condition", conditionName);
    helpers.setTrialState("condition_id", conditionName);
    helpers.setTrialState("trial_id", trialId);
    helpers.setTrialState("block_idx", block_idx);
    helpers.setTrialState("chosen_deck", chosenDeck ?? "");
    helpers.setTrialState("response_key", outcome?.response_key ?? "");
    helpers.setTrialState("timed_out", timedOut);
    helpers.setTrialState("rt_s", rtS);
    helpers.setTrialState("decision_rt_s", rtS);
    helpers.setTrialState("decision_timed_out", timedOut);
    helpers.setTrialState("gain", gain);
    helpers.setTrialState("loss", loss);
    helpers.setTrialState("net_outcome", netOutcome);
    helpers.setTrialState("draw_index", outcome?.draw_index ?? 0);
    helpers.setTrialState("balance_before", outcome?.balance_before ?? balanceBefore);
    helpers.setTrialState("balance_after", outcome?.balance_after ?? Math.round(controller.total_money));
    helpers.setTrialState("advantageous_choice", outcome?.advantageous_choice ?? false);

    controller.record_trial({
      deck: chosenDeck,
      rt_s: rtS,
      timed_out: timedOut,
      gain,
      loss,
      net: netOutcome
    });
  });

  return trial;
}

