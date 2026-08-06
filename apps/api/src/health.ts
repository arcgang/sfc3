export interface Health {
  status: "ok";
  uptimeSeconds: number;
}

/** Service health payload — the readiness/liveness probe returns this. */
export function health(uptimeSeconds: number = Math.floor(process.uptime())): Health {
  return { status: "ok", uptimeSeconds };
}
