const { htm } = require("@zeit/integration-utils");
const getProjects = require("../lib/get-projects");

module.exports = async (arg, { state }) => {
  const { payload } = arg;
  const { clientState, teamId, token } = payload;
  const { name = "", projectId = "", logsToken = "", region = "us" } = clientState;
  const { errorMessage } = state;

  const projects = await getProjects({ token, teamId });

  return htm`
    <Page>
      <P><Link action="list-drains">Back to list</Link></P>
      
      <Fieldset>
        <FsContent>
          <H2>Project Filtering</H2>
          <P>Subscribe to logs from a single project. If left empty will subscribe to all projects. (optional)</P>
          <ProjectSwitcher message="Select a project" />
        </FsContent>
      </Fieldset>
      <Fieldset>
        <FsContent>
          <H2>Create Your Sematext Account</H2>
          <P>Visit <Link href="https://apps.sematext.com/ui/registration" target="_blank">Sematext</Link> and create an account.</P>
        </FsContent>
        <FsFooter>
          If you already have an account, you can use that account instead.
        </FsFooter>
      </Fieldset>

      <Fieldset>
        <FsContent>
          <H2>Select Region</H2>
          <P>The region you chose when creating your account.</P>
          <Select name="region" value=${region}>
            <Option value="us" caption="US" />
            <Option value="eu" caption="EU" />
          </Select>
        </FsContent>
      </Fieldset>

      <Fieldset>
        <FsContent>
          <H2>Logs App Name</H2>
          <P>Add a name for this Log Drain so you can keep track of different Logs Apps.</P>
          <Input name="name" value=${name} width="100%" />
        </FsContent>
      </Fieldset>

      <Fieldset>
        <FsContent>
          <H2>Logs App Token</H2>
          <P>Add your Logs App Token. You can find the token in the integrations section of the Sematext Logs UI.</P>
          <Input name="logsToken" value=${logsToken} width="100%" />
        </FsContent>
      </Fieldset>

      ${errorMessage ? htm`<Notice type="error">${errorMessage}</Notice>` : ""}
      <Box display="flex" justifyContent="flex-end">
        <Button action="create-drain">Create</Button>
      </Box>
    </Page>
  `;
};
