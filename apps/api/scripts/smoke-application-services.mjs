// Disposable compiled-runtime smoke. Never uses a real account, DB or signing key.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID, createPublicKey, createHash, verify } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

const directory = mkdtempSync(join(tmpdir(), "mira-instance-smoke-"));
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
    signal: AbortSignal.timeout(5000), redirect: "manual",
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

// Seed only the verified public manifest fixture in a disposable DB. The actual
// browser authorization, OAuth transaction, grants, device-bound HTTP issuance,
// JWKS and revoke below run against the packaged server, not mocked routes.
// Public registration transport has its own OPS-048/053 cross-service tests.
const manifest = id => {
  const origin = "https://" + id + ".example";
  return { schemaVersion:"1", appId:id, projectId:"smoke-mail", name:"Smoke mail",
    homeUrl:origin+"/", manifestRevision:1,
    oauth:{clientId:origin+"/oauth-client",redirectUris:[origin+"/auth/callback"]},
    registrationVerification:{endpoint:origin+"/verify"},
    services:[{serviceId:"mail",name:"Mail",type:"mcp",
      protocol:{name:"mcp",version:"2026-07-28",endpoint:origin+"/mcp"},
      resource:origin+"/mcp",scopes:["mail.read"]}] };
};
async function authorize(app, username, password) {
  const verifier = randomBytes(32).toString("base64url");
  const query = new URLSearchParams({response_type:"code",client_id:app.oauth.clientId,
    redirect_uri:app.oauth.redirectUris[0],state:randomBytes(24).toString("base64url"),
    code_challenge:createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method:"S256"});
  const page = await request("/v1/oauth/authorize?"+query);
  assert.equal(page.status,200);
  const cookie = page.headers.getSetCookie()[0].split(";")[0];
  query.set("csrf_token",cookie.split("=")[1]);
  query.set("manifest_revision","1");
  query.set("username",username);query.set("password",password);
  const authorized = await fetch(root+"/v1/oauth/authorize",{method:"POST",redirect:"manual",
    headers:{cookie,"content-type":"application/x-www-form-urlencoded"},body:query,
    signal:AbortSignal.timeout(5000)});
  assert.equal(authorized.status,303);
  const callback = new URL(authorized.headers.get("location"));
  assert.equal(callback.origin,new URL(app.homeUrl).origin);
  const token = await request("/v1/oauth/token",null,{grant_type:"authorization_code",
    client_id:app.oauth.clientId,redirect_uri:app.oauth.redirectUris[0],
    code:callback.searchParams.get("code"),code_verifier:verifier});
  assert.equal(token.status,200);
  const body=await token.json();
  assert.equal(body.appId,app.appId);
  assert.ok(body.access_token.startsWith("mas_v1."));
  assert.equal(body.sessionToken,undefined);
  return body.access_token;
}
try {
  const password=randomBytes(32).toString("hex");
  const alice=admin(["provision","instance-smoke-a"],password);
  const bob=admin(["provision","instance-smoke-b"],password);
  const appA=manifest("smoke-app-a"),appB=manifest("smoke-app-b");
  const db=new DatabaseSync(env.MIRA_AUTH_DB_PATH);
  try {
    const now=new Date().toISOString();
    for(const app of [appA,appB]){
      db.prepare("INSERT INTO application_instances(app_id,owner_account_id,origin,project_id,display_name,manifest_revision,manifest_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(app.appId,bob.id,new URL(app.homeUrl).origin,app.projectId,app.name,1,JSON.stringify(app),now,now);
    }
  } finally {db.close();}
  runtime=spawn(process.execPath,["dist/server.js"],{env,stdio:"ignore"});
  for(let i=0;i<30;i++){
    try{if((await request("/ready")).ok)break;}catch{}
    await delay(200);
  }
  assert.equal((await request("/ready")).status,200);
  const a=await login("instance-smoke-a",password),b=await login("instance-smoke-b",password);
  assert.equal(a.account.id,alice.id);assert.equal(b.account.id,bob.id);
  const catalog=async session=>{
    const response=await request("/v1/application-services",session.sessionToken);
    assert.equal(response.status,200);return (await response.json()).services;
  };
  assert.deepEqual(await catalog(a),[]);assert.deepEqual(await catalog(b),[]);
  const appSession=await authorize(appA,"instance-smoke-a",password);
  assert.equal((await request("/v1/oauth/application-session",appSession)).status,200);
  assert.equal((await request("/v1/application-services",appSession)).status,401);
  const [entry]=await catalog(a);
  assert.equal(entry.appId,appA.appId);assert.equal(entry.serviceId,"mail");
  assert.deepEqual(await catalog(b),[]);
  const path="/v1/application-services/"+appA.appId+"/mail";
  const body={resource:entry.resource,expectedRevision:entry.revision};
  assert.equal((await request(path+"/credential",b.sessionToken,body)).status,404);
  assert.equal((await request("/v1/application-services/"+appB.appId+"/mail/credential",a.sessionToken,
    {resource:appB.services[0].resource,expectedRevision:1})).status,404);
  const issued=await request(path+"/credential",a.sessionToken,body);
  assert.equal(issued.status,200);
  const ticket=await issued.json();
  const jwks=await (await request("/.well-known/jwks.json")).json();
  const [h,p,s]=ticket.token.split(".");
  const header=JSON.parse(Buffer.from(h,"base64url")),claims=JSON.parse(Buffer.from(p,"base64url"));
  const jwk=jwks.keys.find(k=>k.kid===header.kid);
  assert.ok(verify(null,Buffer.from(h+"."+p),createPublicKey({key:jwk,format:"jwk"}),Buffer.from(s,"base64url")));
  assert.equal(claims.app_id,appA.appId);assert.equal(claims.service_id,"mail");
  assert.equal(claims.aud,entry.resource);assert.equal(claims.resource,entry.resource);
  assert.equal(claims.sub,alice.id);assert.equal(claims.device_id,a.deviceId);
  assert.deepEqual(claims.scope,["mail.read"]);
  assert.equal((await request(path+"/revoke",a.sessionToken,body)).status,200);
  assert.equal((await request(path+"/credential",a.sessionToken,body)).status,404);
  assert.deepEqual(await catalog(a),[]);
  for(const [method,url] of [["GET","/v1/services"],["POST","/v1/services/mail/credential"],
    ["POST","/v1/services/mail/revoke"],["GET","/v1/application/services"],
    ["PUT","/v1/application/services/mail"],["POST","/v1/application/services/mail/retire"]]){
    const res=await fetch(root+url,{method,headers:{authorization:"Bearer "+a.sessionToken},
      signal:AbortSignal.timeout(5000)});
    assert.equal(res.status,404,method+" "+url);
  }
  for(const audience of ["mira:who-you","mira:service:mail"]){
    assert.equal((await request("/v1/service-credentials",a.sessionToken,{audience})).status,400);
  }
  assert.equal((await request("/v1/service-credentials",a.sessionToken,{audience:"mira:cloud-shiyan"})).status,200);
  assert.equal((await request("/v1/auth/logout",a.sessionToken,{})).status,204);
  assert.equal((await request("/v1/application-services",a.sessionToken)).status,401);
  console.log("OPS-052 packaged HTTP smoke PASS: real OAuth and instance grants, signed JWT/JWKS, account/instance isolation, revoke, retired V0 rejection, native issuance and logout");
} finally {
  if(runtime && runtime.exitCode===null){runtime.kill();await once(runtime,"exit");}
  rmSync(directory,{recursive:true,force:true});
}
