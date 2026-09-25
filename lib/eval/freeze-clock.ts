// DEV ONLY. Freezes the server clock so engine-computed deadlines are reproducible.
//
// The obligation engine calls new Date() internally and is on the do-not-touch list, so the
// clock is frozen around it rather than threaded through it. With the seed pinned to the same
// date, every eval run sees identical inputs: E-05's notice is due today, every run, forever.
//
// Only new Date() and Date.now() change. new Date("2026-08-31"), date arithmetic and parsing
// all behave normally.
//
// Loaded by instrumentation.ts at server start. No-op unless EVAL_TODAY is set, and never in
// production.

const iso = process.env.EVAL_TODAY;

if (iso && process.env.NODE_ENV !== "production") {
  const frozen = new Date(`${iso}T09:00:00.000Z`).getTime();

  if (Number.isNaN(frozen)) {
    console.error(`[eval] EVAL_TODAY="${iso}" is not a valid YYYY-MM-DD date — clock not frozen.`);
  } else {
    const RealDate = Date;

    class FrozenDate extends RealDate {
      constructor(...args: any[]) {
        // @ts-expect-error — variadic pass-through to the real Date constructor
        super(...(args.length === 0 ? [frozen] : args));
      }
      static now(): number {
        return frozen;
      }
    }

    globalThis.Date = FrozenDate as unknown as DateConstructor;
    console.warn(`[eval] SERVER CLOCK FROZEN AT ${iso}. Unset EVAL_TODAY for normal use.`);
  }
}

export {};