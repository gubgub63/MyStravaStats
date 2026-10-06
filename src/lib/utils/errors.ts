export class AppError extends Error {
  constructor(
    public code: string,
    public status = 500,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
export const messages: Record<string, string> = {
  NOT_AUTHENTICATED: 'Ta session a expiré. Connecte-toi à nouveau avec Strava.',
  INVALID_SESSION: 'Ta session est invalide. Connecte-toi à nouveau.',
  OAUTH_ACCESS_DENIED: 'La connexion Strava a été annulée.',
  OAUTH_INVALID_STATE: 'La demande de connexion a expiré. Recommence depuis cette page.',
  OAUTH_CODE_MISSING: 'Strava n’a pas fourni de code de connexion.',
  STRAVA_SCOPE_MISSING: 'Autorise la lecture des activités pour afficher tes statistiques.',
  OAUTH_TOKEN_EXCHANGE_FAILED: 'La connexion à Strava a échoué. Réessaie.',
  STRAVA_TOKEN_REFRESH_FAILED: 'La session Strava doit être renouvelée. Reconnecte-toi.',
  STRAVA_FORBIDDEN: 'Strava ne permet pas la lecture de ces données.',
  STRAVA_RATE_LIMIT: 'La limite de requêtes Strava est atteinte. Réessaie après le délai indiqué.',
  STRAVA_API_ERROR: 'Strava est momentanément indisponible. Réessaie plus tard.',
  CONFIGURATION_ERROR: 'La connexion Strava n’est pas encore configurée sur ce site.',
  INVALID_REQUEST: 'La demande est invalide.',
  CSRF_REJECTED: 'Cette demande doit être effectuée depuis le site.',
};
export function asAppError(error: unknown): AppError {
  return error instanceof AppError ? error : new AppError('STRAVA_API_ERROR', 502);
}
