// MIT License (c) 2026 Park Jihoon (Tools That Don't Upload). Our own code; n8n-workflow is the host runtime (types and error classes only).
import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../lib/ttdu-client.cjs') as {
	runFlow: (
		auth: { target: string; baseUrl?: string; apiKey: string },
		flow: unknown,
		files: Array<{ name: string; data: Buffer }>,
		vars: Record<string, string>,
		opts?: { deliver?: unknown },
	) => Promise<{
		ok: boolean;
		notes: unknown[];
		deliveries?: unknown[];
		outputs: Array<{ name: string; mime?: string; size: number; sha256: string; data: Buffer }>;
	}>;
};

export class Ttdu implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TTDU',
		name: 'ttdu',
		icon: { light: 'file:ttdu.svg', dark: 'file:ttdu.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{"flow " + $parameter["flow"]}}',
		description: 'Run a TTDU document flow on binary files (this PC runner or the TTDU hub)',
		defaults: { name: 'TTDU' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'ttduApi', required: true }],
		properties: [
			{
				displayName: 'Flow',
				name: 'flow',
				type: 'options',
				default: 'C',
				options: [
					{ name: 'A. Receipt Photos → One PDF', value: 'A', description: 'Named {client}_{date}.pdf, at most 1 MB' },
					{ name: 'B. Payroll Check (Korea)', value: 'B', description: 'Recalculates the 4 social insurances and income tax' },
					{ name: 'C. Redact Personal Data', value: 'C', description: 'Resident registration, phone and account numbers' },
					{ name: 'Custom Flow JSON', value: 'custom' },
					{ name: 'HWP/HWPX → PDF', value: 'HWP' },
					{ name: 'HWP/HWPX → Text', value: 'HWP_TEXT' },
				],
			},
			{
				displayName: 'Flow JSON',
				name: 'flowJson',
				type: 'json',
				default: '{}',
				displayOptions: { show: { flow: ['custom'] } },
				description: 'A ttdu.flow/v1 JSON exported from the TTDU workflows page',
			},
			{
				displayName: 'Binary Properties',
				name: 'binaryProperties',
				type: 'string',
				default: '',
				placeholder: 'data, attachment_0',
				description: 'Comma-separated binary property names to send. Empty sends all binary properties of the item.',
			},
			{
				displayName: 'Client',
				name: 'client',
				type: 'string',
				default: '',
				description: 'Flow variable "client", used by flows A and B for the result name',
			},
			{
				displayName: 'Date',
				name: 'date',
				type: 'string',
				default: '',
				placeholder: '20261106',
				description: 'Flow variable "date" (YYYYMMDD)',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Combine All Items Into One Run',
						name: 'combineItems',
						type: 'boolean',
						default: false,
						description: 'Whether to send the files of all input items in one run (for example one PDF from many items)',
					},
					{
						displayName: 'Keep Results in Office Systems (JSON)',
						name: 'deliver',
						type: 'json',
						default: '[]',
						description: 'This PC target only. Rules for office systems set up in the connectors file of the office PC runner, for example [{"to":"paperless","only":"pdf"}]. Receipts are returned in deliveries.',
					},
					{
						displayName: 'Extra Variables (JSON)',
						name: 'vars',
						type: 'json',
						default: '{}',
					},
					{
						displayName: 'Output Binary Prefix',
						name: 'prefix',
						type: 'string',
						default: 'file',
						description: 'Result files are put in prefix0, prefix1 and so on',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const cred = await this.getCredentials('ttduApi');
		const auth = { target: String(cred.target || 'local'), baseUrl: String(cred.baseUrl || ''), apiKey: String(cred.apiKey || '') };
		const out: INodeExecutionData[] = [];

		const filesOf = async (i: number) => {
			const item = items[i];
			const want = String(this.getNodeParameter('binaryProperties', i, '') || '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			const keys = want.length ? want : Object.keys(item.binary || {});
			const files: Array<{ name: string; data: Buffer }> = [];
			for (const k of keys) {
				const meta = item.binary?.[k];
				if (!meta) continue;
				files.push({ name: meta.fileName || k, data: await this.helpers.getBinaryDataBuffer(i, k) });
			}
			return files;
		};

		const run = async (i: number, files: Array<{ name: string; data: Buffer }>): Promise<INodeExecutionData> => {
			if (!files.length) throw new NodeOperationError(this.getNode(), 'No binary files to send', { itemIndex: i });
			const flowSel = this.getNodeParameter('flow', i) as string;
			let flow: unknown = flowSel;
			const opts = this.getNodeParameter('options', i, {}) as IDataObject;
			let vars: Record<string, string> = {};
			let deliver: unknown[] | undefined;
			try {
				if (flowSel === 'custom') {
					const j = this.getNodeParameter('flowJson', i);
					flow = typeof j === 'string' ? JSON.parse(j) : j;
				}
				if (opts.vars) vars = (typeof opts.vars === 'string' ? JSON.parse(opts.vars) : opts.vars) as Record<string, string>;
				if (opts.deliver) {
					const d = typeof opts.deliver === 'string' ? JSON.parse(opts.deliver) : opts.deliver;
					if (Array.isArray(d) && d.length) deliver = d;
				}
			} catch (e) {
				throw new NodeOperationError(this.getNode(), 'Invalid JSON: ' + (e as Error).message, { itemIndex: i });
			}
			const clientName = this.getNodeParameter('client', i, '') as string;
			const date = this.getNodeParameter('date', i, '') as string;
			if (clientName) vars.client = clientName;
			if (date) vars.date = date;
			let r;
			try {
				r = await client.runFlow(auth, flow, files, vars, deliver ? { deliver } : undefined);
			} catch (e) {
				throw new NodeOperationError(this.getNode(), (e as Error).message, { itemIndex: i });
			}
			const prefix = (opts.prefix as string) || 'file';
			const binary: INodeExecutionData['binary'] = {};
			for (const [k, f] of r.outputs.entries()) binary[prefix + k] = await this.helpers.prepareBinaryData(f.data, f.name, f.mime);
			return {
				json: {
					ok: r.ok,
					count: r.outputs.length,
					target: auth.target,
					notes: r.notes as IDataObject[],
					deliveries: (r.deliveries || []) as IDataObject[],
					files: r.outputs.map((f, k) => ({ name: f.name, mime: f.mime, size: f.size, sha256: f.sha256, binaryProperty: prefix + k })),
				},
				binary,
				pairedItem: { item: i },
			};
		};

		const combine = items.length > 0 && (this.getNodeParameter('options', 0, {}) as IDataObject).combineItems === true;
		if (combine) {
			let all: Array<{ name: string; data: Buffer }> = [];
			for (let i = 0; i < items.length; i++) all = all.concat(await filesOf(i));
			try {
				out.push(await run(0, all));
			} catch (e) {
				if (this.continueOnFail()) out.push({ json: { ok: false, error: (e as Error).message }, pairedItem: { item: 0 } });
				else throw new NodeOperationError(this.getNode(), e as Error);
			}
			return [out];
		}
		for (let i = 0; i < items.length; i++) {
			try {
				out.push(await run(i, await filesOf(i)));
			} catch (e) {
				if (this.continueOnFail()) {
					out.push({ json: { ok: false, error: (e as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), e as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}
