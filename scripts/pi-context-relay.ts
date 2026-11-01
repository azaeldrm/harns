import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export default function (pi: any) {
  let timer: ReturnType<typeof setInterval> | undefined;
  function publish(ctx: any) {
    const address = process.env.HC_TERMINAL_ID?.split('/').pop();
    if (!address || !/^t[0-9a-z]+$/.test(address)) return;
    try {
      const usage = ctx.getContextUsage();
      const root = path.join(os.homedir(), '.config', 'harness', 'context');
      fs.mkdirSync(root, { recursive: true });
      const target = path.join(root, `${address}.pi.json`);
      const value = { address, tool: 'pi', sessionId: ctx.sessionManager.getSessionId(),
        tokens: usage?.tokens ?? null, contextWindow: usage?.contextWindow ?? null,
        percent: usage?.percent ?? null, updatedAt: Date.now() / 1000 };
      fs.writeFileSync(target + '.tmp', JSON.stringify(value));
      fs.renameSync(target + '.tmp', target);
    } catch { /* Missing context stays unknown. */ }
  }
  pi.on('session_start', (_event: any, ctx: any) => {
    if (timer) clearInterval(timer);
    publish(ctx);
    timer = setInterval(() => publish(ctx), 1000);
    timer.unref();
  });
  for (const event of ['agent_end', 'session_compact', 'model_select'])
    pi.on(event, (_event: any, ctx: any) => publish(ctx));
  pi.on('session_shutdown', () => { if (timer) clearInterval(timer); });
}
