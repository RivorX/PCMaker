import {
  deleteSavedConfiguration,
  getSavedConfigurationUser,
  parseConfigurationId,
  privateHeaders,
  readSavedConfigurationInput,
  SavedConfigurationRequestError,
  updateSavedConfiguration,
} from "@/lib/saved-configuration-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const account = await getSavedConfigurationUser();
  if (!account.ok) return account.response;

  const { id: rawId } = await context.params;
  const id = parseConfigurationId(rawId);
  if (!id) return Response.json({ error: "Nieprawidłowy identyfikator zestawu." }, { status: 400, headers: privateHeaders });

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
    const configuration = await updateSavedConfiguration(account.userId, id, input);
    if (!configuration) return Response.json({ error: "Zapisany zestaw nie istnieje." }, { status: 404, headers: privateHeaders });
    return Response.json({ configuration }, { headers: privateHeaders });
  } catch {
    return Response.json(
      { error: "Nie udało się zaktualizować zestawu w Firebase. Spróbuj ponownie." },
      { status: 503, headers: privateHeaders },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const account = await getSavedConfigurationUser();
  if (!account.ok) return account.response;

  const { id: rawId } = await context.params;
  const id = parseConfigurationId(rawId);
  if (!id) return Response.json({ error: "Nieprawidłowy identyfikator zestawu." }, { status: 400, headers: privateHeaders });

  try {
    const deleted = await deleteSavedConfiguration(account.userId, id);
    if (!deleted) return Response.json({ error: "Zapisany zestaw nie istnieje." }, { status: 404, headers: privateHeaders });
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch {
    return Response.json(
      { error: "Nie udało się usunąć zestawu z Firebase. Spróbuj ponownie." },
      { status: 503, headers: privateHeaders },
    );
  }
}
