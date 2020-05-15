const { promisify } = require("util");
const mql = require("@microlink/mql");
const zlib = require("zlib");
const path = require("path");

const auth = require("../lib/auth");
const mongo = require("../lib/mongo");

const gzip = promisify(zlib.gzip);

const ReportGenerator = require(path.resolve(
  "node_modules/lighthouse/lighthouse-core/report/report-generator"
));

const getScores = (categories) =>
  Object.values(categories).reduce(
    (acc, category) => ({ ...acc, [category.id]: category.score }),
    {}
  );

async function handler(req, res) {
  let id;
  let url;
  let ownerId;

  try {
    ({ id, url, ownerId } = req.body);
  } catch (err) {
    res.statusCode = 400;
    res.end("Invalid JSON");
    return;
  }

  if (!id || !url || !ownerId) {
    res.statusCode = 400;
    res.end("Missing required properties: id, url or ownerId");
    return;
  }

  console.log(`generating report: ${id}, ${url}`);

  const { data } = await mql(`https://${url}`, {
    apiKey: process.env.MICROLINK_API_KEY,
    ttl: "30d",
    meta: false,
    retry: 10,
    filter: "insights",
    insights: {
      technologies: false,
      lighthouse: true
    }
  });

  const report = data.insights.lighthouse;
  let reportHtml;
  let scores;

  if (report) {
    scores = getScores(report.categories);
    reportHtml = await gzip(ReportGenerator.generateReportHtml(data));
  }

  console.log(`saving deployment: ${id}, ${url}`);

  const db = await mongo();
  await db.collection("deployments").updateOne(
    { id },
    {
      $set: {
        id,
        url,
        ownerId,
        scores,
        report: reportHtml,
        auditing: null
      },
      $setOnInsert: {
        createdAt: Date.now()
      }
    },
    { upsert: true }
  );

  res.end("ok");
}

module.exports = mongo.withClose(auth(handler));
