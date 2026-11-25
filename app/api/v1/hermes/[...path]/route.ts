import { handleHermes } from "../../../../../lib/hermes-http.mjs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handleHermes(request, (await context.params).path.join("/"));
}
export { handle as GET, handle as POST };
