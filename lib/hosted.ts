// Project-operated room server used by default, so nobody has to deploy a
// backend to start listening. Deploy it with `npm --prefix server run
// deploy:hosted` and set this to the printed origin. Forks that want the
// self-hosted-only behavior can set it to null.
export const HOSTED_BACKEND_URL: string | null =
  'https://soundcloud-listen-along.vladi245.workers.dev';

export function isHostedBackend(backendUrl: string | undefined): boolean {
  return Boolean(HOSTED_BACKEND_URL) && backendUrl === HOSTED_BACKEND_URL;
}
