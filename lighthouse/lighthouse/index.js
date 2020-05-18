const { promisify } = require("util");
const mql = require("@microlink/mql");
const zlib = require("zlib");

const mongo = require("../lib/mongo");
const auth = require("../lib/auth");

const gzip = promisify(zlib.gzip);

const ReportGenerator = require("lighthouse/lighthouse-core/report/report-generator");

const WHITELIST_ERRORS = ["EBRWSRTIMEOUT", "EMAXREDIRECTS"];

const getScores = (categories) =>
  Object.values(categories).reduce(
    (acc, category) => ({
      ...acc,
      [category.id]: category.score,
    }),
    {}
  );

const createHandler = ({ gzip, mongo }) => async (req, res) => {
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

  let lhError;
  let report;

  try {
    const { data } = await mql(`https://${url}`, {
      apiKey: process.env.MICROLINK_API_KEY,
      ttl: process.env.MICROLINK_API_KEY ? "30d" : undefined,
      meta: false,
      retry: 10,
      filter: "insights",
      insights: {
        technologies: false,
        lighthouse: true,
      },
    });

    report = data.insights.lighthouse;
  } catch (err) {
    if (WHITELIST_ERRORS.includes(err.code)) {
      console.log(`error: ${err.code} ${id}, ${url}`);
      lhError = err.code;
    } else {
      throw err;
    }
  }

  let reportHtml;
  let scores;

  if (report) {
    scores = getScores(report.categories);
    reportHtml = await gzip(ReportGenerator.generateReportHtml(report));
  }

  console.log(`saving deployment: ${id}, ${url}`);

  const db = await mongo();
  await db.collection("deployments").updateOne(
    {
      id,
    },
    {
      $set: {
        id,
        url,
        ownerId,
        scores,
        report: reportHtml,
        lhError,
        auditing: null,
      },
      $setOnInsert: {
        createdAt: Date.now(),
      },
    },
    {
      upsert: true,
    }
  );

  res.end("ok");
};

module.exports = mongo.withClose(
  auth(
    createHandler({
      mongo,
      gzip,
    })
  )
);
module.exports.createHandler = createHandler;
