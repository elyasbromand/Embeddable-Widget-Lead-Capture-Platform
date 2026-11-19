// The widget bundle. Runs on a customer's page (another origin), so it must:
//  - never put tenant- or visitor-written text into HTML (textContent only, no innerHTML)
//  - never break the host page (everything inside a shadow root, errors kept to the console)
//  - never leak globals (esbuild wraps this file in an IIFE)
//
// The loader inserted this <script> with data-widget-id. document.currentScript is that tag while
// this file runs (only during the first, synchronous run, so read it right away).
const script = document.currentScript;
const widgetId = script && script.dataset.widgetId;
// The API is wherever this bundle came from, so the widget needs no configuration of its own.
const apiBase = script && new URL(script.src).origin;

const STYLES = `
  :host { all: initial; display: block; }
  form { font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d2421;
         background: #fff; border: 1px solid #d9dfdb; border-radius: 10px; padding: 18px;
         max-width: 420px; display: grid; gap: 12px; box-sizing: border-box; }
  form.dark { color: #e3e8e5; background: #1a201d; border-color: #2c3530; }
  h2 { margin: 0; font-size: 18px; }
  p { margin: 0; }
  .field { display: grid; gap: 4px; }
  label { font-weight: 600; font-size: 13px; }
  input, textarea { font: inherit; padding: 8px 10px; border: 1px solid #b9c2bd; border-radius: 6px;
                    background: transparent; color: inherit; }
  textarea { min-height: 80px; resize: vertical; }
  .error { color: #b3261e; font-size: 13px; min-height: 0; }
  form.dark .error { color: #f2b8b5; }
  button { font: inherit; font-weight: 600; padding: 9px 14px; border: 0; border-radius: 6px;
           background: var(--accent, #1f6f5c); color: #fff; cursor: pointer; justify-self: start; }
  button:disabled { opacity: 0.6; cursor: progress; }
  .status { font-size: 14px; }
  .status.ok { color: #1f6f5c; }
  .status.bad { color: #b3261e; }
  /* Honeypot: off-screen, not display:none (some bots skip hidden fields). Humans never see it. */
  .hp { position: absolute; left: -10000px; top: auto; width: 1px; height: 1px; overflow: hidden; }
`;

// Small helper: an element with a class and plain text. The ONLY way text enters the widget.
function el(tag, { className, text } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text; // never innerHTML: "<img onerror=...>" stays text
  return node;
}

// UUID v4 for the Idempotency-Key. crypto.randomUUID() needs a secure context (https), and a
// customer page might be plain http, so build it from getRandomValues, which works everywhere.
function newKey() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function render(config, root) {
  const form = el("form");
  form.noValidate = true; // the server is the one validator; its 422 messages are shown per field
  if (config.display?.theme === "dark") form.classList.add("dark");
  // accentColor is validated as #rrggbb on the server, and setProperty sets one value, so it
  // cannot inject other CSS.
  if (config.display?.accentColor) form.style.setProperty("--accent", config.display.accentColor);

  form.append(el("h2", { text: config.title }));
  if (config.description) form.append(el("p", { text: config.description }));

  const inputs = {};
  const errors = {};
  for (const field of config.fields) {
    const wrap = el("div", { className: "field" });
    const inputId = `w-${config.id}-${field.name}`;
    const label = el("label", { text: field.required ? `${field.label} *` : field.label });
    label.htmlFor = inputId;
    const input = field.type === "textarea" ? el("textarea") : el("input");
    if (field.type !== "textarea") input.type = field.type === "email" ? "email" : "text";
    input.id = inputId;
    input.name = field.name;
    input.required = field.required;
    const error = el("div", { className: "error" });
    error.id = `${inputId}-error`;
    input.setAttribute("aria-describedby", error.id);
    wrap.append(label, input, error);
    form.append(wrap);
    inputs[field.name] = input;
    errors[field.name] = error;
  }

  // Honeypot: a normal-looking field that only bots fill in. Sent as "" by real visitors.
  const hp = el("div", { className: "hp" });
  hp.setAttribute("aria-hidden", "true");
  const hpInput = el("input");
  hpInput.name = "website";
  hpInput.tabIndex = -1; // keyboard users never land on it
  hpInput.autocomplete = "off"; // password managers / autofill never fill it
  hp.append(el("label", { text: "Website" }), hpInput);
  form.append(hp);

  const button = el("button", { text: config.buttonText });
  button.type = "submit";
  const status = el("div", { className: "status" });
  status.setAttribute("role", "status"); // screen readers announce the result
  form.append(button, status);
  root.append(form);

  // Idempotency-Key rule: one key per version of the form.
  //  - a retry of the SAME data (double click, network error) reuses the key → the server
  //    returns the original row, no duplicate
  //  - any edit makes a new key → the edited data is stored, not the old row returned
  let key = null;
  form.addEventListener("input", () => {
    key = null;
  });

  function showStatus(text, kind) {
    status.textContent = text;
    status.className = `status ${kind}`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    for (const name in errors) errors[name].textContent = "";
    showStatus("", "");
    key ??= newKey();
    button.disabled = true; // one request at a time

    const fields = {};
    for (const name in inputs) fields[name] = inputs[name].value;

    let response;
    try {
      response = await fetch(`${apiBase}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ widgetId: config.id, fields, website: hpInput.value }),
        // no credentials: the API allows any origin precisely because it never uses cookies
      });
    } catch {
      // Network down, or a response the browser would not let us read (e.g. missing CORS header).
      // The server may have stored it, so the key is KEPT: trying again cannot create a duplicate.
      showStatus("Could not send. Check your connection and try again.", "bad");
      button.disabled = false;
      return;
    }

    let body = null;
    try {
      body = await response.json();
    } catch {
      // empty or non-JSON body; handled by status code below
    }

    if (response.status === 201) {
      showStatus("Thanks! Your message was sent.", "ok");
      form.reset();
      key = null; // the next submission is a new one
    } else if (response.status === 422) {
      let shown = false;
      for (const d of body?.error?.details ?? []) {
        if (errors[d.path]) {
          errors[d.path].textContent = d.message; // server text, still only as text
          shown = true;
        }
      }
      showStatus(shown ? "Please fix the marked fields." : "Some answers are not valid.", "bad");
    } else if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After")) || 60;
      showStatus(`Too many attempts. Please try again in ${seconds} seconds.`, "bad");
    } else if (response.status === 404) {
      showStatus("This form is no longer available.", "bad");
    } else {
      showStatus("Something went wrong on our side. Please try again later.", "bad");
    }
    button.disabled = false;
  });
}

async function start() {
  // Shadow root: the customer's CSS cannot restyle the form, and our CSS cannot leak out.
  const host = document.createElement("div");
  script.after(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.append(style);

  const response = await fetch(`${apiBase}/widgets/${encodeURIComponent(widgetId)}/config`);
  if (!response.ok) throw new Error(`config request failed with ${response.status}`);
  render(await response.json(), root);
}

if (!widgetId) {
  console.error("[widget] no data-widget-id on the bundle script tag");
} else {
  // A broken widget must never break the customer's page: log and show nothing.
  start().catch((err) => console.error("[widget]", err.message));
}
