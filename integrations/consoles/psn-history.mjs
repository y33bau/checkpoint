export function durationMinutes(duration) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(duration));
  if (!match) return undefined;
  return Number(match[1] || 0) * 60 + Number(match[2] || 0) + Math.round(Number(match[3] || 0) / 60);
}

export async function playedGames(api, credentials, accountId, pageLimit) {
  const games = [];
  let offset = 0;
  for (let index = 0; index < pageLimit; index++) {
    const page = await api.getUserPlayedGames(credentials, accountId, { limit: 50, offset });
    if (!Array.isArray(page?.titles)) throw Error('PlayStation activity unavailable');
    games.push(...page.titles);
    if (!page.nextOffset || !page.titles.length) return { games, partial: false };
    if (!Number.isInteger(page.nextOffset) || page.nextOffset <= offset) throw Error('PlayStation repeated activity page');
    offset = page.nextOffset;
  }
  return { games, partial: true };
}
