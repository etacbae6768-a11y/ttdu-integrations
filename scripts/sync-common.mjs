// Copies the shared client and ready flows from common/ into every package that carries its own copy.
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const c = (from, to) => { fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true }); fs.copyFileSync(path.join(root, from), path.join(root, to)); console.log(from, '->', to); };
for (const dir of ['node-red-contrib-ttdu/lib', 'n8n-nodes-ttdu/lib', 'trigger-dev-ttdu/src']) { c('common/ttdu-client.cjs', dir + '/ttdu-client.cjs'); c('common/presets.json', dir + '/presets.json'); }
c('common/presets.json', 'airflow-provider-ttdu/ttdu_provider/presets.json');
// Kestra: one-file client with the presets embedded
const py = fs.readFileSync(path.join(root, 'airflow-provider-ttdu/ttdu_provider/client.py'), 'utf8');
const pre = fs.readFileSync(path.join(root, 'common/presets.json'), 'utf8');
const one = py.replace(/with open\(os\.path\.join\(os\.path\.dirname\(__file__\), "presets\.json"\), encoding="utf-8"\) as _f:\n    PRESETS: dict\[str, Any\] = json\.load\(_f\)/, () => 'PRESETS: dict[str, Any] = json.loads(r"""' + pre + '""")');
if (one === py) throw new Error('kestra client: presets anchor not found');
fs.writeFileSync(path.join(root, 'kestra-ttdu/namespace-files/ttdu_client.py'), one); console.log('client.py -> kestra-ttdu/namespace-files/ttdu_client.py');
