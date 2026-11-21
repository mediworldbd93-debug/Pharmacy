const AI_PROXY_URL = 'https://script.google.com/macros/s/AKfycbyAWeK2mbT9ShJlqMHgsuEFwKERr3PODT3CLtdZxs4xqnmJ0qP5NbquhxhHRlSaRmws8w/exec';

async function callAiTask(task, payload) {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('লগইন করা নেই।');

  const idToken = await user.getIdToken();
  const ownerUid = APP_STATE.tenantUid || user.uid;

  const resp = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // ✅ preflight এড়াতে
    body: JSON.stringify({ idToken, ownerUid, task, payload }),
  });

  const result = await resp.json();
  if (!result.success) throw new Error(result.message || 'AI সার্ভিস ব্যর্থ হয়েছে।');
  return result;
}

// ✅ Step 3 — নির্দিষ্ট provider সরাসরি টেস্ট করার জন্য (fallback chain বাদ দিয়ে)
async function testAiProviderConnection(providerId) {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('লগইন করা নেই।');

  const idToken = await user.getIdToken();
  const ownerUid = APP_STATE.tenantUid || user.uid;

  const resp = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ idToken, ownerUid, testProvider: providerId }),
  });

  return await resp.json(); // { success, message? }
}

// ব্যবহার উদাহরণ:
// const res = await callAiTask('purchaseInvoiceReader', { imageBase64 });
// console.log(res.data.items);
