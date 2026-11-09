const client = require('../lib/ttdu-client.cjs');

/** collect input files from msg: msg.files, msg.req.files (http in with uploads), or msg.payload Buffer + msg.filename */
function filesFromMsg(msg) {
  if (Array.isArray(msg.files) && msg.files.length) return msg.files;
  if (msg.req && Array.isArray(msg.req.files) && msg.req.files.length) return msg.req.files.map((f) => ({ name: f.originalname, data: f.buffer }));
  if (Buffer.isBuffer(msg.payload)) return [{ name: msg.filename ? String(msg.filename).split(/[\\/]/).pop() : '', data: msg.payload }];
  if (Array.isArray(msg.payload)) return msg.payload;
  throw new Error('no input files: set msg.files = [{name, data: Buffer}], or msg.payload (Buffer) + msg.filename');
}

module.exports = function (RED) {
  function TtduRun(n) {
    RED.nodes.createNode(this, n);
    const node = this;
    node.server = RED.nodes.getNode(n.server);
    node.flow = n.flow || 'C';
    node.flowJson = n.flowJson || '';
    node.vars = n.vars || '';
    node.on('input', async (msg, send, done) => {
      try {
        if (!node.server) throw new Error('no TTDU connection selected');
        const auth = { target: node.server.target, baseUrl: node.server.baseUrl, apiKey: node.server.credentials && node.server.credentials.apiKey };
        let flow = node.flow === 'custom' ? node.flowJson : node.flow;
        if (node.flow === 'msg') flow = msg.flow;
        let vars = {};
        if (node.vars) vars = JSON.parse(node.vars);
        if (msg.vars && typeof msg.vars === 'object') vars = Object.assign(vars, msg.vars);
        node.status({ fill: 'blue', shape: 'dot', text: 'running' });
        const r = await client.runFlow(auth, flow, filesFromMsg(msg), vars);
        if (msg.filename) msg.inputFilename = msg.filename;
        msg.payload = r.outputs;
        msg.filename = r.outputs[0] && r.outputs[0].name;
        msg.ttdu = { ok: r.ok, count: r.outputs.length, steps: r.steps, notes: r.notes, target: auth.target };
        node.status({ fill: 'green', shape: 'dot', text: r.outputs.length + ' file(s)' });
        send(msg); done();
      } catch (e) {
        node.status({ fill: 'red', shape: 'ring', text: 'error' });
        done(e);
      }
    });
  }
  RED.nodes.registerType('ttdu-run', TtduRun);
};
