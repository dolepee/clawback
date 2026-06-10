"use client";

import { useEffect, useState } from "react";
import { EXPLORER } from "@/lib/addresses";
import { shortHex } from "@/lib/format";

type ReplayStep = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  meta: string;
  tx?: `0x${string}`;
};

type SettlementReplayProps = {
  claimId: string;
  agentHandle: string;
  agentRight: boolean;
  callText: string;
  bondLabel: string;
  unlockLabel: string;
  thresholdLabel?: string;
  settlementPriceLabel?: string;
  publishTimeLabel?: string;
  moneyLabel: string;
  moneyDetail: string;
  commitTx?: `0x${string}`;
  settleTx?: `0x${string}`;
  finalTx?: `0x${string}`;
};

function explorerLink(tx: `0x${string}`, label: string) {
  return (
    <a href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer" className="tx-link">
      {label}
      <span aria-hidden>↗</span>
    </a>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export default function SettlementReplay({
  claimId,
  agentHandle,
  agentRight,
  callText,
  bondLabel,
  unlockLabel,
  thresholdLabel,
  settlementPriceLabel,
  publishTimeLabel,
  moneyLabel,
  moneyDetail,
  commitTx,
  settleTx,
  finalTx,
}: SettlementReplayProps) {
  const reducedMotion = useReducedMotion();
  const steps: ReplayStep[] = [
    {
      id: "commit",
      eyebrow: "01 · Commit",
      title: "Bond locked",
      body: `${agentHandle} committed ${callText} and put ${bondLabel} behind the call.`,
      meta: `Unlocks recorded: ${unlockLabel}`,
      tx: commitTx,
    },
    {
      id: "oracle",
      eyebrow: "02 · Oracle",
      title: "Pyth prints the market",
      body: `Settlement checks ${settlementPriceLabel ?? "the recorded Pyth price"} against ${thresholdLabel ?? "the claim threshold"}.`,
      meta: publishTimeLabel ? `Publish time: ${publishTimeLabel}` : "Pyth proof stored onchain",
      tx: settleTx,
    },
    {
      id: "outcome",
      eyebrow: "03 · Outcome",
      title: agentRight ? "RIGHT" : "WRONG",
      body: agentRight
        ? "The oracle result landed on the agent side of the prediction."
        : "The oracle result landed against the model, so the bond became refund capital.",
      meta: agentRight ? "Reputation win recorded" : "Slashing path opened",
      tx: settleTx,
    },
    {
      id: "money",
      eyebrow: "04 · Money",
      title: agentRight ? "Agent paid" : "Buyer refunded",
      body: moneyDetail,
      meta: moneyLabel,
      tx: finalTx,
    },
  ];
  const [activeStep, setActiveStep] = useState(steps.length - 1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (reducedMotion) {
      setActiveStep(steps.length - 1);
      setPlaying(false);
      return;
    }
    if (activeStep >= steps.length - 1) {
      const doneTimer = window.setTimeout(() => setPlaying(false), 260);
      return () => window.clearTimeout(doneTimer);
    }
    const timer = window.setTimeout(() => setActiveStep((step) => step + 1), 1050);
    return () => window.clearTimeout(timer);
  }, [activeStep, playing, reducedMotion, steps.length]);

  function replay() {
    if (reducedMotion) {
      setActiveStep(steps.length - 1);
      setPlaying(false);
      return;
    }
    setActiveStep(0);
    setPlaying(true);
  }

  const active = steps[activeStep] ?? steps[steps.length - 1];

  return (
    <section className={`settlement-replay settlement-replay-${agentRight ? "right" : "wrong"}`} aria-label={`Settlement replay for claim ${claimId}`}>
      <div className="settlement-replay-copy">
        <div>
          <div className="detail-kicker">Replay settlement</div>
          <h2>{agentRight ? "Right call, payout cleared." : "Wrong call, refund cleared."}</h2>
          <p>
            A judge can replay the receipt path inline: commit, oracle print, outcome, and the final money movement.
          </p>
        </div>
        <button type="button" onClick={replay} disabled={playing} aria-live="polite">
          {playing ? "Replaying..." : reducedMotion ? "Show final state" : "Replay settlement"}
        </button>
      </div>

      <div className="settlement-replay-stage">
        <div className="settlement-replay-active" aria-live="polite">
          <span>{active.eyebrow}</span>
          <strong>{active.title}</strong>
          <p>{active.body}</p>
          <em>{active.meta}</em>
          {active.tx ? <div>{explorerLink(active.tx, `Open ${active.id} tx`)}</div> : null}
        </div>
        <div className="settlement-replay-steps" aria-label="Settlement replay steps">
          {steps.map((step, index) => {
            const state = index === activeStep ? "active" : index < activeStep ? "complete" : "idle";
            return (
              <div className={`settlement-replay-step settlement-replay-step-${state}`} key={step.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.meta}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settlement-replay-links">
        {commitTx ? explorerLink(commitTx, `Commit ${shortHex(commitTx, 5, 4)}`) : null}
        {settleTx ? explorerLink(settleTx, `Settle ${shortHex(settleTx, 5, 4)}`) : null}
        {finalTx ? explorerLink(finalTx, `${agentRight ? "Payout" : "Refund"} ${shortHex(finalTx, 5, 4)}`) : null}
      </div>
    </section>
  );
}
