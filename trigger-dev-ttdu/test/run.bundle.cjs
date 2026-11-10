"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../ttdu-integrations/trigger-dev-ttdu/src/presets.json
var require_presets = __commonJS({
  "../ttdu-integrations/trigger-dev-ttdu/src/presets.json"(exports2, module2) {
    module2.exports = {
      A: {
        schema: "ttdu.flow/v1",
        name: "\uC99D\uBE59 \uC0AC\uC9C4 \u2192 PDF \uD55C \uBD80 (\uAC70\uB798\uCC98_\uB0A0\uC9DC)",
        vars: [
          {
            key: "client",
            label: {
              ko: "\uAC70\uB798\uCC98",
              en: "Client"
            }
          },
          {
            key: "date",
            label: {
              ko: "\uB0A0\uC9DC(YYYYMMDD)",
              en: "Date (YYYYMMDD)"
            },
            pattern: "^\\d{8}$",
            default: "today"
          }
        ],
        steps: [
          {
            tool: "image.batch",
            scope: "all",
            options: {
              auto_orient: true,
              resize: {
                long_edge: 1600
              },
              format: "jpeg",
              quality: 0.85
            },
            onlyKind: "image",
            op: "resize"
          },
          {
            tool: "pdf.from_images",
            scope: "all",
            options: {
              page_size: "a4",
              orientation: "auto",
              fit: "contain",
              margin: 18
            },
            onlyKind: "image",
            op: "to_pdf"
          },
          {
            tool: "pdf.fit_size",
            scope: "each",
            options: {
              target_bytes: 1048576,
              allow_raster: true
            },
            onlyKind: "pdf",
            op: "size",
            outName: "{client}_{date}"
          }
        ],
        expect: [
          {
            check: "page_count",
            value: "inputs"
          },
          {
            check: "max_bytes",
            value: 1048576,
            kind: "pdf"
          },
          {
            check: "format",
            value: "pdf"
          },
          {
            check: "out_name",
            template: "{client}_{date}"
          }
        ]
      },
      B: {
        schema: "ttdu.flow/v1",
        name: "\uAE09\uC5EC\uBA85\uC138\uC11C \uAC80\uC218 (\uAE09\uC5EC\uB300\uC7A5 \uD558\uB098 \u2192 4\uB300\uBCF4\uD5D8\xB7\uC18C\uB4DD\uC138 \uC7AC\uACC4\uC0B0)",
        vars: [
          {
            key: "client",
            label: {
              ko: "\uAC70\uB798\uCC98",
              en: "Client"
            }
          },
          {
            key: "date",
            label: {
              ko: "\uB0A0\uC9DC(YYYYMMDD)",
              en: "Date (YYYYMMDD)"
            },
            pattern: "^\\d{8}$",
            default: "today"
          }
        ],
        steps: [
          {
            tool: "payroll.check_kr",
            scope: "each",
            options: {
              tolerance: 0
            },
            op: "payroll_check",
            outName: "{client}_\uAE09\uC5EC\uAC80\uC218_{date}"
          }
        ],
        expect: [
          {
            check: "format",
            value: "xlsx"
          },
          {
            check: "out_name",
            template: "{client}_\uAE09\uC5EC\uAC80\uC218_{date}"
          }
        ]
      },
      C: {
        schema: "ttdu.flow/v1",
        name: "\uACE0\uAC1D \uC11C\uB958 \uAC1C\uC778\uC815\uBCF4 \uAC00\uB9AC\uAE30 (\uC8FC\uBBFC\uBC88\uD638\xB7\uC804\uD654\xB7\uACC4\uC88C)",
        steps: [
          {
            tool: "redact.pdf",
            scope: "each",
            options: {
              terms: "@pii:rrn,phone,account",
              term_box: "chars"
            },
            onlyKind: "pdf",
            op: "redact"
          },
          {
            tool: "redact.image",
            scope: "each",
            options: {
              regions: "@pii:rrn,phone,account"
            },
            onlyKind: "image",
            op: "redact"
          },
          {
            tool: "meta.strip",
            scope: "each",
            options: {},
            op: "strip_meta"
          }
        ],
        expect: [
          {
            check: "pii_absent",
            kinds: [
              "rrn",
              "phone",
              "account"
            ]
          }
        ]
      },
      HWP: {
        schema: "ttdu.flow/v1",
        name: "HWP\xB7HWPX \u2192 PDF",
        steps: [
          {
            scope: "each",
            tool: "hwp.to_pdf",
            options: {}
          }
        ]
      },
      HWP_TEXT: {
        schema: "ttdu.flow/v1",
        name: "HWP\xB7HWPX \u2192 \uD14D\uC2A4\uD2B8",
        steps: [
          {
            scope: "each",
            tool: "hwp.extract_text",
            options: {}
          }
        ]
      }
    };
  }
});

// ../ttdu-integrations/trigger-dev-ttdu/src/ttdu-client.cjs
var require_ttdu_client = __commonJS({
  "../ttdu-integrations/trigger-dev-ttdu/src/ttdu-client.cjs"(exports2, module2) {
    "use strict";
    var PRESETS = require_presets();
    var DEFAULT_URL = { local: "http://127.0.0.1:8790", hub: "https://toolsthatdontupload.com" };
    var LOCAL_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1", "[::1]", "host.docker.internal"]);
    function baseUrlOf(auth) {
      const target = auth && auth.target === "hub" ? "hub" : "local";
      const u = auth && auth.baseUrl && String(auth.baseUrl).trim() || DEFAULT_URL[target];
      return u.replace(/\/+$/, "");
    }
    function isLocalUrl(url) {
      try {
        return LOCAL_HOSTS.has(new URL(url).hostname);
      } catch {
        return false;
      }
    }
    function sniffExt(b) {
      const head = (n) => b.subarray(0, n).toString("latin1");
      if (head(4) === "%PDF") return "pdf";
      if (head(4) === "\x89PNG") return "png";
      if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpg";
      if (head(4) === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
      if (b.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]))) return /W\0o\0r\0k\0b\0o\0o\0k/.test(head(65536)) ? "xls" : "hwp";
      if (b[0] === 80 && b[1] === 75) {
        const h = head(65536);
        return h.includes("xl/") ? "xlsx" : h.includes("word/") ? "docx" : h.includes("Contents/") || h.includes("hwp") ? "hwpx" : "zip";
      }
      return "bin";
    }
    function normFiles(files) {
      const out = [];
      (Array.isArray(files) ? files : [files]).forEach((f, i) => {
        if (!f) return;
        let data = f.data !== void 0 ? f.data : f.buffer !== void 0 ? f.buffer : f;
        if (typeof data === "string") data = Buffer.from(data, "base64");
        if (!(data instanceof Uint8Array)) return;
        data = Buffer.from(data);
        let name = String(f.name || f.filename || f.fileName || "").trim();
        if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) name = (name || "file" + (i + 1)) + "." + sniffExt(data);
        out.push({ name: name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_"), data });
      });
      if (!out.length) throw new Error("TTDU: no files given");
      return out;
    }
    function resolveFlow(flow) {
      if (typeof flow === "string" && PRESETS[flow]) return PRESETS[flow];
      if (typeof flow === "string") return JSON.parse(flow);
      if (flow && typeof flow === "object") return flow;
      throw new Error("TTDU: flow must be a preset id (" + Object.keys(PRESETS).join(", ") + ") or ttdu.flow/v1 JSON");
    }
    function oneStepFlow(tool, options, scope) {
      return { schema: "ttdu.flow/v1", steps: [{ tool, scope: scope || "each", options: options || {} }] };
    }
    async function runFlow(auth, flow, files, vars, opts) {
      const url = baseUrlOf(auth) + "/v1/flows/run";
      if ((!auth || auth.target !== "hub") && !isLocalUrl(url)) throw new Error("TTDU: local target must be this PC (127.0.0.1, localhost, host.docker.internal): " + url);
      if (!auth || !auth.apiKey) throw new Error("TTDU: API key missing");
      const form = new FormData();
      form.append("flow", JSON.stringify(resolveFlow(flow)));
      form.append("vars", JSON.stringify(vars || {}));
      if (opts && opts.deliver != null) {
        if (auth.target === "hub") throw new Error("TTDU: deliver (keep results in office systems) works only with the office PC runner");
        form.append("deliver", JSON.stringify(opts.deliver));
      }
      for (const f of normFiles(files)) form.append("files", new Blob([f.data]), f.name);
      const res = await fetch(url, { method: "POST", headers: { "X-API-Key": String(auth.apiKey).trim() }, body: form, signal: AbortSignal.timeout(opts && opts.timeoutMs || 6e5) });
      const text = await res.text();
      let r = null;
      try {
        r = JSON.parse(text);
      } catch {
        r = null;
      }
      if (!res.ok || !r || r.ok !== true || !Array.isArray(r.outputs)) {
        const e = new Error("TTDU run failed (HTTP " + res.status + "): " + text.slice(0, 500));
        e.status = res.status;
        e.body = r || text;
        throw e;
      }
      return { ok: true, steps: r.steps || [], notes: r.notes || [], deliveries: r.deliveries || [], outputs: r.outputs.map((o) => ({ name: o.name, mime: o.mime, size: o.size, sha256: o.sha256, data: Buffer.from(o.base64, "base64") })) };
    }
    async function health(auth) {
      const res = await fetch(baseUrlOf(auth) + "/v1/health", { headers: { "X-API-Key": String(auth.apiKey || "").trim() }, signal: AbortSignal.timeout(1e4) });
      return { status: res.status, body: await res.text() };
    }
    module2.exports = { PRESETS, DEFAULT_URL, baseUrlOf, isLocalUrl, sniffExt, normFiles, resolveFlow, oneStepFlow, runFlow, health };
  }
});

// ../ttdu-integrations/trigger-dev-ttdu/src/run.ts
var run_exports = {};
__export(run_exports, {
  runTtdu: () => runTtdu
});
module.exports = __toCommonJS(run_exports);
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var client = require_ttdu_client();
async function runTtdu(payload, env = process.env) {
  const auth = { target: env.TTDU_TARGET === "hub" ? "hub" : "local", baseUrl: env.TTDU_URL, apiKey: env.TTDU_API_KEY };
  const pathMode = Array.isArray(payload.paths) && payload.paths.length > 0;
  if (pathMode && !payload.outDir) throw new Error("outDir is required with paths");
  if (pathMode && payload.files && payload.files.length) throw new Error("use either paths or files, not both");
  const files = [];
  if (pathMode) {
    for (const p of payload.paths) files.push({ name: import_node_path.default.basename(p), data: import_node_fs.default.readFileSync(p) });
  } else {
    for (const f of payload.files || []) {
      if (f.base64) files.push({ name: f.name, data: Buffer.from(f.base64, "base64") });
      else if (f.url) {
        const r2 = await fetch(f.url);
        if (!r2.ok) throw new Error("cannot download " + f.url + " HTTP " + r2.status);
        files.push({ name: f.name, data: Buffer.from(await r2.arrayBuffer()) });
      }
    }
  }
  const r = await client.runFlow(auth, payload.flow, files, payload.vars || {}, payload.deliver ? { deliver: payload.deliver } : void 0);
  let out;
  if (pathMode) {
    import_node_fs.default.mkdirSync(payload.outDir, { recursive: true });
    out = r.outputs.map((o) => {
      const p = import_node_path.default.join(payload.outDir, o.name);
      import_node_fs.default.writeFileSync(p, o.data);
      return { name: o.name, mime: o.mime, size: o.size, sha256: o.sha256, path: p };
    });
  } else {
    out = r.outputs.map((o) => ({ name: o.name, mime: o.mime, size: o.size, sha256: o.sha256, base64: o.data.toString("base64") }));
  }
  return { ok: true, count: out.length, target: auth.target, mode: pathMode ? "paths" : "inline", notes: r.notes, deliveries: r.deliveries || [], files: out };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runTtdu
});
