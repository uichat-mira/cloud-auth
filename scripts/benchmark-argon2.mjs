import { argon2Sync, randomBytes } from "node:crypto";

const samples = Number(process.argv[2] ?? "5");
if (!Number.isInteger(samples) || samples < 1 || samples > 100) {
  throw new Error("samples must be an integer between 1 and 100");
}

const memoryKiB = Number(process.env.MIRA_AUTH_ARGON2_MEMORY_KIB ?? "19456");
const passes = Number(process.env.MIRA_AUTH_ARGON2_PASSES ?? "2");
const parallelism = Number(process.env.MIRA_AUTH_ARGON2_PARALLELISM ?? "1");

const message = Buffer.from("mira-cloud-auth-argon2-benchmark-password", "utf8");
const timings = [];

for (let index = 0; index < samples; index += 1) {
  const start = performance.now();
  argon2Sync("argon2id", {
    message,
    nonce: randomBytes(16),
    parallelism,
    tagLength: 32,
    memory: memoryKiB,
    passes,
  });
  timings.push(performance.now() - start);
}

const averageMs = timings.reduce((sum, value) => sum + value, 0) / timings.length;
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      samples,
      argon2id: { memoryKiB, passes, parallelism, tagLength: 32 },
      timingsMs: timings.map((value) => Number(value.toFixed(2))),
      averageMs: Number(averageMs.toFixed(2)),
      maxMs: Number(Math.max(...timings).toFixed(2)),
    },
    null,
    2,
  ),
);
