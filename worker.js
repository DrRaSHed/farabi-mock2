/**
 * Cloudflare Worker API
 *
 * This Worker acts as a secure proxy between the web UI and GitHub Actions.  It
 * receives POST requests from your front‑end, validates an API key, and
 * dispatches a manual GitHub workflow (`workflow_dispatch`) to apply the
 * requested change.  You must configure the following environment variables
 * in your Cloudflare Worker settings:
 *
 *   GH_TOKEN      – Personal access token with repo and workflow scopes
 *   GH_OWNER      – GitHub username or organisation (e.g. "DrRaSHed")
 *   GH_REPO       – Repository name (e.g. "farabi-mock")
 *   WORKFLOW_FILE – Workflow filename, e.g. "apply_change.yml"
 *   BRANCH        – Branch to run the workflow on, e.g. "main"
 *   API_KEY       – Arbitrary secret used to authorise requests from the UI
 */

export default {
  /**
   * Handle incoming requests
   * @param {Request} request
   * @param {object} env
   */
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    // Check API key header
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== env.API_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }
    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return new Response('Invalid JSON', { status: 400 });
    }
    // Validate required fields
    const requiredFields = [
      'file_no',
      'patient_name_ar',
      'service_name',
      'service_price',
      'policy_expiry',
    ];
    for (const f of requiredFields) {
      if (!payload[f] || payload[f].toString().trim() === '') {
        return new Response(`Missing field: ${f}`, { status: 400 });
      }
    }
    // Construct workflow dispatch URL
    const owner = env.GH_OWNER;
    const repo = env.GH_REPO;
    const workflow = env.WORKFLOW_FILE;
    const ref = env.BRANCH || 'main';
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
    // Prepare body for GitHub API
    const body = {
      ref,
      inputs: payload,
    };
    // Call GitHub API
    const ghResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'farabi-mock-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!ghResp.ok) {
      const text = await ghResp.text();
      return new Response(`GitHub API error: ${ghResp.status}\n${text}`, { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};