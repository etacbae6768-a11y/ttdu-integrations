module.exports = function (RED) {
  function TtduConfig(n) {
    RED.nodes.createNode(this, n);
    this.target = n.target === 'hub' ? 'hub' : 'local';
    this.baseUrl = n.baseUrl || '';
  }
  RED.nodes.registerType('ttdu-config', TtduConfig, { credentials: { apiKey: { type: 'password' } } });
};
