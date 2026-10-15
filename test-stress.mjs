// Stress test sesmint — 20 parallel + 10 sequential
const BASE = "http://127.0.0.1:8800";
const KEY = "sk-4339ed2e61808a85-8yseqk-3b319500";

async function req(label) {
  try {
    const r = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: "opencode/mimo-v2.6-flash-free",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      }),
    });
    const t = await r.text();
    const ok = r.status === 200;
    console.log(`${ok ? "PASS" : "FAIL"} [${label}] HTTP ${r.status} ${ok ? t.slice(0, 60) : t.slice(0, 100)}`);
    return ok;
  } catch (e) {
    console.log(`ERROR [${label}]: ${e.message}`);
    return false;
  }
}

(async () => {
  console.log("=== 20 PARALLEL ===");
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => req(`p${i}`)));
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Result: ${results.filter(Boolean).length}/20 in ${dt}s\n`);

  console.log("=== 10 SEQUENTIAL ===");
  let ok = 0;
  for (let i = 0; i < 10; i++) {
    if (await req(`s${i}`)) ok++;
  }
  console.log(`Result: ${ok}/10\n`);

  // Stats
  const stats = await (await fetch(`${BASE}/stats`)).json();
  console.log("=== STATS ===");
  console.log(JSON.stringify(stats, null, 2));
})();
