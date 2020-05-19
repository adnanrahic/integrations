const { RateLimit } = require("async-sema");
const auth = require("../../lib/auth");
const {
  AUDIT_DEPLOYMENTS_COUNT,
  AUDIT_DEPLOYMENTS_CREATED_AFTER
} = require("../../lib/constants");
const fetchDeployments = require("../../lib/fetch-deployments");
const mongo = require("../../lib/mongo");
const runAudits = require("../../lib/run-audits");
const sleep = require("../../lib/sleep");

const limitUpdate = RateLimit(1);

async function update({ accessToken, id }) {
  const isTeam = id.startsWith("team_");

  await limitUpdate();

  console.log(`fetching deployments for ${id}`);

  // recent deployments
  let deployments = await fetchDeployments({
    accessToken,
    limit: AUDIT_DEPLOYMENTS_COUNT,
    since: Date.now() - AUDIT_DEPLOYMENTS_CREATED_AFTER,
    teamId: isTeam ? id : null
  }).catch(async err => {
    if (err.res && err.res.status === 403) {
      console.log(
        `Ignoring deployments for ${id}. The token is not valid anymore`
      );
      const db = await mongo();
      await db
        .collection(isTeam ? "teams" : "users")
        .updateOne({ id }, { $set: { accessToken: null } });
      return;
    }

    throw err;
  });
  if (!deployments) return;

  deployments = deployments.filter(d => d.state === "READY");
  if (!deployments.length) return;

  const deploymentIds = deployments.map(d => d.uid);

  console.log(
    `getting existing deployment docs for ${id}: ${deploymentIds.length}`
  );

  const db = await mongo();
  const deploymentsCollection = db.collection("deployments");

  // deployment docs to audit
  const [existingDeploymentDocs, deploymentDocs] = await Promise.all([
    deploymentsCollection
      .find(
        {
          id: { $in: deploymentIds }
        },
        {
          projection: { id: 1 }
        }
      )
      .toArray(),
    deploymentsCollection
      .find(
        {
          ownerId: id,
          auditing: { $ne: null }
        },
        {
          projection: { id: 1, url: 1 }
        }
      )
      .toArray()
  ]);

  const existingIds = new Set(existingDeploymentDocs.map(d => d.id));
  deployments = deployments.filter(d => !existingIds.has(d.uid));

  const deploymentsToAudit = new Map([
    ...deployments.map(d => [d.uid, { id: d.uid, url: d.url, ownerId: id }]),
    ...deploymentDocs.map(d => [d.id, { id: d.id, url: d.url, ownerId: id }])
  ]);

  console.log(`auditing deployments: ${deploymentsToAudit.size}`);

  runAudits([...deploymentsToAudit.values()]).catch(console.error);

  await sleep(500);
}

async function handler(req, res) {
  const owners = Array.isArray(req.body) ? req.body : [req.body];

  for (const o of owners) {
    if (!o || !o.accessToken || !o.id) {
      res.statusCode = 400;
      res.end("Missing required properties: accessToken, id");
      return;
    }
  }

  await Promise.all(owners.map(update));

  res.end("ok");
}

module.exports = mongo.withClose(auth(handler));
