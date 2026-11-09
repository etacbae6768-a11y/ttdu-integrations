// MIT License (c) 2026 Park Jihoon (Tools That Don't Upload). Our own code; n8n-workflow is used for types only.
import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class TtduApi implements ICredentialType {
	name = 'ttduApi';

	displayName = 'TTDU API';

	icon: Icon = { light: 'file:ttdu.svg', dark: 'file:ttdu.dark.svg' };

	documentationUrl = 'https://github.com/etacbae6768-a11y/ttdu-integrations/tree/main/n8n-nodes-ttdu#readme';

	properties: INodeProperties[] = [
		{
			displayName: 'Target',
			name: 'target',
			type: 'options',
			default: 'local',
			options: [
				{ name: 'This PC (Files Stay on the PC)', value: 'local' },
				{ name: 'TTDU Hub API (Files Are Sent to the Hub)', value: 'hub' },
			],
		},
		{
			displayName: 'URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://127.0.0.1:8790',
			description:
				'This PC: http://127.0.0.1:8790 (n8n in Docker Desktop: http://host.docker.internal:8790, runner started with --allow-docker). Hub: https://toolsthatdontupload.com.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'This PC: contents of local-api-key.txt. Hub: your hub API key.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { 'X-API-Key': '={{$credentials.apiKey}}' } },
	};

	test: ICredentialTestRequest = {
		request: { baseURL: '={{$credentials.baseUrl}}', url: '/v1/health' },
	};
}
