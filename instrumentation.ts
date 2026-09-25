// Runs once at server start, before route handlers and server components load.
// If you already have an instrumentation.ts, add the import line to your existing register().
 
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/eval/freeze-clock");
  }
}
 