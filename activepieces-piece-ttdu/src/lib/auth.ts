import { PieceAuth, Property } from '@activepieces/pieces-framework';
import { httpClient, HttpMethod } from '@activepieces/pieces-common';
import { baseUrlOf, isLocalUrl, normAuth } from './client';

export const ttduAuth = PieceAuth.CustomAuth({
  displayName: 'TTDU connection',
  description: [
    'Office PC (recommended): the TTDU runner on this PC (`ttdu serve`). Files go only to 127.0.0.1 and never leave the PC; the runner works with the network blocked.',
    'Hub: the TTDU hub API with your API key. Files are sent to the hub to run the flow.',
    'If Activepieces runs in Docker on the same PC, use http://host.docker.internal:8790 as the address.',
  ].join('\n\n'),
  required: true,
  props: {
    target: Property.StaticDropdown({ displayName: 'Where to run', required: true, defaultValue: 'local', options: { options: [{ label: 'Office PC runner (files stay on this PC)', value: 'local' }, { label: 'TTDU hub API', value: 'hub' }] } }),
    baseUrl: Property.ShortText({ displayName: 'Address', description: 'Office PC: http://127.0.0.1:8790 (Docker: http://host.docker.internal:8790). Hub: https://toolsthatdontupload.com', required: false }),
    apiKey: PieceAuth.SecretText({ displayName: 'API key', description: 'Office PC: the contents of local-api-key.txt in the TTDU folder. Hub: your hub API key.', required: true }),
  },
  validate: async ({ auth }) => {
    const a = normAuth(auth);
    const url = baseUrlOf(a);
    if (a.target === 'local' && !isLocalUrl(url)) return { valid: false, error: 'The office PC runner must be on this PC (127.0.0.1, localhost or host.docker.internal).' };
    if (a.target !== 'local') return { valid: true };
    try {
      const r = await httpClient.sendRequest<{ ok: boolean }>({ method: HttpMethod.GET, url: url + '/v1/health', headers: { 'X-API-Key': a.apiKey } });
      return r.body && r.body.ok ? { valid: true } : { valid: false, error: 'The runner did not answer ok.' };
    } catch (e) { return { valid: false, error: 'Cannot reach the TTDU runner at ' + url + ' (is `ttdu serve` running?)' }; }
  },
});
