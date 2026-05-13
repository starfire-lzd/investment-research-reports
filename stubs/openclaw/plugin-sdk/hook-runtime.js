export function fireAndForgetHook(promise, label = "hook failed") {
  Promise.resolve(promise).catch((err) => {
    console.error(`${label}: ${String(err)}`);
  });
}

export function buildCanonicalSentMessageHookContext(ctx) {
  return ctx;
}

export function toPluginMessageContext(ctx) {
  return ctx;
}

export function toPluginMessageSentEvent(ctx) {
  return ctx;
}
