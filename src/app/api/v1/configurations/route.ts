import {
  createSavedConfiguration,
  getSavedConfigurationUser,
  listSavedConfigurations,
  privateHeaders,
  readSavedConfigurationInput,
  SavedConfigurationRequestError,
} from "@/lib/saved-configuration-api";

export async function GET() {
  const account = await getSavedConfigurationUser();
  if (!account.ok) return account.response;

  try {
    const configurations = await listSavedConfigurations(account.userId);
    return Response.json({ configurations }, { headers: privateHeaders });
  } catch {
    return Response.json(
      { error: "Nie udało się pobrać zapisanych zestawów. Spróbuj ponownie." },
      { status: 503, headers: privateHeaders },
    );
  }
}

export async function POST(request: Request) {
  const account = await getSavedConfigurationUser();
  if (!account.ok) return account.response;

  let input;
  try {
    input = await readSavedConfigurationInput(request);
  } catch (error) {
    if (error instanceof SavedConfigurationRequestError) {
      return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    }
    return Response.json({ error: "Nieprawidłowe dane zestawu." }, { status: 400, headers: privateHeaders });
  }

  try {
    const configuration = await createSavedConfiguration(account.userId, input);
    return Response.json({ configuration }, { status: 201, headers: privateHeaders });
  } catch (error) {
    if (error instanceof SavedConfigurationRequestError) {
      return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    }
    return Response.json(
      { error: "Nie udało się zapisać zestawu w Firebase. Spróbuj ponownie." },
      { status: 503, headers: privateHeaders },
    );
  }
}
