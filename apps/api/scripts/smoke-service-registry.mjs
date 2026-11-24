// Disposable compiled-runtime smoke. Never uses a real account, DB or signing key.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID, createPublicKey, verify } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const directory = mkdtempSync(join(tmpdir(), "mira-registry-smoke-"));
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const { privateKey } = generateKeyPairSync("ed25519");
const env = {
  PATH: process.env.PATH ?? "",
  HOST: "127.0.0.1", PORT: String(port), LOG_LEVEL: "error",
  MIRA_AUTH_DB_PATH: join(directory, "auth.sqlite"),
  MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_KID: "isolated-smoke",
  MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_PRIVATE_KEY: privateKey.export({type:"pkcs8",format:"pem"}).toString(),
  MIRA_AUTH_SERVICE_CREDENTIAL_TTL_SECONDS: "300",
};
const root = "http://127.0.0.1:" + port;
let runtime;
function admin(args, input = "") {
  return JSON.parse(execFileSync(process.execPath, ["dist/admin-cli.js", ...args], {env,input,encoding:"utf8"}));
}
async function request(path, token, body) {
  return fetch(root + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {...(token ? {authorization:"Bearer " + token}:{}), ...(body === undefined ? {} : {"content-type":"application/json"})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
    signal: AbortSignal.timeout(5000),
  });
}
async function login(username, password) {
  const res = await request("/v1/auth/login", null, {username,password});
  assert.equal(res.status,200);
  const session = await res.json();
  const registration = await request("/v1/devices",session.sessionToken,{installationId:randomUUID(),platform:"mobile"});
  assert.equal(registration.status,200);
  const device = await registration.json();
  const bound = await request("/v1/auth/session",session.sessionToken);
  assert.equal(bound.status,200);
  assert.equal((await bound.json()).deviceId,device.id);
  return {...session,deviceId:device.id};
}
try {
  const password = randomBytes(32).toString("hex");
  const alice = admin(["provision","registry-smoke-a"],password);
  const bob = admin(["provision","registry-smoke-b"],password);
  const service = {
    serviceId:"notes",projectId:"fixture",displayName:"Notes",
    protocol:{name:"mcp",version:"2025-11-25",endpoint:"https://notes.example/mcp"},
    audience:"mira:service:notes",scopes:["service:notes:read"],
  };
  assert.equal(admin(["service-register",alice.id],JSON.stringify(service)).revision,1);
  assert.equal(admin(["service-register",alice.id],JSON.stringify(service)).revision,1);
  assert.equal(admin(["service-register",alice.id],JSON.stringify({...service,serviceId:"archive",protocol:{name:"http",version:"1",endpoint:"https://archive.example/api"},audience:"mira:service:archive",scopes:["service:archive:read"]})).revision,1);
  runtime = spawn(process.execPath, ["dist/server.js"], {env,stdio:"ignore"});
  for(let i=0;i<30;i++){
    try { if((await request("/ready")).ok) break; } catch {}
    await delay(200);
  }
  assert.equal((await request("/ready")).status,200);
  assert.equal((await request("/v1/services")).status,401);
  const a=await login("registry-smoke-a",password), b=await login("registry-smoke-b",password);
  assert.equal(a.account.id,alice.id); assert.equal(b.account.id,bob.id);
  const catalog=await (await request("/v1/services",a.sessionToken)).json();
  assert.deepEqual(catalog.services.map(x=>x.definition.serviceId),["archive","notes"]);
  assert.deepEqual((await (await request("/v1/services",b.sessionToken)).json()).services,[]);
  assert.equal((await request("/v1/services/notes/credential",b.sessionToken,{expectedRevision:1})).status,404);
  const issued=await request("/v1/services/notes/credential",a.sessionToken,{expectedRevision:1});
  assert.equal(issued.status,200);
  const ticket=await issued.json();
  const jwks=await (await request("/.well-known/jwks.json")).json();
  const [h,p,s]=ticket.token.split(".");
  const header=JSON.parse(Buffer.from(h,"base64url")), claims=JSON.parse(Buffer.from(p,"base64url"));
  const jwk=jwks.keys.find(k=>k.kid===header.kid);
  assert.ok(verify(null,Buffer.from(h+"."+p),createPublicKey({key:jwk,format:"jwk"}),Buffer.from(s,"base64url")));
  assert.equal(claims.aud,service.audience); assert.equal(claims.sub,alice.id);
  assert.equal(claims.device_id,a.deviceId); assert.deepEqual(claims.scope,service.scopes);
  assert.equal(admin(["service-revoke",alice.id,"notes","1"]).revision,2);
  assert.equal((await request("/v1/services/notes/credential",a.sessionToken,{expectedRevision:1})).status,404);
  assert.deepEqual((await (await request("/v1/services",a.sessionToken)).json()).services.map(x=>x.definition.serviceId),["archive"]);
  assert.equal((await request("/v1/auth/logout",a.sessionToken,{})).status,204);
  assert.equal((await request("/v1/services/archive/credential",a.sessionToken,{expectedRevision:1})).status,401);
  console.log("OPS-047 isolated compiled HTTP smoke PASS: admin registration, two protocols, account isolation, real signed credential/JWKS, revoke, logout");
} finally {
  if(runtime && runtime.exitCode===null){runtime.kill(); await once(runtime,"exit");}
  rmSync(directory,{recursive:true,force:true});
}
