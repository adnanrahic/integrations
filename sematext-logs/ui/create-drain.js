const createLogDrain = require("../lib/create-log-drain");
const getMetadata = require("../lib/get-metadata");
const route = require("../lib/route");

module.exports = async arg => {
  const { payload } = arg;
  const { clientState, configurationId, teamId, token } = payload;
  const { name, projectId, logsToken, region } = clientState;

  const urlEu = 'https://logsene-k8s-audit-receiver.eu.sematext.com';
  const urlUs = 'https://logsene-k8s-audit-receiver.sematext.com';
  let url = `${urlUs}/${logsToken}`;
  if (region === 'eu') {
    url = `${urlEu}/${logsToken}`;
  }

  console.log("getting metadata");
  const metadata = await getMetadata({ configurationId, token, teamId });

  console.log("creating a new log drain");
  try {
    await createLogDrain(
      {
        token: metadata.token,
        teamId
      },
      {
        name,
        projectId: projectId || null,
        type: "json",
        url
      }
    );
  } catch (err) {
    if (err.body && err.body.error) {
      return route(arg, "new-drain", {
        errorMessage: err.body.error.message
      });
    } else {
      throw err;
    }
  }

  return route(arg, "list-drains");
};
