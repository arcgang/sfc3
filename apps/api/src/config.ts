export interface Config {
  port: number;
  jwtSecret: string;
}

export function buildConfig(env: Record<string, string | undefined>): Config {
  const jwtSecret = env["JWT_SECRET"];
  if (!jwtSecret) {
    throw new Error("Missing required environment variable: JWT_SECRET");
  }
  return {
    port: env["PORT"] ? Number(env["PORT"]) : 3000,
    jwtSecret,
  };
}
