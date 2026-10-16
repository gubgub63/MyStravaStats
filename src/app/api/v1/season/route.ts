import { requireSession } from '@/lib/auth/session';
import { api, json, checkMutation, readBody } from '@/lib/auth/http';
import { readWorkspace, writeWorkspace, workspaceWriteSchema } from '@/lib/server/workspace';
import { AppError } from '@/lib/utils/errors';
export async function GET() {
  return api(async () => json(await readWorkspace((await requireSession()).athlete.id)));
}
export async function PUT(request: Request) {
  return api(async () => {
    await checkMutation(request);
    const session = await requireSession();
    const parsed = workspaceWriteSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new AppError('INVALID_REQUEST', 400);
    const { revision, season } = parsed.data;
    const saved = await writeWorkspace(session.athlete.id, revision, season);
    return saved
      ? json(saved)
      : json(
          {
            code: 'SYNC_CONFLICT',
            message: 'La saison a changé sur un autre appareil.',
            workspace: await readWorkspace(session.athlete.id),
          },
          409,
        );
  });
}
