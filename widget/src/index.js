// The widget bundle. Step 4 only proves the delivery chain (snippet → loader → this file).
// Step 9 replaces the body: fetch the config, render the form, submit.
//
// The loader inserted this <script> with data-widget-id, right after the customer's snippet.
// document.currentScript is that tag while this file runs.
const script = document.currentScript;
const widgetId = script && script.dataset.widgetId;

if (widgetId) {
  const mount = document.createElement("div");
  // textContent, never innerHTML: anything we put on a customer's page is treated as text.
  mount.textContent = `Widget ${widgetId} loaded (bundle stub; the form arrives in Step 9).`;
  script.after(mount);
} else {
  console.error("[widget] no data-widget-id on the bundle script tag");
}
