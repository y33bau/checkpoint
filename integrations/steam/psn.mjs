import { durationMinutes, playedGames } from '../consoles/psn-history.mjs';

const onlineIdPattern = /^[A-Za-z][A-Za-z0-9_-]{2,15}$/;
const pageLimit = 30;

export const psnLimits = {
  psnLibrary: { max: 6, window: 600 },
  psnShared: { max: 40, window: 60 },
};

export function psnReady(env) {
  return Boolean(env.PSN_NPSSO) && onlineIdPattern.test(env.PSN_SERVICE_ONLINE_ID ?? '');
}

export function createPsnLibrary(overLimit, loadApi = () => import('psn-api')) {
  let authorization;
  let pending;

  async function authorize(api, env) {
    if (authorization?.secret === env.PSN_NPSSO && Date.now() < authorization.expiresAt) {
      return authorization.tokens;
    }
    if (pending) return pending;
    pending = (async () => {
      let tokens;
      if (authorization?.secret === env.PSN_NPSSO && authorization.tokens.refreshToken) {
        try {
          tokens = await api.exchangeRefreshTokenForAuthTokens(authorization.tokens.refreshToken);
        } catch {
          authorization = undefined;
        }
      }
      if (!tokens?.accessToken) {
        const code = await api.exchangeNpssoForAccessCode(env.PSN_NPSSO);
        tokens = await api.exchangeAccessCodeForAuthTokens(code);
      }
      if (!tokens?.accessToken) throw Error('PlayStation authorization unavailable');
      authorization = {
        secret: env.PSN_NPSSO,
        tokens,
        expiresAt: Date.now() + Math.max(0, (tokens.expiresIn || 0) - 30) * 1000,
      };
      return tokens;
    })().finally(() => { pending = undefined; });
    return pending;
  }

  return async function psnLibrary(request, env, reply, origin) {
    if (!origin) return reply({ error: 'origin_not_allowed' }, 403);
    if (!psnReady(env)) {
      return reply({ error: 'psn_not_configured' }, 503);
    }
    // Cloudflare sets Content-Length for the small JSON body sent by the client.
    const bodyLength = Number(request.headers.get('Content-Length'));
    if (bodyLength > 128) return reply({ error: 'invalid_id' }, 400);
    let input;
    try { input = await request.json(); }
    catch { return reply({ error: 'invalid_id' }, 400); }
    const onlineId = typeof input?.onlineId === 'string' ? input.onlineId.trim() : '';
    if (!onlineIdPattern.test(onlineId)) return reply({ error: 'invalid_id' }, 400);
    const lookupId = onlineId.toLowerCase();
    if (lookupId === env.PSN_SERVICE_ONLINE_ID.toLowerCase()) return reply({ error: 'profile_unavailable' }, 404);
    if (await overLimit(env, 'psnLibrary', request) || await overLimit(env, 'psnShared')) {
      return reply({ error: 'rate_limited' }, 429);
    }

    try {
      const api = await loadApi();
      const credentials = await authorize(api, env);
      const domain = 'SocialAllAccounts';
      const search = await api.makeUniversalSearch(credentials, onlineId, domain);
      if (!Array.isArray(search?.domainResponses)) return reply({ error: 'psn_unavailable' }, 502);
      const profiles = search.domainResponses.find(response => response?.domain === domain)?.results ?? [];
      const profile = profiles.find(row => typeof row?.socialMetadata?.onlineId === 'string' &&
        row.socialMetadata.onlineId.toLowerCase() === lookupId)?.socialMetadata;
      if (!/^\d{1,20}$/.test(profile?.accountId ?? '')) return reply({ error: 'profile_unavailable' }, 404);

      let history;
      try {
        history = await playedGames(api, credentials, profile.accountId, pageLimit);
      } catch (error) {
        if (/forbidden|private|not found|privilege|not authori[sz]ed/i.test(error?.message ?? '')) {
          return reply({ error: 'profile_unavailable' }, 404);
        }
        throw error;
      }
      const games = new Map();
      for (const row of history.games) {
        if (!row || row.category === 'pspc_game') continue;
        const id = row.concept?.id ?? row.titleId;
        const title = row.concept?.name || row.localizedName || row.name;
        if (!id || typeof title !== 'string' || !title.trim()) continue;
        const key = String(id);
        const minutes = durationMinutes(row.playDuration);
        const prior = games.get(key);
        if (prior) {
          if (minutes !== undefined) prior.minutes = Math.max(prior.minutes ?? 0, minutes);
          continue;
        }
        games.set(key, {
          id: key, title, cover: row.localizedImageUrl || row.imageUrl,
          minutes, lastPlayed: row.lastPlayedDateTime, activity: 'played',
        });
      }
      if (!games.size) return reply({ error: 'no_games' }, 404);
      return reply({
        format: 'checkpoint-source-v1', provider: 'ps', onlineId: profile.onlineId,
        games: [...games.values()], partial: history.partial,
      });
    } catch {
      return reply({ error: 'psn_unavailable' }, 502);
    }
  };
}
